import { describe, expect, it } from "vitest";

import { emptyDb } from "./db";
import { getUnitSupplierReceptions, listarSerialesPrevios } from "./selectors";

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

describe("procedencia por proveedor de cada serial/IMEI", () => {
  it("obtiene el proveedor desde la recepción confirmada sin duplicarlo en la unidad", () => {
    const db = emptyDb();
    db.receptions.push({
      id: "r1", code: "REC-00001", supplierId: "sunlong",
      status: "confirmada", receivedAt: "2026-10-26T10:00:00Z",
      createdBy: "staff", createdAt: "2026-10-26T10:00:00Z",
    });
    const unit = {
      id: "u1", productId: "p1", serial: "REP-0001",
      condition: "nuevo" as const, status: "en_bodega" as const,
      receptionId: "r1", receivedAt: "2026-10-26T10:00:00Z", createdBy: "staff",
    };
    db.units.push(unit);
    expect(getUnitSupplierReceptions(db, unit).map((r) => r.supplierId)).toEqual(["sunlong"]);
    db.receptions[0].supplierId = "jk";
    expect(getUnitSupplierReceptions(db, unit).map((r) => r.supplierId)).toEqual(["jk"]);
    expect(db.units[0]).not.toHaveProperty("supplierId");
  });

  it("conserva los proveedores de ingresos anteriores si una unidad vuelve a recibirse", () => {
    const db = emptyDb();
    db.receptions.push(
      { id: "r1", code: "REC-00001", supplierId: "a", status: "confirmada",
        receivedAt: "2026-08-01", createdBy: "staff", createdAt: "2026-08-01" },
      { id: "r2", code: "REC-00002", supplierId: "b", status: "confirmada",
        receivedAt: "2026-10-01", createdBy: "staff", createdAt: "2026-10-01" },
    );
    const unit = {
      id: "u1", productId: "p1", serial: "REP-0001",
      condition: "nuevo" as const, status: "en_bodega" as const,
      receptionId: "r2", receivedAt: "2026-10-01", createdBy: "staff",
    };
    db.units.push(unit);
    db.movements.push(
      { id: "m1", unitId: "u1", productId: "p1", type: "entrada", quantity: 1,
        referenceType: "recepcion", referenceId: "r1", createdBy: "staff", createdAt: "2026-08-01" },
      { id: "m2", unitId: "u1", productId: "p1", type: "entrada", quantity: 1,
        referenceType: "recepcion", referenceId: "r2", createdBy: "staff", createdAt: "2026-10-01" },
    );
    expect(getUnitSupplierReceptions(db, unit).map((r) => r.supplierId)).toEqual(["a", "b"]);
    db.receptions[0].supplierId = "corregido";
    expect(getUnitSupplierReceptions(db, unit).map((r) => r.supplierId)).toEqual(["corregido", "b"]);
  });
});
