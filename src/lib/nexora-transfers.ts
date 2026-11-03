/**
 * Nexora Multisede · Control de custodia, independiente del stock comercial.
 * Toda transición es RPC y el servidor verifica rol, IMEI, sede y estado.
 */
export type TransferStatus = "draft" | "in_transit" | "awaiting_returns" | "closed" | "cancelled";
export type TransferLineState = "prepared" | "in_transit" | "received" | "return_pending" | "returned" | "cancelled";
export interface NexoraTransfer {
  id: string;
  number: number;
  originSiteId: string;
  destinationSiteId: string;
  status: TransferStatus;
  note: string | null;
  createdAt: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
}
export interface NexoraTransferLine {
  id: string;
  unitId: string;
  serial: string;
  state: TransferLineState;
}
export interface TransferReturnDocument {
  id: string;
  expectedCount: number;
  status: "pending" | "completed";
  createdAt: string;
}
export interface TransferDetail {
  lines: NexoraTransferLine[];
  returnDocument: TransferReturnDocument | null;
}

export const transferStatusLabel: Record<TransferStatus, string> = {
  draft: "Preparando envío",
  in_transit: "En tránsito",
  awaiting_returns: "Devolución pendiente",
  closed: "Cerrado",
  cancelled: "Cancelado",
};
export const lineStatusLabel: Record<TransferLineState, string> = {
  prepared: "Por despachar",
  in_transit: "En tránsito",
  received: "Recibido en destino",
  return_pending: "Faltante · retorno pendiente",
  returned: "Retorno físico comprobado",
  cancelled: "Cancelado",
};

export const parseTransferSerials = (input: string): string[] =>
  input.split(/[\n,;]+/g).map((serial) => serial.trim()).filter(Boolean);

export const validateTransferSerials = (
  serials: readonly string[],
  allowEmpty = false,
): string | null => {
  if (!allowEmpty && serials.length === 0) return "Escribe o escanea al menos un IMEI.";
  if (serials.length > 100) return "Cada operación admite máximo 100 IMEI.";
  if (serials.some((s) => s.length > 160))
    return "Uno de los IMEI supera la longitud permitida.";
  const normalized = serials.map((s) => s.trim().toLocaleLowerCase("en-US"));
  if (new Set(normalized).size !== normalized.length)
    return "Hay IMEI duplicados en la lista.";
  return null;
};

export const getReceivingSummary = (
  lines: readonly NexoraTransferLine[],
  enteredSerials: readonly string[],
): { received: number; missing: number; invalidSerials: string[] } => {
  const expected = new Set(lines.filter((l) => l.state === "in_transit").map((l) => l.serial.toLowerCase()));
  const invalidSerials = enteredSerials.filter((s) => !expected.has(s.toLowerCase()));
  return {
    received: enteredSerials.length,
    missing: Math.max(0, expected.size - enteredSerials.length),
    invalidSerials,
  };
};

type Row = Record<string, unknown>;
type Response<T> = { data: T | null; error: { message: string } | null };
type Query = PromiseLike<Response<Row[]>> & {
  eq: (field: string, value: string) => Query;
  order: (field: string, opts?: { ascending?: boolean }) => Query;
  limit: (max: number) => Query;
};
type Table = { select: (columns: string) => Query };
const from = async (name: string): Promise<Table> => {
  const { supabase } = await import("@/integrations/supabase/client");
  return (supabase as unknown as { from: (table: string) => Table }).from(name);
};

const checked = <T>(result: Response<T>): T => {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("El servidor no devolvió datos.");
  return result.data;
};
const str = (v: unknown) => typeof v === "string" ? v : "";
const optional = (v: unknown) => typeof v === "string" ? v : null;
const count = (v: unknown) => {
  const value = Number(v);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Conteo de traslado inválido.");
  return value;
};

const readTransfer = (r: Row): NexoraTransfer => ({
  id: str(r.id),
  number: count(r.transfer_number),
  originSiteId: str(r.origin_site_id),
  destinationSiteId: str(r.destination_site_id),
  status: r.status as TransferStatus,
  note: optional(r.note),
  createdAt: str(r.created_at),
  dispatchedAt: optional(r.dispatched_at),
  receivedAt: optional(r.received_at),
});

