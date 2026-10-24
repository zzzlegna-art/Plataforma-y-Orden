import { describe, expect, it } from "vitest";

import { emptyDb } from "./db";
import { listarSerialesPrevios } from "./selectors";

describe("búsqueda de seriales previos", () => {
  const db = emptyDb();
  db.serialesPrevios = [
    {
      id: "sp-1",
      serial: "355380258776928",
      referencia: "Apple iPhone 13 Pro Max 256 GB",
      cliente: "Chavela",
      fechaVenta: "2026-03-16",
      archivoOrigen: "Ventas_16-03-2026.xlsx",
      hojaOrigen: "Hoja Historial",
      filaOrigen: 15,
      notas: "Venta histórica",
      createdBy: "admin",
      createdAt: "2026-10-24T10:00:00.000Z",
    },
    {
      id: "sp-2",
      serial: "SN-OTHER-001",
      referencia: "Samsung Galaxy A55",
      cliente: "Juan David",
      fechaVenta: "2025-12-01",
      archivoOrigen: "Ventas_01-12-2025.xlsx",
      hojaOrigen: "Juan David",
      filaOrigen: 7,
      notas: "Garantía antigua",
      createdBy: "admin",
      createdAt: "2026-10-23T10:00:00.000Z",
    },
  ];

  it("busca por serial, referencia, cliente, fecha, archivo, hoja, fila y notas", () => {
    for (const query of [
      "355380258776928",
      "iphone 13",
      "Chavela",
      "2026-03-16",
      "Ventas_16-03-2026",
      "Chavela",
      "historial",
      "15",
      "historica",
    ]) {
      expect(listarSerialesPrevios(db, query).map((item) => item.id)).toContain("sp-1");
    }
  });

  it("ignora mayúsculas y tildes y permite combinar términos de distintos campos", () => {
    expect(listarSerialesPrevios(db, "VENTA HISTÓRICA").map((item) => item.id)).toEqual(["sp-1"]);
    expect(listarSerialesPrevios(db, "chavela 15").map((item) => item.id)).toEqual(["sp-1"]);
  });

  it("devuelve todos los registros al dejar la búsqueda vacía y ordena por más reciente", () => {
    expect(listarSerialesPrevios(db).map((item) => item.id)).toEqual(["sp-1", "sp-2"]);
    expect(listarSerialesPrevios(db, "   ")).toHaveLength(2);
  });
});
