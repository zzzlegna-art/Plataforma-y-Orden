/** Acciones sobre catálogos y productos del inventario. */

import { createId, DomainError, logAudit, nowIso } from "../db";
import { getProductTechnicalSpecsForCategory } from "../product-specs";
import type { Actor, Brand, Category, Db, Product, ProductCategory, ProductTechnicalSpecs, ProductType, TipoRepuesto } from "../types";
import { isSameText, requireNumber, requirePermission, requireText } from "./guards";

/**
 * SKU corta: modelo abreviado + almacenamiento cuando aparece en el nombre.
 * Ejemplos: "iPhone 13 128 GB" -> "IP13-128", "iPhone 14 Pro Max 256GB" -> "IP14PM-256",
 * "Samsung Galaxy S24 Ultra 256 GB" -> "S24U-256". El IMEI sigue identificando cada unidad.
 */
export const generarSkuProducto = (db: Db, name: string, ignoreId?: string): string => {
  const normalizado = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  if (!normalizado) return "";

  const capacidadMatch = normalizado.match(/\b(\d{1,4})\s*(GB|TB|MB)\b/);
  const capacidad = capacidadMatch
    ? capacidadMatch[1] + (capacidadMatch[2] === "TB" ? "T" : capacidadMatch[2] === "MB" ? "M" : "")
    : "";
  let modelo = "";

  const iphone = normalizado.match(/\bIPHONE\s*(SE|\d{1,2})\b/);
  if (iphone) {
    modelo = "IP" + iphone[1];
    if (/\bPRO\b/.test(normalizado)) modelo += /\bMAX\b/.test(normalizado) ? "PM" : "P";
    else if (/\bMAX\b/.test(normalizado)) modelo += "M";
    else if (/\bPLUS\b/.test(normalizado)) modelo += "PL";
    else if (/\bMINI\b/.test(normalizado)) modelo += "MN";
    else if (/\bAIR\b/.test(normalizado)) modelo += "A";
  } else {
    const galaxyZ = normalizado.match(/\bZ\s*(FOLD|FLIP)\s*(\d)\b/);
    const galaxyS = normalizado.match(/\bS\s*(\d{1,2})\b/);
    const galaxyA = normalizado.match(/\bA\s*(\d{1,2})\b/);
    const pixel = normalizado.match(/\bPIXEL\s*(\d{1,2})\b/);
    const redmiNote = normalizado.match(/\bNOTE\s*(\d{1,2})\b/);
    if (galaxyZ) modelo = "Z" + (galaxyZ[1] === "FOLD" ? "F" : "FL") + galaxyZ[2];
    else if (galaxyS) {
      modelo = "S" + galaxyS[1];
      if (/\bULTRA\b/.test(normalizado)) modelo += "U";
      else if (/\bFE\b/.test(normalizado)) modelo += "FE";
      else if (/\bPLUS\b/.test(normalizado)) modelo += "P";
    } else if (galaxyA) modelo = "A" + galaxyA[1];
    else if (pixel) {
      modelo = "PX" + pixel[1];
      if (/\bPRO\b/.test(normalizado)) modelo += "P";
      if (/\bXL\b/.test(normalizado)) modelo += "XL";
    } else if (redmiNote) {
      modelo = "RN" + redmiNote[1];
      if (/\bPRO\b/.test(normalizado)) modelo += "P";
    }
  }

  if (!modelo) {
    const sinCapacidad = normalizado.replace(/\b\d{1,4}\s*(GB|TB|MB)\b/g, " ");
    const palabras = sinCapacidad.split(/\s+/).filter((palabra) =>
      palabra && !["APPLE", "SAMSUNG", "GALAXY", "XIAOMI", "REDMI", "GOOGLE", "HUAWEI", "MOTOROLA", "OPPO", "VIVO", "REALME", "ONEPLUS"].includes(palabra)
    );
    const conModelo = palabras.find((palabra) => /\d/.test(palabra));
    const iniciales = palabras.filter((palabra) => palabra !== conModelo).slice(0, 2).map((palabra) => palabra.slice(0, 2)).join("");
    modelo = (iniciales + (conModelo ?? "")).slice(0, 8) || palabras[0]?.slice(0, 4) || "PROD";
  }

  const base = (modelo + (capacidad ? "-" + capacidad : "")).slice(0, 12);
  const taken = (sku: string) =>
    db.products.some((product) => product.id !== ignoreId && product.sku.trim().toUpperCase() === sku);
  if (!taken(base)) return base;

  let counter = 2;
  while (taken(base + "-" + counter)) counter += 1;
  return base + "-" + counter;
};

