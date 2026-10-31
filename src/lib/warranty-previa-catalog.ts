import type { Product } from "./types";

/** Solo equipos con IMEI/serial admitidos en el selector de garantía previa.
 * Los repuestos son inventario por cantidad y no se deben ofrecer aquí.
 */
export const TIPOS_EQUIPOS_GARANTIA_PREVIA = ["celular", "reloj", "tablet", "audifono"] as const;

export type TipoEquipoGarantiaPrevia = (typeof TIPOS_EQUIPOS_GARANTIA_PREVIA)[number];

export const referenciasGarantiaPrevia = (
  productos: readonly Pick<Product, "name" | "categoria">[],
  tipo: TipoEquipoGarantiaPrevia | "",
): string[] => {
  if (!tipo) return [];
  return [...new Set(
    productos
      .filter((producto) => producto.categoria === tipo)
      .map((producto) => producto.name.trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, "es"));
};
