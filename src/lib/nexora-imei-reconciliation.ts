/** Cotejos físicos por IMEI: evidencia sin modificar las existencias del sistema anterior. */
export type LegacyPhysicalStatus =
  | "en_bodega" | "en_local" | "en_transito" | "en_reparacion" | "defectuoso";

export interface ScannedUnit {
  id: string;
  serial: string;
  status: string;
  productName: string;
}
export interface ImeiObservation {
  id: string;
  unitId: string;
  siteId: string;
  serial: string;
  statusAtScan: string;
  checkedAt: string;
  notes: string | null;
}

const PHYSICAL_STATUSES = [
  "en_bodega", "en_local", "en_transito", "en_reparacion", "defectuoso",
] as const satisfies readonly LegacyPhysicalStatus[];

export const canObserveLegacyStatus = (status: string): boolean =>
  PHYSICAL_STATUSES.some((value) => value === status);

export const normalizeScan = (serial: string): string => serial.trim();

export const validatePhysicalScan = (serial: string, siteId: string): string | null => {
  if (!siteId) return "Selecciona primero una sede activa.";
  if (!normalizeScan(serial)) return "Escanea o escribe el IMEI/serial.";
  if (serial.trim().length > 160) return "El número de serie es demasiado largo.";
  return null;
};

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string };
type DbResponse<T> = { data: T | null; error: DbError | null; count?: number | null };
type Awaitable<T> = PromiseLike<DbResponse<T>>;
type SelectBuilder = Awaitable<Row[]> & {
  eq: (field: string, value: string) => SelectBuilder;
  is: (field: string, value: null) => SelectBuilder;
  order: (field: string, options?: { ascending?: boolean }) => SelectBuilder;
  limit: (limit: number) => SelectBuilder;
  maybeSingle: () => Awaitable<Row>;
};
type Table = {
  select: (fields: string, options?: { head?: boolean; count?: "exact" }) => SelectBuilder;
  insert: (row: Row) => { select: (fields: string) => { single: () => Awaitable<Row> } };
  update: (row: Row) => { eq: (field: string, value: string) => {
    select: (fields: string) => { single: () => Awaitable<Row> }
  } };
};

const from = async (tableName: string): Promise<Table> => {
  const { supabase } = await import("@/integrations/supabase/client");
  return (supabase as unknown as { from: (name: string) => Table }).from(tableName);
};

const unwrap = <T>(value: DbResponse<T>): T => {
  if (value.error) throw new Error(value.error.message);
  if (value.data === null) throw new Error("El servidor no devolvió los datos solicitados.");
  return value.data;
};

const readObservation = (row: Row): ImeiObservation => ({
  id: String(row.id),
  unitId: String(row.unit_id),
  siteId: String(row.site_id),
  serial: String(row.serial_snapshot),
  statusAtScan: String(row.status_snapshot),
  checkedAt: String(row.checked_at),
  notes: typeof row.notes === "string" ? row.notes : null,
});

/** Búsqueda exacta con índice por serial. No descarga listados completos de IMEI. */
export const lookupImeiForPhysicalCount = async (rawSerial: string): Promise<ScannedUnit | null> => {
  const serial = normalizeScan(rawSerial);
  if (!serial || serial.length > 160) return null;
  const units = await from("bodega_units");
  const result = await units.select("id,serial,status,product_id")
    .eq("serial", serial).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return null;
  const row = result.data;
  const productId = typeof row.product_id === "string" ? row.product_id : null;
  let productName = "Producto sin referencia";
  if (productId) {
    const products = await from("bodega_products");
    const found = await products.select("name").eq("id", productId).maybeSingle();
    if (found.error) throw new Error(found.error.message);
    if (typeof found.data?.name === "string") productName = found.data.name;
  }
  return { id: String(row.id), serial: String(row.serial), status: String(row.status), productName };
};

export const findActiveObservationByImei = async (unitId: string): Promise<ImeiObservation | null> => {
  const table = await from("nexora_imei_reconciliation");
  const result = await table.select("*").eq("unit_id", unitId)
    .is("voided_at", null).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? readObservation(result.data) : null;
};

export const listPhysicalObservations = async (siteId: string): Promise<{
  recent: ImeiObservation[];
  activeTotal: number;
  siteTotal: number;
}> => {
  const table = await from("nexora_imei_reconciliation");
  const [list, globalCount, siteCount] = await Promise.all([
    table.select("*").eq("site_id", siteId).is("voided_at", null)
      .order("checked_at", { ascending: false }).limit(50),
    table.select("id", { count: "exact", head: true }).is("voided_at", null),
    table.select("id", { count: "exact", head: true }).eq("site_id", siteId).is("voided_at", null),
  ]);
  if (globalCount.error || siteCount.error) throw new Error(
    globalCount.error?.message ?? siteCount.error?.message ?? "Error de conteo",
  );
  if (globalCount.count == null || siteCount.count == null)
    throw new Error("No se pudieron verificar los conteos de conciliación.");
  return {
    recent: unwrap(list).map(readObservation),
    activeTotal: globalCount.count,
    siteTotal: siteCount.count,
  };
};

/** El servidor valida sede, estado y autor, y conserva el snapshot exacto del IMEI. */
export const registerPhysicalObservation = async (
  unit: ScannedUnit,
  siteId: string,
  notes: string,
): Promise<ImeiObservation> => {
  if (!siteId) throw new Error("Selecciona una sede activa.");
  if (!canObserveLegacyStatus(unit.status))
    throw new Error("Este IMEI no está disponible para cotejo físico.");
  const table = await from("nexora_imei_reconciliation");
  const result = await table.insert({
    unit_id: unit.id, site_id: siteId, notes: notes.trim() || null,
  }).select("*").single();
  if (result.error?.code === "23505" ||
      result.error?.message.toLowerCase().includes("nexora_imei_recon_one_current")) {
    throw new Error("Ese IMEI ya tiene una verificación vigente. Anula la anterior con motivo antes de repetirla.");
  }
  return readObservation(unwrap(result));
};

/** Anulación auditada; el registro original sigue en la base de datos. */
export const voidPhysicalObservation = async (id: string, reason: string): Promise<void> => {
  if (reason.trim().length < 5) throw new Error("Indica el motivo de anulación (mínimo cinco caracteres).");
  const table = await from("nexora_imei_reconciliation");
  const result = await table.update({
    void_reason: reason.trim(),
    voided_at: new Date().toISOString(),
  }).eq("id", id).select("id").single();
  unwrap(result);
};