/**
 * Un identificador estable ("key") a partir del nombre: en minúsculas, sin espacios ni
 * acentos, para guardar en Product.categoria (por ejemplo "Parlantes bluetooth" -> "parlantes
 * bluetooth" no, sino "parlantes-bluetooth"). Si ya existe, le agrega un número.
 */
const generarKeyTipoProducto = (db: Db, name: string, ignoreId?: string) => {
  const base =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "tipo";

  const taken = (key: string) =>
    db.productTypes.some((tipo) => tipo.id !== ignoreId && tipo.key === key);

  if (!taken(base)) return base;
  let counter = 2;
  while (taken(`${base}-${counter}`)) counter += 1;
  return `${base}-${counter}`;
};

/**
 * Crea un tipo de producto nuevo (Administración > Tipos de producto). A diferencia de los 5
 * que ya había (celular/tablet/reloj/audífono/repuesto), cualquiera que se cree desde aquí
 * siempre maneja condición nuevo/seminuevo, como celular — "repuesto" sigue siendo el único
 * sin condición, eso queda fijo en el código.
 */
export const createProductType = (
  db: Db,
  actor: Actor,
  input: { name: string; mayoristaGroup: "celulares" | "repuestos" },
): ProductType => {
  requirePermission(actor, "users.manage");
  const name = requireText(input.name, "errors.productTypeNameRequired");
  if (db.productTypes.some((tipo) => isSameText(tipo.name, name))) {
    throw new DomainError("errors.productTypeDuplicated");
  }
  const tipo: ProductType = {
    id: createId(),
    key: generarKeyTipoProducto(db, name),
    name,
    mayoristaGroup: input.mayoristaGroup,
    createdAt: nowIso(),
  };
  db.productTypes.push(tipo);
  logAudit(db, actor, {
    action: "create",
    entity: "productType",
    entityId: tipo.id,
    details: tipo.name,
  });
  return tipo;
};

export const updateProductType = (
  db: Db,
  actor: Actor,
  input: { id: string; name: string; mayoristaGroup: "celulares" | "repuestos" },
): ProductType => {
  requirePermission(actor, "users.manage");
  const tipo = db.productTypes.find((item) => item.id === input.id);
  if (!tipo) throw new DomainError("errors.notFound");
  const name = requireText(input.name, "errors.productTypeNameRequired");
  if (db.productTypes.some((item) => item.id !== tipo.id && isSameText(item.name, name))) {
    throw new DomainError("errors.productTypeDuplicated");
  }
  // La "key" (lo que se guarda en cada producto) no cambia al renombrar: solo cambia la
  // etiqueta que se muestra. Cambiarla obligaría a actualizar todos los productos que ya la
  // usan, y no aporta nada.
  tipo.name = name;
  tipo.mayoristaGroup = input.mayoristaGroup;
  logAudit(db, actor, {
    action: "update",
    entity: "productType",
    entityId: tipo.id,
    details: tipo.name,
  });
  return tipo;
};

export const deleteProductType = (db: Db, actor: Actor, input: { id: string }) => {
  requirePermission(actor, "users.manage");
  const tipo = db.productTypes.find((item) => item.id === input.id);
  if (!tipo) throw new DomainError("errors.notFound");
  if (["celular", "tablet", "reloj", "audifono", "repuesto"].includes(tipo.key)) {
    throw new DomainError("errors.productTypeBuiltIn");
  }
  if (db.products.some((product) => product.categoria === tipo.key)) {
    throw new DomainError("errors.productTypeInUse");
  }
  db.productTypes = db.productTypes.filter((item) => item.id !== tipo.id);
  logAudit(db, actor, {
    action: "delete",
    entity: "productType",
    entityId: tipo.id,
    details: tipo.name,
  });
};

export const createCategory = (
  db: Db,
  actor: Actor,
  input: { name: string; description?: string },
): Category => {
  requirePermission(actor, "users.manage");
  const name = requireText(input.name, "errors.categoryNameRequired");
  if (db.categories.some((category) => isSameText(category.name, name))) {
    throw new DomainError("errors.categoryDuplicated");
  }
  const category: Category = {
    id: createId(),
    name,
    description: input.description?.trim() || undefined,
    createdAt: nowIso(),
  };
  db.categories.push(category);
  logAudit(db, actor, {
    action: "create",
    entity: "category",
    entityId: category.id,
    details: category.name,
  });
  return category;
};

