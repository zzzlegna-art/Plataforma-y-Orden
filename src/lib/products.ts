/**
 * Utilidades de producto compartidas entre acciones (dominio) y selectores.
 * La detección de repuestos vive aquí para que la interfaz y las acciones
 * usen exactamente la misma regla.
 */

import type { Db, Product, ProductType } from "./types";

/**
 * ¿El producto es un repuesto/accesorio? Los repuestos se dan de entrada por
 * cantidad (sin serial) y no usan condición nuevo/seminuevo. Se apoya en el
 * tipo explícito del producto y, si no lo tiene, en la categoría
 * ("Accesorios"/"Repuestos").
 */
export const esProductoRepuesto = (db: Db, product?: Product): boolean => {
  if (!product) return false;
  if (product.categoria === "repuesto") return true;
  if (product.categoria) return false;
  const category = db.categories.find((item) => item.id === product.categoryId);
  return /accesorio|repuesto/i.test(category?.name ?? "");
};

/**
 * A qué grupo de clientes mayoristas pertenece un producto (ver
 * Customer.categoriaMayorista): de eso depende a qué clientes se les puede ofrecer. Cada tipo
 * de producto (Administración > Tipos de producto) trae su propio grupo; "ambos" no aplica
 * aquí (esa opción es solo del lado del cliente, que puede comprar cualquiera de los dos).
 */
export const mayoristaGroupDeProducto = (
  db: Db,
  product?: Product,
): "celulares" | "repuestos" => {
  const tipo = db.productTypes.find((item) => item.key === product?.categoria);
  if (tipo) return tipo.mayoristaGroup;
  // Producto sin tipo asignado, o con un tipo que ya no existe: por defecto se trata como
  // tecnología (el grupo más amplio), igual que se hacía antes de que esto fuera configurable.
  return esProductoRepuesto(db, product) ? "repuestos" : "celulares";
};

/** Claves de los 5 tipos que ya existían antes de que esto fuera administrable: tienen su
 * propia traducción (productCat.*) en vez de guardar el nombre tal cual, para no perder los
 * textos ya afinados ("Celulares/Tablets/Relojes", etc. en otras pantallas). */
export const TIPOS_PRODUCTO_FIJOS: Record<string, string> = {
  celular: "productCat.celular",
  tablet: "productCat.tablet",
  reloj: "productCat.reloj",
  audifono: "productCat.audifono",
  repuesto: "productCat.repuesto",
};
/** De estos 5, cuáles no manejan condición nuevo/seminuevo. Cualquier tipo nuevo creado desde
 * Administración sí la maneja (como celular), según se decidió. */
export const TIPOS_SIN_CONDICION = new Set(["reloj", "repuesto"]);

/** Etiqueta para mostrar un tipo de producto: la traducción ya afinada si es uno de los 5 de
 * siempre, o el nombre tal cual se escribió si es uno nuevo. */
export const etiquetaTipoProducto = (t: (clave: string) => string, tipo: ProductType): string =>
  TIPOS_PRODUCTO_FIJOS[tipo.key] ? t(TIPOS_PRODUCTO_FIJOS[tipo.key]) : tipo.name;

/**
 * Los tipos de producto ordenados para mostrar en un filtro o selector: primero los 5 de
 * siempre (en su orden de siempre), y cualquier tipo nuevo después, alfabético.
 */
export const tiposProductoOrdenados = (db: Db): ProductType[] => {
  const fijos = Object.keys(TIPOS_PRODUCTO_FIJOS)
    .map((key) => db.productTypes.find((tipo) => tipo.key === key))
    .filter((tipo): tipo is ProductType => Boolean(tipo));
  const nuevos = db.productTypes
    .filter((tipo) => !TIPOS_PRODUCTO_FIJOS[tipo.key])
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...fijos, ...nuevos];
};
