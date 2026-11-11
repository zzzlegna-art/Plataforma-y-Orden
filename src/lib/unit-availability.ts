import type { Db } from "./types";

/**
 * Una unidad asignada a un pedido en preparación o preparado está comprometida,
 * aunque su estado físico siga siendo "en_bodega" hasta el despacho.
 */
export const unitEstaEnPedidoActivo = (db: Db, unitId: string): boolean =>
  db.orderItemUnits.some((row) => {
    if (row.unitId !== unitId) return false;
    const item = db.orderItems.find((candidate) => candidate.id === row.orderItemId);
    const order = item ? db.orders.find((candidate) => candidate.id === item.orderId) : undefined;
    return order?.status === "en_preparacion" || order?.status === "preparado";
  });
