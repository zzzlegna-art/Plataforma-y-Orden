import { describe, expect, it } from "vitest";

import type { WarrantyView } from "./selectors";
import type { Warranty } from "./types";
import { diaLocal, FILTRO_REENVIO_VACIO, filtrarReenvio, hayFiltroReenvio } from "./warranty-reenvio";

const vista = (overrides: Partial<Warranty>, extra: Partial<WarrantyView> = {}): WarrantyView => ({
  warranty: {
    id: "w", code: "GAR-1", reason: "no enciende", status: "reenvio_pendiente",
    receivedAt: "2026-10-05T17:00:00", createdBy: "u1", ...overrides,
  } as Warranty,
  events: [],
  open: true,
  ...extra,
});

const casos = [
  vista({ id: "a", code: "GAR-A", resolucion: "reparado", imeiManual: "111", clienteManual: "Camilo Tamayo", referenciaManual: "iPhone 14", receivedAt: "2026-09-26T17:10:00" }),
  vista({ id: "b", code: "GAR-B", resolucion: "cambio", unitId: "un1", receivedAt: "2026-10-05T17:30:00" }, { tecnico: { id: "t1", nombre: "Andres" }, customer: { id: "c1", name: "Starphone" } as WarrantyView["customer"] }),
  vista({ id: "c", code: "GAR-C", resolucion: "sin_falla", unitId: "un2", receivedAt: "2026-10-06T09:00:00" }),
];

describe("filtrarReenvio", () => {
  it("sin filtros devuelve todo y hayFiltroReenvio es falso", () => {
    expect(filtrarReenvio(casos, FILTRO_REENVIO_VACIO)).toHaveLength(3);
    expect(hayFiltroReenvio(FILTRO_REENVIO_VACIO)).toBe(false);
    expect(hayFiltroReenvio({ ...FILTRO_REENVIO_VACIO, texto: "x" })).toBe(true);
  });

  it("filtra por resolución", () => {
    const r = filtrarReenvio(casos, { ...FILTRO_REENVIO_VACIO, resolucion: "cambio" });
    expect(r.map((v) => v.warranty.code)).toEqual(["GAR-B"]);
  });

  it("filtra por origen: la garantía previa es la que no tiene unidad pero sí IMEI manual", () => {
    const r = filtrarReenvio(casos, { ...FILTRO_REENVIO_VACIO, origen: "previa" });
    expect(r.map((v) => v.warranty.code)).toEqual(["GAR-A"]);
  });

  it("filtra por técnico", () => {
    const r = filtrarReenvio(casos, { ...FILTRO_REENVIO_VACIO, tecnicoId: "t1" });
    expect(r.map((v) => v.warranty.code)).toEqual(["GAR-B"]);
  });

  it("busca por texto sin importar mayúsculas ni tildes, en cliente, serial y producto", () => {
    expect(filtrarReenvio(casos, { ...FILTRO_REENVIO_VACIO, texto: "camilo" })).toHaveLength(1);
    expect(filtrarReenvio(casos, { ...FILTRO_REENVIO_VACIO, texto: "111" })).toHaveLength(1);
    expect(filtrarReenvio(casos, { ...FILTRO_REENVIO_VACIO, texto: "IPHONE" })).toHaveLength(1);
    expect(filtrarReenvio(casos, { ...FILTRO_REENVIO_VACIO, texto: "starphone" })).toHaveLength(1);
    expect(filtrarReenvio(casos, { ...FILTRO_REENVIO_VACIO, texto: "no existe" })).toHaveLength(0);
  });

  it("filtra por rango de fechas (ambos extremos incluidos)", () => {
    const r = filtrarReenvio(casos, { ...FILTRO_REENVIO_VACIO, desde: "2026-10-05", hasta: "2026-10-05" });
    expect(r.map((v) => v.warranty.code)).toEqual(["GAR-B"]);
    const r2 = filtrarReenvio(casos, { ...FILTRO_REENVIO_VACIO, desde: "2026-10-05" });
    expect(r2.map((v) => v.warranty.code)).toEqual(["GAR-B", "GAR-C"]);
  });

  it("combina filtros: todos deben cumplirse", () => {
    const r = filtrarReenvio(casos, { ...FILTRO_REENVIO_VACIO, resolucion: "cambio", texto: "camilo" });
    expect(r).toHaveLength(0);
  });

  it("diaLocal usa el día local de la fecha", () => {
    expect(diaLocal("2026-10-05T17:30:00")).toBe("2026-10-05");
  });
});
