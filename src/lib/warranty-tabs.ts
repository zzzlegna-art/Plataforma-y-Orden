import type { WarrantyStatus } from "./types";

/** Pestañas de la pantalla de Garantías. La activa viaja en la dirección: /garantias?tab=recibidos */
export const TABS_GARANTIAS = ["recibir", "recibidos", "servicio", "reenvio", "historial", "buscar"] as const;
export type TabGarantias = (typeof TABS_GARANTIAS)[number];

/** Pestaña pedida en la dirección; si falta o no es válida, la de recibir. */
export const tabDesdeParametro = (valor: string | null): TabGarantias =>
  (TABS_GARANTIAS as readonly string[]).includes(valor ?? "") ? (valor as TabGarantias) : "recibir";

/** Pestaña donde vive una garantía según su estado (para volver a la lista correcta). */
export const tabDeEstado = (estado: WarrantyStatus): TabGarantias => {
  switch (estado) {
    case "recibido":
      return "recibidos";
    case "en_servicio_tecnico":
      return "servicio";
    case "reenvio_pendiente":
      return "reenvio";
    default:
      return "historial";
  }
};
