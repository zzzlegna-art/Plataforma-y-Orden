import { describe, expect, it } from "vitest";
import {
  validateMissingReceiptConfirmation,
  type MissingReceiptMark,
  type ReceiptManifestLine,
} from "./nexora-missing-receipt-confirmation";

const manifest: ReceiptManifestLine[] = Array.from({ length: 20 }, (_, i) => ({
  id: `line-${i + 1}`,
  serial: `IMEI-${String(i + 1).padStart(4, "0")}`,
  state: "in_transit",
}));
const received = manifest.slice(0, 15).map((line) => line.serial);
const marks: MissingReceiptMark[] = manifest.slice(15).map((line, i) => ({
  lineId: line.id,
  serial: line.serial,
  markedNotArrived: true,
  observation: `No llegó el equipo número ${i + 1}; reportado por quien recibió la remesa.`,
}));

describe("Plan Maestro Nexora V4 · 20→15→5 con nota individual obligatoria", () => {
  it("acepta cinco casillas marcadas con cinco observaciones propias", () => {
    const result = validateMissingReceiptConfirmation(manifest, received, marks);
    expect(result.ok).toBe(true);
    expect(result.incidents).toHaveLength(5);
    expect(result.incidents.map((i) => i.serial)).toEqual(
      manifest.slice(15).map((line) => line.serial),
    );
    expect(new Set(result.incidents.map((i) => i.observation)).size).toBe(5);
  });

  it("rechaza confirmar sin marcar uno de los cinco IMEI", () => {
    const result = validateMissingReceiptConfirmation(manifest, received, marks.slice(0, 4));
    expect(result.ok).toBe(false);
    expect(result.incidents).toEqual([]);
    expect(result.errors.join(" ")).toContain("IMEI-0020");
  });

  it("rechaza casilla sin marcar y nota vacía o fuera de límites", () => {
    const noCheckbox = validateMissingReceiptConfirmation(manifest, received,
      marks.map((mark, i) => i === 0 ? { ...mark, markedNotArrived: false } : mark));
    const emptyNote = validateMissingReceiptConfirmation(manifest, received,
      marks.map((mark, i) => i === 0 ? { ...mark, observation: "  " } : mark));
    const hugeNote = validateMissingReceiptConfirmation(manifest, received,
      marks.map((mark, i) => i === 0 ? { ...mark, observation: "x".repeat(501) } : mark));
    expect([noCheckbox.ok, emptyNote.ok, hugeNote.ok]).toEqual([false, false, false]);
  });

  it("no admite doble marcación, IMEI ajeno ni marcar uno ya recibido", () => {
    expect(validateMissingReceiptConfirmation(manifest, received, [...marks, marks[0]]).ok)
      .toBe(false);
    expect(validateMissingReceiptConfirmation(manifest, received, [...marks,
      { ...marks[0], lineId: "line-1", serial: "IMEI-0001" }]).ok).toBe(false);
    expect(validateMissingReceiptConfirmation(manifest, received, marks.map((mark, i) =>
      i === 0 ? { ...mark, serial: "IMEI-AJENO" } : mark)).ok).toBe(false);
  });

  it("rechaza escaneos no enviados y duplicados, aun con notas completas", () => {
    expect(validateMissingReceiptConfirmation(manifest, [...received, "IMEI-AJENO"], marks).ok)
      .toBe(false);
    expect(validateMissingReceiptConfirmation(manifest, [...received, "imei-0001"], marks).ok)
      .toBe(false);
  });

  it("no interpreta cero escaneados como recepción completa: exige veinte notas", () => {
    const allMarks = manifest.map((line) => ({
      lineId:line.id,
      serial:line.serial,
      markedNotArrived:true,
      observation:`No se encontró el equipo ${line.serial} al abrir la remesa.`,
    }));
    const valid = validateMissingReceiptConfirmation(manifest,[],allMarks);
    expect(valid.ok).toBe(true);
    expect(valid.incidents).toHaveLength(20);
    const missingOne=validateMissingReceiptConfirmation(manifest,[],allMarks.slice(0,19));
    expect(missingOne.ok).toBe(false);
    expect(missingOne.errors.join(" ")).toContain("IMEI-0020");
    const noNotes=validateMissingReceiptConfirmation(manifest,[],[]);
    expect(noNotes.ok).toBe(false);
  });

  it("no exige notas si los veinte IMEI fueron realmente recibidos", () => {
    expect(validateMissingReceiptConfirmation(manifest,
      manifest.map((line) => line.serial), [])).toEqual({
      ok: true, incidents: [], errors: [],
    });
  });

  it("tolera diferencias de mayúsculas y espacios sin alterar datos", () => {
    const before = structuredClone({ manifest, received, marks });
    const noisyReceived = received.map((serial) => `  ${serial.toLowerCase()}  `);
    const noisyMarks = marks.map((mark) => ({
      ...mark, serial: ` ${mark.serial.toLowerCase()} `, observation: `  ${mark.observation}  `,
    }));
    const result = validateMissingReceiptConfirmation(manifest, noisyReceived, noisyMarks);
    expect(result.ok).toBe(true);
    expect(result.incidents[0].observation).toBe(marks[0].observation);
    expect({ manifest, received, marks }).toEqual(before);
  });

  it("no acepta una transacción que ya no está en tránsito", () => {
    const changed = manifest.map((line, i) => i === 15
      ? { ...line, state: "return_pending" as const } : line);
    const result = validateMissingReceiptConfirmation(changed, received, marks);
    expect(result.ok).toBe(false);
  });

  it("rechaza manifiestos vacíos, repetidos y de más de 100 líneas", () => {
    expect(validateMissingReceiptConfirmation([], [], []).ok).toBe(false);
    expect(validateMissingReceiptConfirmation([...manifest, manifest[0]], received, marks).ok)
      .toBe(false);
    const oversized = Array.from({ length: 101 }, (_, i) => ({
      id: `line-${i}`, serial: `IMEI-${i}`, state: "in_transit" as const,
    }));
    expect(validateMissingReceiptConfirmation(oversized, [], []).ok).toBe(false);
  });
});
