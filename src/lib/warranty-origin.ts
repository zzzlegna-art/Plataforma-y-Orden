import type { Order, Warranty } from "./types";
import { garantiaSinImeiPendiente } from "./warranty-pending-imei";

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
  // La recepción con código temporal nació en «Por IMEI», no como venta previa.
  if (garantiaSinImeiPendiente(warranty)) return "normal";
  // imeiManual identifica el origen previo incluso después de dar de alta el serial en inventario.
  if (warranty.imeiManual) return "previa";
  if (warranty.unitId && !order && !warranty.orderId && !warranty.customerId && !warranty.clienteManual?.trim()) {
    return "falla_inventario";
  }
  return "normal";
};
