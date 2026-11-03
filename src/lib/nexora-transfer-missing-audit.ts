/**
 * Nexora Multisede V4 · lectura de incidentes «No llegó».
 * No crea incidentes ni mueve custodia: solo coteja filas devueltas por
 * Supabase con el manifiesto y el documento firmado por la RPC.
 */
export interface TransferMissingObservation {
  lineId: string;
  unitId: string;
  serial: string;
  observation: "No llegó";
  reportedBy: string;
  reportedAt: string;
}

type ManifestLine = {
  id: string;
  unitId: string;
  serial: string;
  state: string;
};
export type TransferMissingAudit =
  | { state: "verified"; entries: TransferMissingObservation[] }
  | { state: "incomplete"; entries: [] }
  | { state: "unavailable"; entries: [] };

type RawRow = Record<string, unknown>;
type ReadError = { code?: string | null; message: string };

/** Únicamente el error inequívoco de tabla NO instalada activa la espera. */
export const isMissingAuditTableNotDeployed = (error: ReadError): boolean =>
  error.code === "PGRST205" || error.code === "42P01"
  || /could not find the table .* in the schema cache/i.test(error.message);

/**
 * Ningún renglón se presenta como auditable si faltan registros, hay
 * contradicción con el manifiesto o se ha perdido la referencia al actor.
 */
export const reconcileTransferMissingAudit = (
  rows: readonly RawRow[],
  lines: readonly ManifestLine[],
  expectedCount: number | null,
): TransferMissingAudit => {
  const incomplete: TransferMissingAudit = { state: "incomplete", entries: [] };
  if (expectedCount !== null &&
      (!Number.isSafeInteger(expectedCount) || expectedCount < 1)) return incomplete;
  if (rows.length !== (expectedCount ?? 0) || rows.length > 100) return incomplete;

  const byId = new Map(lines.map((line) => [line.id, line]));
  if (byId.size !== lines.length) return incomplete;

  const seen = new Set<string>();
  const entries: TransferMissingObservation[] = [];
  for (const row of rows) {
    const lineId = typeof row.transfer_line_id === "string" ? row.transfer_line_id : "";
    const unitId = typeof row.unit_id === "string" ? row.unit_id : "";
    const serial = typeof row.serial_snapshot === "string" ? row.serial_snapshot : "";
    const actor = typeof row.reported_by === "string" ? row.reported_by : "";
    const reportedAt = typeof row.reported_at === "string" ? row.reported_at : "";
    const line = byId.get(lineId);
    if (!lineId || seen.has(lineId) || !line || line.unitId !== unitId
        || line.serial !== serial
        || (line.state !== "return_pending" && line.state !== "returned")
        || row.observation !== "No llegó" || !actor || !reportedAt
        || !Number.isFinite(Date.parse(reportedAt))) return incomplete;
    seen.add(lineId);
    entries.push({
      lineId, unitId, serial, observation: "No llegó",
      reportedBy: actor, reportedAt,
    });
  }
  return { state: "verified", entries };
};
