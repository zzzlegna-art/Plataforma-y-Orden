import { describe, expect, it } from "vitest";

import { nextDailyCode, selloDelDia } from "./db";

// 2026-09-21 12:00 en Bogotá (UTC-5) = 17:00 UTC
const MEDIODIA = new Date("2026-09-21T17:00:00Z");

describe("selloDelDia (zona horaria de Bogotá)", () => {
  it("usa la fecha de Bogotá, no la del navegador ni la UTC", () => {
    expect(selloDelDia(MEDIODIA)).toBe("260921");
    // 22:00 del 21 en Bogotá ya es el día 22 en UTC: debe seguir siendo el 21
    expect(selloDelDia(new Date("2026-09-22T03:00:00Z"))).toBe("260921");
  });

  it("cambia de día a medianoche de Bogotá", () => {
    expect(selloDelDia(new Date("2026-09-21T04:59:00Z"))).toBe("260920");
    expect(selloDelDia(new Date("2026-09-21T05:00:00Z"))).toBe("260921");
  });
});

describe("nextDailyCode", () => {
  it("empieza en 001 el día que aún no tiene códigos", () => {
    expect(nextDailyCode([], "PED", MEDIODIA)).toBe("PED-260921-001");
  });

  it("continúa el consecutivo del mismo día y prefijo", () => {
    const existentes = ["PED-260921-001", "PED-260921-002"];
    expect(nextDailyCode(existentes, "PED", MEDIODIA)).toBe("PED-260921-003");
  });

  it("no cuenta códigos de otros días (producción tiene PED-260916-004, etc.)", () => {
    const existentes = ["PED-260916-004", "PED-260919-001"];
    expect(nextDailyCode(existentes, "PED", MEDIODIA)).toBe("PED-260921-001");
  });

  it("no mezcla prefijos ni formatos viejos (GAR-09637, GAR-MIG-9, sufijo aleatorio)", () => {
    const garantias = ["GAR-09637", "GAR-MIG-9", "GAR-260918-6429", "PED-260921-007"];
    expect(nextDailyCode(garantias, "GAR", MEDIODIA)).toBe("GAR-260921-001");
  });

  it("toma el mayor, no la cantidad (borrar registros no reutiliza códigos)", () => {
    const existentes = ["PED-260921-001", "PED-260921-010"];
    expect(nextDailyCode(existentes, "PED", MEDIODIA)).toBe("PED-260921-011");
  });

  it("tolera valores vacíos o nulos en la lista", () => {
    expect(nextDailyCode(["", undefined as unknown as string], "PED", MEDIODIA)).toBe("PED-260921-001");
  });
});