/** El servidor comparte solo el indicador de acta aprobada con el personal activo. */
export const getNexoraTransferReadiness = async (): Promise<boolean> => {
  const { supabase } = await import("@/integrations/supabase/client");
  const response = await (supabase as unknown as {
    rpc: (name: string) => Promise<Response<unknown>>;
  }).rpc("nexora_transfer_readiness");
  const raw = checked(response);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)
    || typeof (raw as Row).isApproved !== "boolean") {
    throw new Error("El servidor no confirmó la aprobación inicial para traslados.");
  }
  return (raw as Row).isApproved as boolean;
};

export const listNexoraTransfers = async (): Promise<NexoraTransfer[]> => {
  const t = await from("nexora_transfers");
  return checked(await t.select("*").order("created_at", { ascending: false }).limit(40))
    .map(readTransfer);
};

export const getNexoraTransferDetail = async (transferId: string): Promise<TransferDetail> => {
  const [lines, returns] = await Promise.all([
    from("nexora_transfer_lines"), from("nexora_transfer_return_documents"),
  ]);
  const [found, doc] = await Promise.all([
    lines.select("*").eq("transfer_id", transferId).order("serial_snapshot"),
    returns.select("*").eq("transfer_id", transferId).limit(1),
  ]);
  const rows = checked(found);
  const docs = checked(doc);
  return {
    lines: rows.map((r) => ({
      id: str(r.id),
      unitId: str(r.unit_id),
      serial: str(r.serial_snapshot),
      state: r.state as TransferLineState,
    })),
    returnDocument: docs.length ? {
      id: str(docs[0].id),
      expectedCount: count(docs[0].expected_count),
      status: docs[0].status as "pending" | "completed",
      createdAt: str(docs[0].created_at),
    } : null,
  };
};

export type TransferAction = "create" | "edit" | "dispatch" | "receive" | "return" | "cancel";
export interface TransferActionResponse {
  transferId: string;
  status: TransferStatus;
  number?: number;
  units?: number;
  sent?: number;
  received?: number;
  missing?: number;
  returnedNow?: number;
  remaining?: number;
  returnDocumentCreated?: boolean;
}

export const runNexoraTransferAction = async (params: {
  action: TransferAction;
  transferId?: string;
  origin?: string;
  destination?: string;
  serials?: readonly string[];
  note?: string;
}): Promise<TransferActionResponse> => {
  const serials = [...(params.serials ?? [])];
  const error = validateTransferSerials(
    serials,
    params.action === "receive" || params.action === "dispatch" || params.action === "cancel",
  );
  if (error) throw new Error(error);
  if (params.action === "create" && (!params.origin || !params.destination || params.origin === params.destination))
    throw new Error("Selecciona dos sedes distintas.");
  if ((params.action === "create" || params.action === "edit") && (params.note?.length ?? 0) > 300)
    throw new Error("La observación no puede superar 300 caracteres.");
  if (params.action === "edit" && !params.transferId)
    throw new Error("Selecciona un borrador para corregirlo.");
  const { supabase } = await import("@/integrations/supabase/client");
  const response = await (supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<Response<unknown>>;
  }).rpc("nexora_transfer_action", {
    p_action: params.action,
    p_transfer_id: params.transferId ?? null,
    p_origin: params.origin ?? null,
    p_destination: params.destination ?? null,
    p_serials: serials,
    p_note: params.note?.trim() || null,
  });
  const row = checked(response);
  if (!row || typeof row !== "object" || Array.isArray(row))
    throw new Error("El servidor no confirmó el movimiento.");
  const result = row as Row;
  const status = str(result.status) as TransferStatus;
  if (!["draft","in_transit","awaiting_returns","closed","cancelled"].includes(status) ||
      typeof result.transferId !== "string")
    throw new Error("Respuesta del traslado inválida.");
  return {
    transferId: result.transferId,
    status,
    ...(result.number == null ? {} : { number: count(result.number) }),
    ...(result.units == null ? {} : { units: count(result.units) }),
    ...(result.sent == null ? {} : { sent: count(result.sent) }),
    ...(result.received == null ? {} : { received: count(result.received) }),
    ...(result.missing == null ? {} : { missing: count(result.missing) }),
    ...(result.returnedNow == null ? {} : { returnedNow: count(result.returnedNow) }),
    ...(result.remaining == null ? {} : { remaining: count(result.remaining) }),
    ...(typeof result.returnDocumentCreated === "boolean" ? {
      returnDocumentCreated: result.returnDocumentCreated,
    } : {}),
  };
};