export const updateCategory = (
  db: Db,
  actor: Actor,
  input: { id: string; name: string; description?: string },
): Category => {
  requirePermission(actor, "users.manage");
  const category = db.categories.find((item) => item.id === input.id);
  if (!category) throw new DomainError("errors.notFound");
  const name = requireText(input.name, "errors.categoryNameRequired");
  if (
    db.categories.some(
      (item) => item.id !== category.id && isSameText(item.name, name),
    )
  ) {
    throw new DomainError("errors.categoryDuplicated");
  }
  category.name = name;
  category.description = input.description?.trim() || undefined;
  logAudit(db, actor, {
    action: "update",
    entity: "category",
    entityId: category.id,
    details: category.name,
  });
  return category;
};

export const deleteCategory = (db: Db, actor: Actor, input: { id: string }) => {
  requirePermission(actor, "users.manage");
  const category = db.categories.find((item) => item.id === input.id);
  if (!category) throw new DomainError("errors.notFound");
  if (db.products.some((product) => product.categoryId === category.id)) {
    throw new DomainError("errors.categoryInUse");
  }
  db.categories = db.categories.filter((item) => item.id !== category.id);
  logAudit(db, actor, {
    action: "delete",
    entity: "category",
    entityId: category.id,
    details: category.name,
  });
};

export const createBrand = (
  db: Db,
  actor: Actor,
  input: { name: string },
): Brand => {
  requirePermission(actor, "users.manage");
  const name = requireText(input.name, "errors.brandNameRequired");
  if (db.brands.some((brand) => isSameText(brand.name, name))) {
    throw new DomainError("errors.brandDuplicated");
  }
  const brand: Brand = { id: createId(), name, createdAt: nowIso() };
  db.brands.push(brand);
  logAudit(db, actor, {
    action: "create",
    entity: "brand",
    entityId: brand.id,
    details: brand.name,
  });
  return brand;
};

export const updateBrand = (
  db: Db,
  actor: Actor,
  input: { id: string; name: string },
): Brand => {
  requirePermission(actor, "users.manage");
  const brand = db.brands.find((item) => item.id === input.id);
  if (!brand) throw new DomainError("errors.notFound");
  const name = requireText(input.name, "errors.brandNameRequired");
  if (db.brands.some((item) => item.id !== brand.id && isSameText(item.name, name))) {
    throw new DomainError("errors.brandDuplicated");
  }
  brand.name = name;
  logAudit(db, actor, {
    action: "update",
    entity: "brand",
    entityId: brand.id,
    details: brand.name,
  });
  return brand;
};

export const deleteBrand = (db: Db, actor: Actor, input: { id: string }) => {
  requirePermission(actor, "users.manage");
  const brand = db.brands.find((item) => item.id === input.id);
  if (!brand) throw new DomainError("errors.notFound");
  if (db.products.some((product) => product.brandId === brand.id)) {
    throw new DomainError("errors.brandInUse");
  }
  db.brands = db.brands.filter((item) => item.id !== brand.id);
  logAudit(db, actor, {
    action: "delete",
    entity: "brand",
    entityId: brand.id,
    details: brand.name,
  });
};

export interface ProductInput {
  /** Opcional: si viene vacío se genera a partir del nombre. */
  sku?: string;
  name: string;
  description?: string;
  imageUrl?: string | null;
  technicalSpecs?: ProductTechnicalSpecs | null;
  categoryId?: string;
  brandId?: string;
  categoria?: ProductCategory;
  tipoRepuesto?: TipoRepuesto;
  price: number;
  cost: number;
  minStock: number;
  isActive?: boolean;
}

