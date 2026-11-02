import type { DispatchReadClient } from "./nexora-transfer-dispatch";

type QueryResult = { data: unknown; error: { message: string; code?: string } | null };
interface DispatchStatusQuery extends PromiseLike<QueryResult> {
  eq(field: string, value: string): DispatchStatusQuery;
  limit(size: number): DispatchStatusQuery;
  maybeSingle(): DispatchStatusQuery;
}
export type DispatchStatusClient = {
  from(table: string): { select(fields: string): DispatchStatusQuery };
};

export type CheckedDispatchStatus =
  | { result: "absent" }
  | { result: "confirmed"; code: string; status: string };

/** Tras una respuesta perdida nunca reenviar a ciegas: verificar primero el UUID. */
export const checkDispatchOperation = async ({
  transferId, originId, destinationId, unitIds, client,
}: {
  transferId: string;
  originId: string;
  destinationId: string;
  unitIds: readonly string[];
  client?: DispatchStatusClient;
}): Promise<CheckedDispatchStatus> => {
  if (!transferId || !originId || !destinationId || !unitIds.length ||
    new Set(unitIds).size !== unitIds.length) {
    throw new Error("Los datos de la operación no están completos.");
  }
  const api = client ?? (await import("@/integrations/supabase/client")).supabase as unknown as DispatchStatusClient;
  let doc: QueryResult;
  try {
    doc = await api.from("nexora_transfers")
      .select("id,code,kind,status,origin_site_id,destination_site_id")
      .eq("id",transferId).maybeSingle();
  } catch {
    throw new Error("No se pudo comprobar el despacho. No intentes enviarlo nuevamente.");
  }
  if (doc.error) throw new Error("No se pudo comprobar el despacho: "+doc.error.message);
  if (doc.data == null) return { result:"absent" };
  const row=doc.data as {
    id:string;code:string;kind:string;status:string;origin_site_id:string;destination_site_id:string;
  };
  if (row.id!==transferId || row.kind!=="envio" ||
    row.origin_site_id!==originId || row.destination_site_id!==destinationId) {
    throw new Error("El servidor devolvió un documento diferente. No vuelvas a despachar.");
  }
  let units: QueryResult;
  try {
    units=await api.from("nexora_transfer_units")
      .select("unit_id").eq("transfer_id",transferId).limit(501);
  } catch {
    throw new Error("No se pudieron verificar los IMEI del documento. No repitas el envío.");
  }
  if(units.error || !Array.isArray(units.data)){
    throw new Error("No se pudieron verificar los IMEI del documento. No repitas el envío.");
  }
  const recordedIds=(units.data as {unit_id:string}[]).map(row=>row.unit_id);
  if(recordedIds.length!==unitIds.length ||
    new Set(recordedIds).size!==recordedIds.length ||
    recordedIds.some(id=>!unitIds.includes(id))) {
    throw new Error("El documento no coincide con los IMEI seleccionados. Solicita revisión del Administrador.");
  }
  if(!["en_transito","recibido","recepcion_parcial"].includes(row.status)){
    throw new Error("El servidor tiene un estado inesperado. No repitas el envío.");
  }
  return { result:"confirmed", code:row.code, status:row.status };
};

/** Type-only check to avoid inadvertent reliance on the internal Supabase client. */
export type { DispatchReadClient };
