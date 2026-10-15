import type { Order, Warranty } from "./types";

/**
 * Por dónde entró la garantía:
 * - normal: equipo vendido en la plataforma (por IMEI o por pedido).
 * - previa: equipo vendido antes de la plataforma (datos manuales, sin unidad).
 * - falla_inventario: equipo de bodega/local que falló sin haberse vendido.
 *
 * Se deduce de los datos del caso, así que también aplica a garantías ya registradas.
 */
export type WarrantyOrigin = "normal" | "previa" | "falla_inventario";

export const getWarrantyOrigin = (warranty: Warranty, order?: Order): WarrantyOrigin => {
  if (!warranty.unitId && warranty.imeiManual) return "previa";
  if (warranty.unitId && !order && !warranty.orderId && !warranty.customerId) {
    return "falla_inventario";
  }
  return "normal";
};
