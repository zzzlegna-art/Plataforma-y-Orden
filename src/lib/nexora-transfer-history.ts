/** Hoja de vida global de cada IMEI: incluye tránsito, recepción y retorno. */
export type MultisiteEventType =
  | "despachado" | "recepcion_confirmada" | "faltante_reportado"
  | "retorno_verificado" | "incidencia" | "incidencia_resuelta";

export interface TransferHistoryEvent {
  id: string;
  transfer_id: string;
  unit_id: string;
  event_type: string;
  details: Record<string, unknown> | null;
  created_at: string;
}
export interface TransferHistoryDocument {
  id: string;
  code: string;
  origin_site_id: string;
  destination_site_id: string;
  kind: string;
  status: string;
}
export interface TransferHistoryLocation {
  id: string;
  city_id: string;
  name: string;
}
export interface TransferHistoryCity {
  id: string;
  name: string;
}
export interface SerialMultisiteTimelineItem {
  id: string;
  transferId: string;
  documentCode: string;
  createdAt: string;
  type: MultisiteEventType;
  title: string;
  description: string;
  origin: string;
  destination: string;
  status: string;
}
const supported = new Set<MultisiteEventType>([
  "despachado","recepcion_confirmada","faltante_reportado","retorno_verificado","incidencia","incidencia_resuelta",
]);
const info = (details: Record<string, unknown> | null): string =>
  typeof details?.observation === "string" ? details.observation : "";

export const mapMultisiteSerialTimeline = (
  unitId: string,
  events: readonly TransferHistoryEvent[],
  transfers: readonly TransferHistoryDocument[],
  sites: readonly TransferHistoryLocation[],
  cities: readonly TransferHistoryCity[],
): SerialMultisiteTimelineItem[] => {
  const transferMap = new Map(transfers.map((transfer) => [transfer.id, transfer]));
  const siteMap = new Map(sites.map((site) => [site.id, site]));
  const cityMap = new Map(cities.map((city) => [city.id, city]));
  const location = (siteId: string): string => {
    const site = siteMap.get(siteId);
    if (!site) return "Sede no identificada";
    const city = cityMap.get(site.city_id);
    return city ? `${site.name} · ${city.name}` : site.name;
  };

  return events
    .filter((event) => event.unit_id === unitId && supported.has(event.event_type as MultisiteEventType))
    .map((event) => {
      const transfer = transferMap.get(event.transfer_id);
      if (!transfer) return null;
      const origin = location(transfer.origin_site_id);
      const destination = location(transfer.destination_site_id);
      const type = event.event_type as MultisiteEventType;
      const text: Record<MultisiteEventType, { title: string; description: string }> = {
        despachado: {
          title: "Despachado · En tránsito",
          description: `Salió de ${origin} rumbo a ${destination}.`,
        },
        recepcion_confirmada: {
          title: "Recepción confirmada",
          description: `El IMEI fue verificado físicamente en ${destination}.`,
        },
        faltante_reportado: {
          title: "Faltante reportado",
          description: `No llegó a ${destination}. Se generó una devolución pendiente hacia ${origin}.`,
        },
        retorno_verificado: {
          title: "Retorno recibido en origen",
          description: `El IMEI fue encontrado y verificado físicamente en ${destination}.`,
        },
        incidencia: {
          title: "Incidencia · IMEI sin localizar",
          description: `No se encontró físicamente en ${destination}. Sigue sin estar disponible para venta.`,
        },
        incidencia_resuelta: {
          title: "Incidencia resuelta · IMEI recuperado",
          description: `El equipo apareció y fue verificado físicamente en ${destination}. Regresó al inventario de esa sede.`,
        },
      };
      const observation = info(event.details);
      return {
        id: event.id,
        transferId: transfer.id,
        documentCode: transfer.code,
        createdAt: event.created_at,
        type,
        title: text[type].title,
        description: observation
          ? `${text[type].description} Observación: ${observation}`
          : text[type].description,
        origin,
        destination,
        status: transfer.status,
      };
    })
    .filter((item): item is SerialMultisiteTimelineItem => item !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
};

type QueryError = { message: string; code?: string } | null;
type QueryResult = { data: unknown; error: QueryError };
interface QueryBuilder extends PromiseLike<QueryResult> {
  eq(key: string, value: string): QueryBuilder;
  in(key: string, values: readonly string[]): QueryBuilder;
  order(key: string, options?: { ascending: boolean }): QueryBuilder;
}
type ReadClient = {
  from(table: string): { select(columns: string): QueryBuilder };
};

/**
 * Consulta REST read-only, con RLS global para empleados activos.
 * Si la migración aún no existe no oculta el historial legacy: informa pending.
 */
export const readMultisiteSerialTimeline = async (
  unitId: string,
  clientOverride?: ReadClient,
): Promise<{ ready: boolean; events: SerialMultisiteTimelineItem[] }> => {
  if (!unitId) return { ready: false, events: [] };
  const client = clientOverride ??
    ((await import("@/integrations/supabase/client")).supabase as unknown as ReadClient);

  const { data: rawEvents, error } = await client.from("nexora_transfer_events")
    .select("id,transfer_id,unit_id,event_type,details,created_at")
    .eq("unit_id", unitId)
    .order("created_at", { ascending: true });
  if (error) {
    if (["PGRST205", "42P01", "PGRST202"].includes(error.code ?? "")) {
      return { ready: false, events: [] };
    }
    throw new Error("No fue posible consultar la historia multisede del IMEI.");
  }
  const events = (rawEvents ?? []) as TransferHistoryEvent[];
  if (!events.length) return { ready: true, events: [] };

  const transferIds = [...new Set(events.map((entry) => entry.transfer_id))];
  const [
    { data: rawTransfers, error: transferError },
    { data: rawSites, error: sitesError },
    { data: rawCities, error: citiesError },
  ] = await Promise.all([
    client.from("nexora_transfers")
      .select("id,code,origin_site_id,destination_site_id,kind,status")
      .in("id", transferIds),
    client.from("nexora_sites").select("id,city_id,name"),
    client.from("nexora_cities").select("id,name"),
  ]);
  if (transferError || sitesError || citiesError) {
    throw new Error("No se pudo completar la información de ciudades y bodegas del IMEI.");
  }
  return {
    ready: true,
    events: mapMultisiteSerialTimeline(
      unitId,
      events,
      (rawTransfers ?? []) as TransferHistoryDocument[],
      (rawSites ?? []) as TransferHistoryLocation[],
      (rawCities ?? []) as TransferHistoryCity[],
    ),
  };
};
