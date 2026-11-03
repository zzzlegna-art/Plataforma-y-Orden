/**
 * Plan Maestro Nexora Multisede V4.0, páginas 6–7.
 *
 * Contrato PURO de recepción parcial: cada IMEI no recibido debe marcarse
 * explícitamente «No llegó» y contener una observación individual del receptor.
 *
 * PREPARATORIO: no realiza escrituras; ninguna interfaz debe tomar `ok=true`
 * como recepción persistida hasta disponer de una RPC transaccional que vuelva
 * a comprobar el manifiesto, la custodia y las observaciones en Supabase.
 */

export interface ReceiptManifestLine {
  id: string;
  serial: string;
  state: "in_transit" | "received" | "return_pending" | "returned" | "prepared" | "cancelled";
}

export interface MissingReceiptMark {
  lineId: string;
  serial: string;
  markedNotArrived: boolean;
  observation: string;
}

export interface ValidatedMissingReceiptIncident {
  transferLineId: string;
  serial: string;
  observation: string;
}

export type MissingReceiptConfirmation =
  | { ok: true; incidents: ValidatedMissingReceiptIncident[]; errors: [] }
  | { ok: false; incidents: []; errors: string[] };

const normalizeSerial = (serial: string): string => serial.trim().toLocaleLowerCase("en-US");

export const validateMissingReceiptConfirmation = (
  manifest: readonly ReceiptManifestLine[],
  receivedSerials: readonly string[],
  marks: readonly MissingReceiptMark[],
): MissingReceiptConfirmation => {
  const errors: string[] = [];
  const inTransit = manifest.filter((line) => line.state === "in_transit");

  if (manifest.length === 0 || inTransit.length === 0 || manifest.length > 100) {
    errors.push("El manifiesto debe tener entre 1 y 100 IMEI pendientes de recepción.");
  }

  const linesById = new Map<string, ReceiptManifestLine>();
  const linesBySerial = new Map<string, ReceiptManifestLine>();
  for (const line of inTransit) {
    const serial = normalizeSerial(line.serial);
    if (!line.id || !serial || serial.length > 160) {
      errors.push("El manifiesto contiene una línea sin identificación válida.");
    } else if (linesById.has(line.id) || linesBySerial.has(serial)) {
      errors.push("El manifiesto contiene IMEI o líneas repetidos.");
    }
    linesById.set(line.id, line);
    linesBySerial.set(serial, line);
  }

  const received = new Set<string>();
  for (const input of receivedSerials) {
    const serial = normalizeSerial(input);
    if (!serial || !linesBySerial.has(serial)) {
      errors.push("La recepción contiene un IMEI ajeno al manifiesto.");
    } else if (received.has(serial)) {
      errors.push("La recepción contiene un IMEI duplicado.");
    }
    received.add(serial);
  }

  const missing = inTransit.filter((line) => !received.has(normalizeSerial(line.serial)));
  const missingIds = new Set(missing.map((line) => line.id));
  const marksById = new Map<string, MissingReceiptMark>();

  for (const mark of marks) {
    if (!missingIds.has(mark.lineId)) {
      errors.push("Se intentó marcar un IMEI recibido o ajeno como no llegado.");
      continue;
    }
    if (marksById.has(mark.lineId)) {
      errors.push("Una misma línea faltante fue confirmada más de una vez.");
      continue;
    }
    const line = linesById.get(mark.lineId);
    if (!line || normalizeSerial(mark.serial) !== normalizeSerial(line.serial)) {
      errors.push("La observación no corresponde al IMEI de la línea.");
      continue;
    }
    marksById.set(mark.lineId, mark);
  }

  const incidents: ValidatedMissingReceiptIncident[] = [];
  for (const line of missing) {
    const mark = marksById.get(line.id);
    if (!mark?.markedNotArrived) {
      errors.push(`Falta marcar «No llegó» para el IMEI ${line.serial}.`);
      continue;
    }
    const note = mark.observation.trim();
    if (note.length < 3 || note.length > 500) {
      errors.push(`El IMEI ${line.serial} requiere una observación de 3 a 500 caracteres.`);
      continue;
    }
    incidents.push({ transferLineId: line.id, serial: line.serial, observation: note });
  }

  return errors.length > 0
    ? { ok: false, incidents: [], errors }
    : { ok: true, incidents, errors: [] };
};
