/**
 * Consulta de elegibilidad de un IMEI para el POS futuro.
 * Nunca vende, reserva, abre caja, ni activa permisos.
 */
export interface PosPreflight {
  eligibleForFuturePos: boolean;
  saleEnabled: false;
  reason: string;
  siteName: string | null;
  serial: string;
  status: string | null;
  unitCost: number | null;
  proposedPrice: number;
}
export const POS_REASON_LABEL: Record<string, string> = {
  INVENTORY_NOT_APPROVED: "Primero debe aprobarse el inventario inicial.",
  INVALID_STORE: "Selecciona un local comercial activo.",
  IMEI_NOT_FOUND: "No se encontró ese IMEI en inventario.",
  WRONG_SITE_OR_TRANSIT: "El IMEI está en otra sede, en tránsito o en retorno pendiente.",
  NOT_RETAIL_STOCK: "El IMEI no está en un estado apto para venta de local.",
  IMEI_COMMITTED: "Este IMEI ya está comprometido en un pedido o traslado.",
  PRICE_NOT_ABOVE_COST: "El precio debe ser estrictamente superior al costo real de ese IMEI.",
  CHECKS_PASSED_POS_NOT_ENABLED:
    "Las comprobaciones pasaron. La venta permanece bloqueada hasta activar POS y caja.",
};
export const validatePosPreflight = (
  siteId: string, serial: string, price: number,
): string | null => {
  if (!siteId) return "Selecciona un local comercial.";
  if (serial.trim().length === 0 || serial.trim().length > 160)
    return "Escribe un IMEI válido.";
  if (!Number.isFinite(price) || price <= 0)
    return "Escribe un precio de venta positivo.";
  return null;
};
export const parsePosPreflight = (value: unknown): PosPreflight => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("El servidor devolvió una evaluación POS inválida.");
  const row = value as Record<string, unknown>;
  if (typeof row.eligibleForFuturePos !== "boolean" ||
      row.saleEnabled !== false ||
      typeof row.reason !== "string" ||
      typeof row.serial !== "string" ||
      typeof row.proposedPrice !== "number" ||
      !Number.isFinite(row.proposedPrice)) {
    throw new Error("Faltan datos críticos en la comprobación POS.");
  }
  return {
    eligibleForFuturePos: row.eligibleForFuturePos,
    saleEnabled: false,
    reason: row.reason,
    siteName: typeof row.siteName === "string" ? row.siteName : null,
    serial: row.serial,
    status: typeof row.status === "string" ? row.status : null,
    unitCost: typeof row.unitCost === "number" ? row.unitCost : null,
    proposedPrice: row.proposedPrice,
  };
};
export const runPosPreflight = async (
  siteId: string, serial: string, price: number,
): Promise<PosPreflight> => {
  const issue = validatePosPreflight(siteId, serial, price);
  if (issue) throw new Error(issue);
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await (supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) =>
      Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("nexora_pos_preflight", {
    p_site_id: siteId, p_serial: serial.trim(), p_price: price,
  });
  if (error) throw new Error(error.message);
  return parsePosPreflight(data);
};
