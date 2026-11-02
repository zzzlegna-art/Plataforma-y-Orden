/**
 * Nexora POS · una venta atómica por IMEI y pago completo.
 * El navegador nunca modifica inventario, caja ni ventas directamente.
 * requestId se conserva entre reintentos para garantizar idempotencia.
 */
export type RetailPayment = "efectivo" | "transferencia";
export interface RetailReceipt {
  saleId: string;
  serial: string;
  price: number;
  paymentMethod: RetailPayment;
  soldAt: string;
  replayed: boolean;
}
export interface RetailSaleInput {
  requestId: string;
  siteId: string;
  serial: string;
  price: number;
  paid: number;
  paymentMethod: RetailPayment;
}

export const retailPaymentLabel: Record<RetailPayment,string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia bancaria",
};
export const validateRetailSale = (sale: RetailSaleInput): string | null => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sale.requestId))
    return "La solicitud debe contar con un identificador único.";
  if (!sale.siteId) return "Selecciona un local comercial.";
  if (!sale.serial.trim() || sale.serial.trim().length > 160)
    return "Escribe un IMEI válido.";
  if (!Number.isSafeInteger(sale.price) || sale.price <= 0)
    return "Introduce un precio de venta entero y positivo en COP.";
  if (sale.paid !== sale.price) return "El pago debe cubrir el precio completo.";
  if (sale.paymentMethod !== "efectivo" && sale.paymentMethod !== "transferencia")
    return "Selecciona efectivo o transferencia.";
  return null;
};

export const parseRetailReceipt = (value: unknown): RetailReceipt => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Comprobante POS inválido.");
  const r = value as Record<string,unknown>;
  if (typeof r.saleId !== "string" || typeof r.serial !== "string" ||
    typeof r.price !== "number" || !Number.isFinite(r.price) ||
    (r.paymentMethod !== "efectivo" && r.paymentMethod !== "transferencia") ||
    typeof r.soldAt !== "string" || typeof r.replayed !== "boolean")
    throw new Error("El servidor no confirmó todos los datos del comprobante.");
  return {
    saleId:r.saleId,serial:r.serial,price:r.price,
    paymentMethod:r.paymentMethod,soldAt:r.soldAt,replayed:r.replayed,
  };
};

export const performRetailSale = async (sale: RetailSaleInput): Promise<RetailReceipt> => {
  const issue=validateRetailSale(sale);
  if(issue)throw new Error(issue);
  const { supabase } = await import("@/integrations/supabase/client");
  const res=await (supabase as unknown as {
    rpc: (method:string,args:Record<string,unknown>)=>Promise<{
      data:unknown;error:{message:string}|null
    }>
  }).rpc("nexora_pos_sell",{
    p_request_id:sale.requestId,
    p_site_id:sale.siteId,
    p_serial:sale.serial.trim(),
    p_price:sale.price,
    p_paid:sale.paid,
    p_payment_method:sale.paymentMethod,
  });
  if(res.error)throw new Error(res.error.message);
  return parseRetailReceipt(res.data);
};
