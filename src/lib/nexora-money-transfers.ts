/** Nexora V4 · traslados monetarios internos. Nunca se suman a ventas ni ingresos. */
export type TransferStatus = "sent" | "received" | "reconciled";
export type TransferAction = "send" | "receive" | "reconcile";
export interface MoneyTransfer {
  id: string;
  originSiteId: string;
  destinationSiteId: string;
  originAccount: string;
  destinationAccount: string;
  amount: number;
  currency: "COP";
  proofReference: string;
  status: TransferStatus;
  sentAt: string;
  receivedAt: string | null;
  reconciledAt: string | null;
}
export interface MoneyTransferDraft {
  originSiteId: string;
  destinationSiteId: string;
  originAccount: string;
  destinationAccount: string;
  amount: number;
  proofReference: string;
}
const object = (value: unknown): Record<string,unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Respuesta monetaria inválida.");
  return value as Record<string,unknown>;
};
export const validateMoneyTransfer = (data: MoneyTransferDraft): string | null => {
  if (!data.originSiteId || !data.destinationSiteId || data.originSiteId === data.destinationSiteId)
    return "Selecciona dos sedes distintas.";
  if (data.originAccount.trim().length < 3 || data.originAccount.trim().length > 120 ||
      data.destinationAccount.trim().length < 3 || data.destinationAccount.trim().length > 120)
    return "Indica cuentas de origen y destino entre 3 y 120 caracteres.";
  if (!Number.isFinite(data.amount) || data.amount <= 0 || data.amount > 999999999999.99 ||
      Math.round(data.amount*100)/100 !== data.amount)
    return "Escribe un importe COP positivo, con máximo dos decimales.";
  if (data.proofReference.trim().length < 5 || data.proofReference.trim().length > 250)
    return "El comprobante debe contener entre 5 y 250 caracteres.";
  return null;
};
export const parseMoneyTransfer = (value: unknown): MoneyTransfer => {
  const r = object(value);
  const status = r.status;
  if (typeof r.id !== "string" || typeof r.originSiteId !== "string" ||
    typeof r.destinationSiteId !== "string" || typeof r.originAccount !== "string" ||
    typeof r.destinationAccount !== "string" || typeof r.proofReference !== "string" ||
    typeof r.sentAt !== "string" || r.currency !== "COP" ||
    (status !== "sent" && status !== "received" && status !== "reconciled") ||
    typeof r.amount !== "number" || !Number.isFinite(r.amount) || r.amount <= 0 ||
    !(r.receivedAt === null || typeof r.receivedAt === "string") ||
    !(r.reconciledAt === null || typeof r.reconciledAt === "string"))
    throw new Error("Registro de transferencia incompleto o inconsistente.");
  return r as unknown as MoneyTransfer;
};
export const parseMoneyTransfers = (raw: unknown): MoneyTransfer[] => {
  if (!Array.isArray(raw) || raw.length > 100) throw new Error("Historial monetario inválido.");
  return raw.map(parseMoneyTransfer);
};
const rpc = async (method: string, params: Record<string,unknown>): Promise<unknown> => {
  const { supabase } = await import("@/integrations/supabase/client");
  const response = await (supabase as unknown as {
    rpc: (name: string,args: Record<string,unknown>) => Promise<{ data:unknown; error:{message:string}|null }>;
  }).rpc(method,params);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};
export const loadMoneyTransfers = async (): Promise<MoneyTransfer[]> =>
  parseMoneyTransfers(await rpc("nexora_money_transfer_report",{p_limit:100}));
export const sendMoneyTransfer = async (draft: MoneyTransferDraft, requestId: string): Promise<string> => {
  const err = validateMoneyTransfer(draft);
  if (err) throw new Error(err);
  const r = object(await rpc("nexora_money_transfer_action",{
    p_action:"send",p_request_id:requestId,p_origin_site_id:draft.originSiteId,
    p_destination_site_id:draft.destinationSiteId,p_origin_account:draft.originAccount.trim(),
    p_destination_account:draft.destinationAccount.trim(),p_amount:draft.amount,
    p_proof_reference:draft.proofReference.trim(),
  }));
  if (typeof r.transferId !== "string" || !["sent","received","reconciled"].includes(String(r.status)))
    throw new Error("El servidor no confirmó el registro.");
  return r.transferId;
};
export const transitionMoneyTransfer = async (
  action: "receive"|"reconcile", id: string, note: string,
): Promise<void> => {
  if (!id || note.trim().length < 5 || note.trim().length > 500)
    throw new Error("Indica una transferencia y una observación de 5 a 500 caracteres.");
  const r = object(await rpc("nexora_money_transfer_action",{
    p_action:action,p_transfer_id:id,p_note:note.trim(),
  }));
  if (r.transferId !== id || r.status !== (action==="receive"?"received":"reconciled"))
    throw new Error("El servidor no confirmó la operación.");
};
