import { describe, expect, it } from "vitest";
import {
  getMissingReceiptSerials, getReceivingSummary, parseTransferSerials, validateTransferSerials,
  type NexoraTransferLine,
} from "./nexora-transfers";

const lines = (total: number): NexoraTransferLine[] => Array.from({ length: total }, (_, i) => ({
  id: `line-${i}`,
  unitId: `unit-${i}`,
  serial: `IMEI-${String(i + 1).padStart(4, "0")}`,
  state: "in_transit",
}));

describe("Nexora Multisede · traslado y recepción parcial", () => {
  it("20 despachados, 15 recibidos: documenta exactamente 5 faltantes", () => {
    const manifest = lines(20);
    const received = manifest.slice(0, 15).map((line) => line.serial);
    expect(getReceivingSummary(manifest, received)).toEqual({
      received: 15, missing: 5, invalidSerials: [],
    });
  });

  it("identifica exactamente los cinco IMEI no llegados sin alterar la custodia", () => {
    const manifest = lines(20);
    const recorded = structuredClone(manifest);
    const scanned = manifest.slice(0, 15).map((line) => line.serial);
    expect(getMissingReceiptSerials(manifest, scanned)).toEqual(
      manifest.slice(15).map((line) => line.serial),
    );
    expect(getMissingReceiptSerials(manifest, scanned.map((serial) => ` ${serial.toLowerCase()} `)))
      .toEqual(manifest.slice(15).map((line) => line.serial));
    expect(manifest).toEqual(recorded);
  });

  it("no suma un serial extraño ni escaneos repetidos como recepción válida", () => {
    const manifest = lines(20);
    const received = [...manifest.slice(0, 15).map((line) => line.serial),
      "IMEI-AJENO", "imei-0001"];
    expect(getReceivingSummary(manifest, received)).toEqual({
      received: 15, missing: 5, invalidSerials: ["IMEI-AJENO"],
    });
    expect(getMissingReceiptSerials(manifest, received)).toEqual(
      manifest.slice(15).map((line) => line.serial),
    );
    expect(validateTransferSerials(received)).toMatch(/duplicados/);
  });

  it("20 despachados, cero recibidos: 20 faltantes, sin stock ficticio", () => {
    expect(getReceivingSummary(lines(20), [])).toEqual({
      received: 0, missing: 20, invalidSerials: [],
    });
    expect(validateTransferSerials([], true)).toBeNull();
  });

  it("todas las unidades recibidas implica cero devoluciones", () => {
    const manifest = lines(20);
    const received = manifest.map((line) => line.serial);
    expect(getReceivingSummary(manifest, received)).toEqual({
      received: 20, missing: 0, invalidSerials: [],
    });
  });

  it("rechaza IMEI no enviados, incluso aunque sea una recepción parcial", () => {
    const manifest = lines(3);
    const summary = getReceivingSummary(manifest, ["IMEI-0001", "IMEI-AJENO"]);
    expect(summary.invalidSerials).toEqual(["IMEI-AJENO"]);
  });

  it("evita seriales duplicados normalizando espacios y mayúsculas", () => {
    const tokens = parseTransferSerials("  imei-001 \n IMEI-001;IMEI-002 ");
    expect(tokens).toEqual(["imei-001", "IMEI-001", "IMEI-002"]);
    expect(validateTransferSerials(tokens)).toMatch(/duplicados/);
    expect(validateTransferSerials([])).toMatch(/al menos un IMEI/);
  });

  it("permite hasta 100 unidades, conserva ceros iniciales y no acepta 101", () => {
    const data = Array.from({ length: 100 }, (_, i) => `0000${String(i).padStart(4, "0")}`);
    expect(validateTransferSerials(data)).toBeNull();
    expect(data[0]).toBe("00000000");
    expect(validateTransferSerials([...data, "99999999"])).toMatch(/máximo 100/);
  });

  it("el cálculo de faltantes es puro y no altera estados en tránsito", () => {
    const manifest = lines(20);
    const before = structuredClone(manifest);
    getReceivingSummary(manifest, manifest.slice(0, 15).map((l) => l.serial));
    expect(manifest).toEqual(before);
    expect(manifest.every((line) => line.state === "in_transit")).toBe(true);
  });
});
