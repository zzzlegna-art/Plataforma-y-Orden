import { describe, expect, it } from "vitest";
import { normalizeSiteCode, validateSiteCode, validateSiteName } from "./nexora-sites";

describe("Nexora Multisede · validación de referencias de sedes", () => {
  it("normaliza código sin modificar el nombre del establecimiento", () => {
    expect(normalizeSiteCode("  bq-01  ")).toBe("BQ-01");
    expect(normalizeSiteCode("local_2")).toBe("LOCAL_2");
  });
  it("acepta códigos de 2 a 24 caracteres y rechaza separadores peligrosos", () => {
    expect(validateSiteCode(" AB ")).toBe(true);
    expect(validateSiteCode("BOD-01")).toBe(true);
    expect(validateSiteCode("B_2")).toBe(true);
    expect(validateSiteCode("A")).toBe(false);
    expect(validateSiteCode("BODEGA 1")).toBe(false);
    expect(validateSiteCode("AB;DROP")).toBe(false);
    expect(validateSiteCode("A".repeat(25))).toBe(false);
  });
  it("requiere nombre de 2 a 100 caracteres", () => {
    expect(validateSiteName("   ")).toBe(false);
    expect(validateSiteName("A")).toBe(false);
    expect(validateSiteName("Local Centro")).toBe(true);
    expect(validateSiteName("a".repeat(101))).toBe(false);
  });
  it("limita códigos de ciudad a 20 caracteres", () => {
    expect(validateSiteCode("BOGOTA", 20)).toBe(true);
    expect(validateSiteCode("B".repeat(21), 20)).toBe(false);
  });
});
