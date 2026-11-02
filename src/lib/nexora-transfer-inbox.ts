/**
 * Lecturas para el módulo multisede de prueba.
 * Ninguna de estas consultas modifica stock ni confirma traslados.
 * Los RPC transaccionales y las políticas del servidor son la fuente de verdad.
 */
import type { DispatchedSerial } from "./nexora-transfer-rules";

export type TransferKind = "envio" | "retorno_faltantes";
export type TransferStatus = "borrador" | "en_transito" | "pendiente_recepcion" |
  "recibido" | "recepcion_parcial" | "incidencia" | "cancelado";

interface RawTransfer {
  id: string;
  code: string;
  kind: TransferKind;
  status: TransferStatus;
  origin_site_id: string;
  destination_site_id: string;
  original_transfer_id: string | null;
  created_at: string;
  dispatched_at: string | null;
  received_at: string | null;
  notes: string | null;
}
interface RawTransferUnit {
  unit_id: string;
  receipt_status: "pendiente" | "recibido" | "no_llego";
  receipt_observation: string | null;
  is_open: boolean;
}
interface RawSerial {
  id: string;
  serial: string;
}
interface RawSite { id: string; name: string; city_id: string }
interface RawCity { id: string; name: string }

export interface TransferView extends RawTransfer {
  originLabel: string;
  destinationLabel: string;
}
export interface TransferUnitView extends DispatchedSerial {
  receiptStatus: RawTransferUnit["receipt_status"];
  observation: string;
  isOpen: boolean;
}
export interface TransferDetail {
  transfer: TransferView;
  units: TransferUnitView[];
}

type ReadResponse = { data: unknown; error: { message: string; code?: string } | null };
interface ReadQuery extends PromiseLike<ReadResponse> {
  eq(field: string, value: string): ReadQuery;
  in(field: string, values: string[]): ReadQuery;
  order(field: string, opts?: { ascending: boolean }): ReadQuery;
  limit(size: number): ReadQuery;
  single(): ReadQuery;
}
export type TransferReadClient = { from(table: string): { select(fields: string): ReadQuery } };

export class TransferModuleUnavailableError extends Error {
  constructor() {
    super("Los traslados multisede aún no están activados en el servidor.");
    this.name = "TransferModuleUnavailableError";
  }
}

const getClient = async (): Promise<TransferReadClient> =>
  (await import("@/integrations/supabase/client")).supabase as unknown as TransferReadClient;

const read = async (query: PromiseLike<ReadResponse>): Promise<unknown> => {
  let response: ReadResponse;
  try {
    response = await query;
  } catch {
    throw new Error("No hay conexión con el servidor. Los datos del traslado no han sido confirmados.");
  }
  if (response.error) {
    if (["42P01", "PGRST205"].includes(response.error.code ?? "")) {
      throw new TransferModuleUnavailableError();
    }
    throw new Error(response.error.message);
  }
  return response.data;
};

const locationLabels = (
  sites: readonly RawSite[], cities: readonly RawCity[],
): ((id: string) => string) => {
  const cityMap = new Map(cities.map(city => [city.id, city.name]));
  const siteMap = new Map(sites.map(site => [site.id, site]));
  return (id) => {
    const site = siteMap.get(id);
    if (!site) return "Sede no identificada";
    const city = cityMap.get(site.city_id);
    return city ? `${site.name} · ${city}` : site.name;
  };
};

export const buildTransferViews = (
  rows: readonly RawTransfer[], sites: readonly RawSite[], cities: readonly RawCity[],
): TransferView[] => {
  const label = locationLabels(sites, cities);
  return rows.map(row => ({
    ...row, originLabel: label(row.origin_site_id),
    destinationLabel: label(row.destination_site_id),
  }));
};

export const loadTransferInbox = async (
  clientOverride?: TransferReadClient,
): Promise<TransferView[]> => {
  const client = clientOverride ?? await getClient();
  const [raw, sites, cities] = await Promise.all([
    read(client.from("nexora_transfers")
      .select("id,code,kind,status,origin_site_id,destination_site_id,original_transfer_id,created_at,dispatched_at,received_at,notes")
      .order("created_at",{ ascending:false }).limit(100)),
    read(client.from("nexora_sites").select("id,name,city_id")),
    read(client.from("nexora_cities").select("id,name")),
  ]);
  return buildTransferViews(
    (raw ?? []) as RawTransfer[], (sites ?? []) as RawSite[], (cities ?? []) as RawCity[],
  );
};

export const loadTransferDetail = async (
  transfer: TransferView, clientOverride?: TransferReadClient,
): Promise<TransferDetail> => {
  const client = clientOverride ?? await getClient();
  const raw = await read(client.from("nexora_transfer_units")
    .select("unit_id,receipt_status,receipt_observation,is_open")
    .eq("transfer_id",transfer.id).limit(501));
  const records = (raw ?? []) as RawTransferUnit[];
  if (records.length > 500) throw new Error("El traslado excede el máximo permitido de 500 IMEI.");
  const ids = records.map(record => record.unit_id);
  if (ids.length !== new Set(ids).size) throw new Error("El documento tiene IMEI duplicados.");
  if (ids.length === 0) return { transfer, units: [] };
  const rawUnits = await read(client.from("bodega_units")
    .select("id,serial").in("id",ids).limit(501));
  const serialMap = new Map(((rawUnits ?? []) as RawSerial[]).map(u => [u.id,u.serial]));
  if (serialMap.size !== ids.length || ids.some(id => !serialMap.get(id))) {
    throw new Error("No es posible verificar todos los IMEI del traslado. No confirmes este documento.");
  }
  return {
    transfer,
    units: records.map(record => ({
      unitId: record.unit_id,
      serial: serialMap.get(record.unit_id)!,
      receiptStatus: record.receipt_status,
      observation: record.receipt_observation ?? "",
      isOpen: record.is_open,
    })),
  };
};
