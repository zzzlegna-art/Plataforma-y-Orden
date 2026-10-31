/** Acciones sobre catálogos y productos del inventario. */

import { createId, DomainError, logAudit, nowIso } from "../db";
import { getProductTechnicalSpecsForCategory } from "../product-specs";
import { skuBaseReferencia } from "../sku-engine";
import { normalizarColor } from "../color-variants";
import type { Actor, Brand, Category, Db, Product, ProductCategory, ProductColorVariant, ProductTechnicalSpecs, ProductType, TipoRepuesto } from "../types";
import { isSameText, requireNumber, requirePermission, requireText } from "./guards";

/** SKU comercial, por categoría, tipo de repuesto, fabricante y modelo. Las colisiones reciben sufijo. */
export const generarSkuProducto = (
  db: Db,
  name: string,
  ignoreId?: string,
  reservedSkus: ReadonlySet<string> = new Set(),
  categoria?: ProductCategory,
  marca?: string,
): string => {
  const base = skuBaseReferencia({ name, categoria, marca });
  if (!base) return "";
  const taken = (sku: string) =>
    reservedSkus.has(sku.toUpperCase()) ||
    db.products.some((product) =>
      product.id !== ignoreId && product.sku.trim().toUpperCase() === sku.toUpperCase(),
    );
  if (!taken(base)) return base;
  let counter = 2;
  while (taken(base.slice(0, 35) + "-" + counter)) counter++;
  return base.slice(0, 35) + "-" + counter;
};

export const generarSkuAlEditar = (
  db: Db,
  name: string,
  categoria: ProductCategory | undefined,
  original?: Pick<Product, "id" | "name" | "sku" | "categoria" | "brandId">,
  brandId?: string,
): string => {
  if (original && original.name.trim() === name.trim() &&
      (original.categoria ?? "") === (categoria ?? "") &&
      (original.brandId ?? "") === (brandId ?? original.brandId ?? "")) {
    return original.sku;
  }
  const marca = db.brands.find((brand) => brand.id === brandId)?.name;
  return generarSkuProducto(db, name, original?.id, undefined, categoria, marca);
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
  colorVariants?: ProductColorVariant[];
  categoryId?: string;
  brandId?: string;
  categoria?: ProductCategory;
  tipoRepuesto?: TipoRepuesto;
  price: number;
  cost: number;
  minStock: number;
  isActive?: boolean;
}

/** Los nombres de color deben ser únicos dentro del modelo, nunca crean una SKU aparte. */
const validarVariantesColor = (variantes: ProductColorVariant[] | undefined): ProductColorVariant[] => {
  const nombres = new Set<string>();
  return (variantes ?? []).map((variante) => {
    const color = normalizarColor(variante.color);
    const id = color.toLocaleLowerCase("es");
    if (!color || color.length > 50 || nombres.has(id)) throw new DomainError("Color vacío, repetido o demasiado largo.");
    if (!Number.isFinite(variante.cost) || variante.cost < 0 || !Number.isFinite(variante.price) || variante.price < 0) {
      throw new DomainError("Costo y precio por color deben ser valores válidos.");
    }
    nombres.add(id);
    return { color, cost: variante.cost, price: variante.price };
  });
};

export const createProduct = (db: Db, actor: Actor, input: ProductInput): Product => {
  requirePermission(actor, "inventory.manage");
  const name = requireText(input.name, "errors.productNameRequired");
  const sku = (input.sku?.trim().toUpperCase() || generarSkuProducto(db, name, undefined, undefined, input.categoria, db.brands.find((brand) => brand.id === input.brandId)?.name)).slice(0, 40);
  if (db.products.some((product) => product.sku.trim().toUpperCase() === sku)) {
    throw new DomainError("errors.skuDuplicated");
  }
  const product: Product = {
    id: createId(),
    sku,
    name,
    description: input.description?.trim() || undefined,
    imageUrl: input.imageUrl || undefined,
    technicalSpecs: getProductTechnicalSpecsForCategory(input.categoria, input.technicalSpecs),
    colorVariants: validarVariantesColor(input.colorVariants),
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
  const sku = (input.sku?.trim().toUpperCase() || generarSkuProducto(db, name, product.id, undefined, input.categoria ?? product.categoria, db.brands.find((brand) => brand.id === input.brandId)?.name)).slice(0, 40);
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
  if (input.colorVariants !== undefined) {
    const nuevas = validarVariantesColor(input.colorVariants);
    const permitidos = new Set(nuevas.map((v) => v.color.toLocaleLowerCase("es")));
    const unidadesEnStock = db.units.some((unit) =>
      unit.productId === product.id && unit.color &&
      !["vendido", "liberado", "entregado_garantia"].includes(unit.status) &&
      !permitidos.has(unit.color.toLocaleLowerCase("es")),
    );
    const lineasPendientes = db.orderItems.some((item) =>
      item.productId === product.id && item.color &&
      db.orders.some((order) => order.id === item.orderId &&
        ["en_preparacion", "preparado"].includes(order.status)) &&
      !permitidos.has(item.color.toLocaleLowerCase("es")),
    );
    if (unidadesEnStock || lineasPendientes) {
      throw new DomainError("No puedes eliminar un color mientras tenga IMEI en stock o pedidos abiertos.");
    }
    product.colorVariants = nuevas;
  }
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
