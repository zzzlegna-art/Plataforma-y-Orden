import { describe, expect, it } from "vitest";
import {
  canObserveLegacyStatus, normalizeScan, validatePhysicalScan,
} from "./nexora-imei-reconciliation";

describe("Nexora Multisede · conciliación física por IMEI", () => {
  it("admite solamente estados con posibilidad de existencia física", () => {
    for (const status of ["en_bodega","en_local","en_transito","en_reparacion","defectuoso"]) {
      expect(canObserveLegacyStatus(status), status).toBe(true);
    }
  });
  it("nunca registra vendidos, entregados, liberados ni estados desconocidos", () => {
    for (const status of ["vendido","entregado_garantia","liberado","desconocido",""]) {
      expect(canObserveLegacyStatus(status), status).toBe(false);
    }
  });
  it("no permite escaneo sin sede y rechaza códigos vacíos", () => {
    expect(validatePhysicalScan("12345", "")).toMatch(/sede/);
    expect(validatePhysicalScan(" ", "sede-1")).toMatch(/IMEI/);
    expect(validatePhysicalScan("X".repeat(161), "sede-1")).toMatch(/demasiado largo/);
    expect(validatePhysicalScan("  356789123456789  ", "sede-1")).toBeNull();
  });
  it("conserva ceros iniciales y símbolos al normalizar seriales", () => {
    expect(normalizeScan("  00123450099901  ")).toBe("00123450099901");
    expect(normalizeScan("  ABC-001/2  ")).toBe("ABC-001/2");
  });
});
