import type { TransferMissingAudit } from "./nexora-transfer-missing-audit";

/** El historial de texto del receptor es distinto de la etiqueta «No llegó». */
export interface VerifiedReceiverNote {
  lineId: string;
  serial: string;
  observation: string;
  recordedBy: string;
  recordedAt: string;
}

export type ReceiverNotesAudit =
  | { state: "verified"; entries: VerifiedReceiverNote[] }
  | { state: "incomplete"; entries: [] }
  | { state: "unavailable"; entries: [] };

type RawRow = Record<string, unknown>;

/**
 * Nunca presentar notas como certificadas si no tienen un incidente
 * genérico real y una línea de manifiesto coincidente.
 */
export const reconcileReceiverNotes = (
  rows: readonly RawRow[],
  audit: TransferMissingAudit,
  expectedCount: number | null,
): ReceiverNotesAudit => {
  const incomplete: ReceiverNotesAudit = { state: "incomplete", entries: [] };
  if (audit.state === "unavailable") return { state: "unavailable", entries: [] };
  if (audit.state !== "verified") return incomplete;
  if (expectedCount !== null &&
    (!Number.isSafeInteger(expectedCount) || expectedCount < 1)) return incomplete;

  const expected = expectedCount ?? 0;
  if (rows.length !== expected || audit.entries.length !== expected) return incomplete;

  const expectedByLine = new Map(audit.entries.map((entry) => [entry.lineId,entry]));
  const seen = new Set<string>();
  const entries: VerifiedReceiverNote[] = [];
  for (const row of rows) {
    const lineId = typeof row.transfer_line_id === "string" ? row.transfer_line_id : "";
    const serial = typeof row.serial_snapshot === "string" ? row.serial_snapshot : "";
    const observation = typeof row.receiver_observation === "string"
      ? row.receiver_observation : "";
    const recordedBy = typeof row.recorded_by === "string" ? row.recorded_by : "";
    const recordedAt = typeof row.recorded_at === "string" ? row.recorded_at : "";
    const reference = expectedByLine.get(lineId);
    if (!lineId || seen.has(lineId) || !reference || reference.serial !== serial ||
      observation.trim() !== observation || observation.length < 3 ||
      observation.length > 500 || !recordedBy || !recordedAt ||
      !Number.isFinite(Date.parse(recordedAt))) return incomplete;
    seen.add(lineId);
    entries.push({lineId,serial,observation,recordedBy,recordedAt});
  }
  return {state:"verified",entries};
};
