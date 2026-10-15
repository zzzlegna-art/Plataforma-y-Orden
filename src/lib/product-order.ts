/**
 * Orden de las referencias (productos) en listas y desplegables: alfabético, sin distinguir
 * mayúsculas ni acentos y entendiendo los números ("iPhone 12" antes que "iPhone 14" y
 * "128 GB" antes que "256 GB"). Si dos nombres son iguales, desempata por SKU.
 */
const colador = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

export const compararProductos = (
  a: { name: string; sku?: string },
  b: { name: string; sku?: string },
): number => colador.compare(a.name, b.name) || colador.compare(a.sku ?? "", b.sku ?? "");

export const ordenarProductos = <T extends { name: string; sku?: string }>(productos: T[]): T[] =>
  [...productos].sort(compararProductos);
