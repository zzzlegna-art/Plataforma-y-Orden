import type { OrderStatus } from "./types";

/**
 * El vínculo a un pedido no implica venta ni salida física.
 * Solo preparación y preparado retienen comercialmente el IMEI.
 */
export const describeImeiOrderAssociation = (status: OrderStatus): {
  label: string;
  assigned: boolean;
  note: string;
} => {
  switch (status) {
    case "en_preparacion":
      return {
        label: "Asignado a pedido · En preparación",
        assigned: true,
        note: "IMEI reservado para este pedido; no disponible para asignarlo a otro.",
      };
    case "preparado":
      return {
        label: "Asignado a pedido · Preparado",
        assigned: true,
        note: "IMEI comprometido con este pedido, pendiente de despacho físico.",
      };
    case "despachado":
      return {
        label: "Vendido · Venta confirmada en pedido",
        assigned: false,
        note: "La venta y la salida quedaron confirmadas; este IMEI pertenece al historial del pedido.",
      };
    case "cancelado":
      return {
        label: "Pedido cancelado",
        assigned: false,
        note: "La relación con el pedido es histórica; no debe bloquear nuevas asignaciones.",
      };
  }
};
