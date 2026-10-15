import { describe, expect, it } from "vitest";

import {
  aMilisegundos,
  estadoControl,
  esVerificada,
  ordenarUnidades,
  resumenControl,
} from "./control-fisico";
import type { Unit, UnitStatus } from "./types";

const unidad = (serial: string, status: UnitStatus, extra: Partial<Unit> = {}): Unit => ({
  id: serial,
  productId: "p1",
  serial,
  condition: "nuevo",
  status,
  receivedAt: "2026-09-20T10:00:00.000Z",
  createdBy: "",
  ...extra,
});
const fila = (unit: Unit) => ({ unit });
const INICIO = "2026-09-21T15:00:00.500000+00:00";
const producto = { controlStartedAt: INICIO };
const sinControl = { controlStartedAt: undefined };

describe("ordenarUnidades", () => {
  it("pone primero las que están en bodega y luego el resto agrupado por estado", () => {
    const estados: UnitStatus[] = ["vendido", "en_reparacion", "en_bodega", "liberado", "defectuoso", "en_local", "entregado_garantia", "en_bodega", "en_transito"];
    const orden = ordenarUnidades(estados.map((s, i) => fila(unidad(`S${i}`, s)))).map((f) => f.unit.status);
    expect(orden).toEqual(["en_bodega", "en_bodega", "en_local", "en_transito", "en_reparacion", "defectuoso", "entregado_garantia", "vendido", "liberado"]);
  });

  it("dentro de cada estado: lo recibido más reciente primero y luego por serial", () => {
    const filas = [
      fila(unidad("B", "en_bodega", { receivedAt: "2026-09-01T00:00:00Z" })),
      fila(unidad("C", "en_bodega", { receivedAt: "2026-09-20T00:00:00Z" })),
      fila(unidad("A", "en_bodega", { receivedAt: "2026-09-20T00:00:00Z" })),
    ];
    expect(ordenarUnidades(filas).map((f) => f.unit.serial)).toEqual(["A", "C", "B"]);
  });

  it("no modifica la lista original", () => {
    const filas = [fila(unidad("V", "vendido")), fila(unidad("B", "en_bodega"))];
    ordenarUnidades(filas);
    expect(filas.map((f) => f.unit.serial)).toEqual(["V", "B"]);
  });

  it("un estado desconocido va al final sin romper el orden", () => {
    const raro = fila(unidad("X", "raro" as UnitStatus));
    const orden = ordenarUnidades([raro, fila(unidad("B", "en_bodega"))]).map((f) => f.unit.serial);
    expect(orden).toEqual(["B", "X"]);
  });
});

describe("aMilisegundos", () => {
  it("recorta los microsegundos que devuelve la base", () => {
    expect(aMilisegundos("2026-09-21T15:00:00.123456+00:00")).toBe(aMilisegundos("2026-09-21T15:00:00.123+00:00"));
  });
  it("acepta fechas sin fracción y devuelve NaN si no hay fecha", () => {
    expect(Number.isFinite(aMilisegundos("2026-09-21T15:00:00+00:00"))).toBe(true);
    expect(aMilisegundos(undefined)).toBeNaN();
    expect(aMilisegundos("no es fecha")).toBeNaN();
  });
});

describe("esVerificada", () => {
  it("sin control en curso o sin marca no está verificada", () => {
    expect(esVerificada({ checkedAt: "2026-09-21T16:00:00Z" }, sinControl)).toBe(false);
    expect(esVerificada({ checkedAt: undefined }, producto)).toBe(false);
  });

  it("solo cuenta si la marca es del control en curso (igual o posterior al inicio)", () => {
    expect(esVerificada({ checkedAt: "2026-09-21T14:59:59.999999+00:00" }, producto)).toBe(false); // de un control anterior
    expect(esVerificada({ checkedAt: "2026-09-21T15:00:00.500123+00:00" }, producto)).toBe(true); // mismo milisegundo
    expect(esVerificada({ checkedAt: "2026-09-21T15:30:00+00:00" }, producto)).toBe(true);
  });

  it("una fecha inválida nunca cuenta", () => {
    expect(esVerificada({ checkedAt: "basura" }, producto)).toBe(false);
  });
});

describe("estadoControl", () => {
  const unidades = [
    unidad("A", "en_bodega", { checkedAt: "2026-09-21T16:00:00Z" }), // verificada
    unidad("B", "en_bodega", { checkedAt: "2026-09-20T09:00:00Z" }), // de un control viejo: pendiente
    unidad("C", "en_bodega"), // pendiente
    unidad("D", "vendido", { checkedAt: "2026-09-21T16:05:00Z" }), // la tienes en la mano pero figura vendida
    unidad("E", "vendido"), // vendida y no está: normal
  ];

  it("cuenta lo esperado, lo verificado, lo que falta y lo que está fuera de estado", () => {
    const e = estadoControl(producto, unidades);
    expect(e.activo).toBe(true);
    expect(e.esperadas).toBe(3);
    expect(e.verificadas).toBe(1);
    expect(e.faltan.map((u) => u.serial)).toEqual(["B", "C"]);
    expect(e.fueraDeEstado.map((u) => u.serial)).toEqual(["D"]);
    expect(e.porcentaje).toBe(33);
  });

  it("sin control en curso nada cuenta como verificado", () => {
    const e = estadoControl(sinControl, unidades);
    expect(e.activo).toBe(false);
    expect(e.verificadas).toBe(0);
    expect(e.fueraDeEstado).toEqual([]);
  });

  it("sin unidades esperadas el avance es 0 (no divide entre cero)", () => {
    expect(estadoControl(producto, [unidad("E", "vendido")]).porcentaje).toBe(0);
    expect(estadoControl(producto, []).porcentaje).toBe(0);
  });

  it("todo verificado = 100 %", () => {
    const e = estadoControl(producto, [unidad("A", "en_bodega", { checkedAt: "2026-09-21T16:00:00Z" })]);
    expect(e.porcentaje).toBe(100);
    expect(e.faltan).toEqual([]);
  });
});

describe("resumenControl", () => {
  const estado = estadoControl(producto, [
    unidad("A", "en_bodega", { checkedAt: "2026-09-21T16:00:00Z" }),
    unidad("B", "en_bodega"),
    unidad("D", "vendido", { checkedAt: "2026-09-21T16:05:00Z" }),
  ]);

  it("resume avance, faltantes, fuera de estado y no registrados", () => {
    const texto = resumenControl(estado, { noEncontrados: ["999"], estadoDe: () => "Vendido" });
    expect(texto).toBe("1 de 2 en bodega verificados · faltan 1: B · fuera de estado 1: D (Vendido) · no registrados 1: 999");
  });

  it("indica el alcance cuando el control se hizo sobre un filtro", () => {
    expect(resumenControl(estado, { alcance: "Nuevos" })).toMatch(/^Nuevos: 1 de 2 en bodega verificados/);
  });

  it("si está todo, solo dice el avance", () => {
    const completo = estadoControl(producto, [unidad("A", "en_bodega", { checkedAt: "2026-09-21T16:00:00Z" })]);
    expect(resumenControl(completo)).toBe("1 de 1 en bodega verificados");
  });

  it("con muchos faltantes lista los primeros y cuenta el resto (cabe en la auditoría)", () => {
    const muchas = Array.from({ length: 40 }, (_, i) => unidad(`S${String(i).padStart(2, "0")}`, "en_bodega"));
    const texto = resumenControl(estadoControl(producto, muchas));
    expect(texto).toContain("faltan 40:");
    expect(texto).toContain("y 25 más");
    expect(texto.length).toBeLessThan(400);
  });
});
