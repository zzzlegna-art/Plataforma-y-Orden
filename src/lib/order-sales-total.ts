import type { OrderView } from "./selectors";

/**
 * Valor comercial asociado al pedido.
 * Los cancelados no registran una venta; los preparados/en preparación son estimados.
 * Las líneas son la fuente del total cuando existen; mantenemos el total almacenado
 * como respaldo para pedidos antiguos que no tengan detalles disponibles.
 */
export const getOrderSalesTotal = (view: OrderView): number | null => {
  if (view.order.status === "cancelado") return null;
  if (view.lines.length === 0) return view.order.total;
  return view.lines.reduce((sum, line) => sum + line.item.subtotal, 0);
};

export const isEstimatedOrderTotal = (view: OrderView): boolean =>
  view.order.status === "en_preparacion" || view.order.status === "preparado";
