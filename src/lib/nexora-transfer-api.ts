/**
 * Nexora Multisede - Contrato de transporte seguro.
 * No se activa ni se importa desde el menu legacy.
 * Requiere las tres migraciones validadas en staging y una autorizacion RPC
 * server-side para los cuatro roles antes de usar con personal no administrador.
 *
 * El servidor es la unica fuente de verdad. Ante perdida de conexion NO
 * asumimos exito ni editamos inventario en el navegador.
 */
import type { DispatchedSerial, TransferReceiptPlan } from "./nexora-transfer-rules";
import { buildOriginReturnRpcArgs, buildTransferReceiptRpcArgs, type OriginReturnReview } from "./nexora-transfer-rpc";

type RpcPayload = Record<string, unknown>;
type RpcError = { message: string; code?: string | null; details?: string | null };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcCaller = (name: string, payload: RpcPayload) => PromiseLike<RpcResult>;

export class MultisiteTransferError extends Error {
  constructor(message: string, readonly code?: string | null) {
    super(message);
    this.name = "MultisiteTransferError";
  }
}

export interface TransferRpcResult {
  transferId?: string;
  returnId?: string | null;
  status: string;
  idempotent: boolean;
  dispatchedCount?: number;
  receivedCount?: number;
  missingCount?: number;
  verifiedCount?: number;
  incidentCount?: number;
}

const asResponse = (data: unknown): TransferRpcResult => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new MultisiteTransferError("El servidor no confirmó el documento del traslado.");
  }
  const record = data as Record<string, unknown>;
  if (typeof record.status !== "string" || typeof record.idempotent !== "boolean") {
    throw new MultisiteTransferError("La respuesta de traslado no tiene estado de confirmación válido.");
  }
  return data as TransferRpcResult;
};

const invoke = async (rpc: RpcCaller, name: string, payload: RpcPayload) => {
  let response: RpcResult;
  try {
    response = await rpc(name, payload);
  } catch (reason) {
    throw new MultisiteTransferError(
      "Se perdió la comunicación. Consulta el documento antes de volver a intentarlo con el mismo identificador.",
      reason instanceof Error ? reason.name : undefined,
    );
  }
  if (response.error) {
    if (response.error.code === "PGRST202") {
      throw new MultisiteTransferError("Los traslados multisede todavía no están habilitados en el servidor.", response.error.code);
    }
    throw new MultisiteTransferError(response.error.message, response.error.code);
  }
  return asResponse(response.data);
};

/** Dependencia inyectable para pruebas; no se carga Supabase en tests. */
const fromSupabase = async (): Promise<RpcCaller> => {
  const { supabase } = await import("@/integrations/supabase/client");
  return (name, payload) =>
    (supabase as unknown as { rpc: RpcCaller }).rpc(name, payload);
};

export const dispatchMultisiteTransfer = async ({
  transferId, originSiteId, destinationSiteId, unitIds, rpc,
}: {
  transferId: string;
  originSiteId: string;
  destinationSiteId: string;
  unitIds: readonly string[];
  rpc?: RpcCaller;
}): Promise<TransferRpcResult> => {
  if (!transferId || !originSiteId || !destinationSiteId || originSiteId === destinationSiteId ||
      unitIds.length < 1 || new Set(unitIds).size !== unitIds.length) {
    throw new MultisiteTransferError("Selecciona dos sedes diferentes y una lista de IMEI sin duplicados.");
  }
  const result = await invoke(rpc ?? await fromSupabase(), "nexora_dispatch_transfer", {
    p_transfer_id: transferId,
    p_origin: originSiteId,
    p_destination: destinationSiteId,
    p_unit_ids: [...unitIds],
  });
  if (result.transferId !== transferId) {
    throw new MultisiteTransferError("El documento confirmado no coincide con el despacho solicitado.");
  }
  return result;
};

export const receiveMultisiteTransfer = async ({
  transferId, dispatched, plan, rpc,
}: {
  transferId: string;
  dispatched: readonly DispatchedSerial[];
  plan: TransferReceiptPlan;
  rpc?: RpcCaller;
}): Promise<TransferRpcResult> => {
  const payload = buildTransferReceiptRpcArgs(transferId, dispatched, plan);
  const result = await invoke(rpc ?? await fromSupabase(), "nexora_receive_transfer", payload);
  if (result.transferId !== transferId || !["recibido", "recepcion_parcial"].includes(result.status) ||
      result.receivedCount !== plan.receivedCount || result.missingCount !== plan.missingCount) {
    throw new MultisiteTransferError("La recepción no coincide con el acta del traslado; verifica el documento.");
  }
  return result;
};

export const verifyMultisiteOriginReturn = async ({
  returnId, pendingUnits, review, rpc,
}: {
  returnId: string;
  pendingUnits: readonly DispatchedSerial[];
  review: readonly OriginReturnReview[];
  rpc?: RpcCaller;
}): Promise<TransferRpcResult> => {
  const payload = buildOriginReturnRpcArgs(returnId, pendingUnits, review);
  const result = await invoke(rpc ?? await fromSupabase(), "nexora_verify_origin_return", payload);
  const verified = review.filter((item) => item.found).length;
  const incidents = review.length - verified;
  if (result.returnId !== returnId || !["recibido", "incidencia"].includes(result.status) ||
      (!result.idempotent &&
       (result.verifiedCount !== verified || result.incidentCount !== incidents))) {
    throw new MultisiteTransferError("La verificación del origen no coincide con el documento guardado.");
  }
  return result;
};
