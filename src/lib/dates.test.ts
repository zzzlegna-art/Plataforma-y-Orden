import { describe, expect, it } from "vitest";

import { diaBogota, hoyBogota, soloFecha } from "./dates";

describe("diaBogota", () => {
  it("resta las 5 horas de Bogotá: un instante ya en el día siguiente en UTC puede ser el día anterior en Bogotá", () => {
    // 2026-09-21 00:07 UTC = 2026-09-20 19:07 Bogotá
    expect(diaBogota("2026-09-21T00:07:00Z")).toBe("2026-09-20");
  });
  it("un instante bien entrado el día es el mismo día en ambas", () => {
    expect(diaBogota("2026-09-21T22:38:51Z")).toBe("2026-09-21");
  });
  it("justo a medianoche Bogotá (05:00 UTC) cae del lado correcto en ambas fronteras", () => {
    expect(diaBogota("2026-09-21T04:59:59Z")).toBe("2026-09-20");
    expect(diaBogota("2026-09-21T05:00:00Z")).toBe("2026-09-21");
  });
});

describe("hoyBogota", () => {
  it("coincide con diaBogota del instante actual", () => {
    expect(hoyBogota()).toBe(diaBogota(new Date().toISOString()));
  });
});

describe("soloFecha", () => {
  it("recorta un valor de servidor (con hora y zona) a solo la fecha", () => {
    expect(soloFecha("2026-09-21T00:00:00+00:00")).toBe("2026-09-21");
    expect(soloFecha("2026-09-21")).toBe("2026-09-21");
  });
  it("sin valor no hay fecha", () => {
    expect(soloFecha(null)).toBeUndefined();
    expect(soloFecha(undefined)).toBeUndefined();
    expect(soloFecha("")).toBeUndefined();
  });
});