export const createProduct = (db: Db, actor: Actor, input: ProductInput): Product => {
  requirePermission(actor, "inventory.manage");
  const name = requireText(input.name, "errors.productNameRequired");
  const sku = (input.sku?.trim().toUpperCase() || generarSkuProducto(db, name)).slice(0, 40);
  if (db.products.some((product) => product.sku.toUpperCase() === sku)) {
    throw new DomainError("errors.skuDuplicated");
  }
  const product: Product = {
    id: createId(),
    sku,
    name,
    description: input.description?.trim() || undefined,
    imageUrl: input.imageUrl || undefined,
    technicalSpecs: getProductTechnicalSpecsForCategory(input.categoria, input.technicalSpecs),
    categoryId: input.categoryId || undefined,
    brandId: input.brandId || undefined,
    categoria: input.categoria || undefined,
    tipoRepuesto:
      input.categoria === "repuesto" ? input.tipoRepuesto : undefined,
    price: requireNumber(input.price, "errors.invalidPrice"),
    cost: requireNumber(input.cost, "errors.invalidCost"),
    minStock: requireNumber(input.minStock, "errors.invalidMinStock"),
    isActive: input.isActive ?? true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.products.push(product);
  logAudit(db, actor, {
    action: "create",
    entity: "product",
    entityId: product.id,
    details: `${product.sku} · ${product.name}`,
  });
  return product;
};

export const updateProduct = (
  db: Db,
  actor: Actor,
  input: ProductInput & { id: string },
): Product => {
  requirePermission(actor, "inventory.manage");
  const product = db.products.find((item) => item.id === input.id);
  if (!product) throw new DomainError("errors.notFound");
  const categoriaAnterior = product.categoria;
  const name = requireText(input.name, "errors.productNameRequired");
  const sku = (input.sku?.trim().toUpperCase() || generarSkuProducto(db, name, product.id)).slice(0, 40);
  if (
    db.products.some(
      (item) => item.id !== product.id && item.sku.trim().toUpperCase() === sku,
    )
  ) {
    throw new DomainError("errors.skuDuplicated");
  }
  product.sku = sku;
  product.name = name;
  product.description = input.description?.trim() || undefined;
  if (input.imageUrl !== undefined) product.imageUrl = input.imageUrl || undefined;
  product.categoryId = input.categoryId || undefined;
  product.brandId = input.brandId || undefined;
  product.categoria = input.categoria || undefined;
  if (input.technicalSpecs !== undefined || (input.categoria !== undefined && input.categoria !== categoriaAnterior)) {
    product.technicalSpecs = getProductTechnicalSpecsForCategory(input.categoria ?? categoriaAnterior, input.technicalSpecs);
  }
  if (input.categoria === "repuesto") {
    if (input.tipoRepuesto) product.tipoRepuesto = input.tipoRepuesto;
  } else {
    product.tipoRepuesto = undefined;
  }
  product.price = requireNumber(input.price, "errors.invalidPrice");
  product.cost = requireNumber(input.cost, "errors.invalidCost");
  product.minStock = requireNumber(input.minStock, "errors.invalidMinStock");
  product.isActive = input.isActive ?? product.isActive;
  product.updatedAt = nowIso();
  logAudit(db, actor, {
    action: "update",
    entity: "product",
    entityId: product.id,
    details: `${product.sku} · ${product.name}`,
  });
  return product;
};

export const setProductActive = (
  db: Db,
  actor: Actor,
  input: { id: string; isActive: boolean },
) => {
  requirePermission(actor, "inventory.manage");
  const product = db.products.find((item) => item.id === input.id);
  if (!product) throw new DomainError("errors.notFound");
  product.isActive = input.isActive;
  product.updatedAt = nowIso();
  logAudit(db, actor, {
    action: "update",
    entity: "product",
    entityId: product.id,
    details: `${product.sku} · ${input.isActive ? "activo" : "inactivo"}`,
  });
  return product;
};

/**
 * Borra un producto de verdad (a diferencia de desactivarlo). Solo se permite si nunca tuvo
 * unidades — ni una sola, en cualquier estado — porque una unidad sin su producto dejaría
 * huérfanos el historial de movimientos, pedidos y garantías que la referencian.
 */
export const deleteProduct = (db: Db, actor: Actor, input: { id: string }) => {
  requirePermission(actor, "inventory.manage");
  const product = db.products.find((item) => item.id === input.id);
  if (!product) throw new DomainError("errors.notFound");
  const tieneUnidades = db.units.some((unit) => unit.productId === product.id);
  // También cuentan los pedidos: un pedido puede pedir una referencia antes de que existan
  // unidades (stock pendiente de recibir), y borrarla dejaría esa línea huérfana.
  const tienePedidos = db.orderItems.some((item) => item.productId === product.id);
  if (tieneUnidades || tienePedidos) {
    throw new DomainError("errors.productInUse", { sku: product.sku });
  }
  db.products = db.products.filter((item) => item.id !== product.id);
  logAudit(db, actor, {
    action: "delete",
    entity: "product",
    entityId: product.id,
    details: `${product.sku} · ${product.name}`,
  });
};
