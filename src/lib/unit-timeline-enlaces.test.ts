import { describe, expect, it } from "vitest";

import { emptyDb } from "./db";
import { getEnlaceDeReferencia, getUnitOrigen, getUnitTimeline, rutaDeRecepcion } from "./selectors";
import type { Db, Unit } from "./types";

const now = "2026-10-05T12:00:00Z";

const dbCon = (): Db => {
  const db = emptyDb();
  db.receptions = [{ id: "r1", code: "REC-00104", status: "confirmada", receivedAt: now, createdBy: "u1", createdAt: now }];
  db.customers = [{ id: "c1", name: "Cliente Uno" } as Db["customers"][number]];
  db.orders = [
    { id: "o1", code: "PED-1", customerId: "c1", status: "despachado", orderDate: now, total: 0, createdBy: "u1", createdAt: now, updatedAt: now },
  ];
  db.orderItems = [{ id: "i1", orderId: "o1", productId: "p1", quantity: 1, unitPrice: 0, subtotal: 0 }];
  const unit: Unit = {
    id: "un1", productId: "p1", serial: "123", condition: "nuevo", status: "vendido",
    receivedAt: now, createdBy: "u1", receptionId: "r1",
  };
  db.units = [unit];
  db.orderItemUnits = [{ id: "x1", orderItemId: "i1", unitId: "un1", createdAt: now }];
  db.movements = [
    { id: "m1", productId: "p1", unitId: "un1", type: "entrada", quantity: 1, referenceType: "recepcion", referenceId: "r1", notes: "Entrada por recepción REC-00104", createdBy: "u1", createdAt: "2026-10-04T10:00:00Z" },
    { id: "m2", productId: "p1", unitId: "un1", type: "salida", quantity: 1, referenceType: "pedido", referenceId: "o1", notes: "Salida por pedido PED-1", createdBy: "u1", createdAt: "2026-10-05T10:00:00Z" },
    { id: "m3", productId: "p1", unitId: "un1", type: "ajuste", quantity: 0, referenceType: "manual", notes: "Ajuste a mano", createdBy: "u1", createdAt: "2026-10-05T11:00:00Z" },
  ];
  return db;
};

describe("historial de serial · enlaces a pedido, recepción y garantía", () => {
  it("cada movimiento apunta a su pedido o a la lista de su recepción (resaltando el serial)", () => {
    const timeline = getUnitTimeline(dbCon(), "un1");
    expect(timeline[0].enlace).toEqual({ to: "/recepcion?ver=r1&serial=123", codigo: "REC-00104" });
    expect(timeline[1].enlace).toEqual({ to: "/pedidos/o1", codigo: "PED-1" });
  });

  it("un movimiento manual no lleva enlace", () => {
    expect(getUnitTimeline(dbCon(), "un1")[2].enlace).toBeUndefined();
  });

  it("si el registro ya no existe (pedido borrado), no se enlaza a una pantalla rota", () => {
    expect(getEnlaceDeReferencia(dbCon(), "pedido", "no-existe")).toBeUndefined();
    expect(getEnlaceDeReferencia(dbCon(), "garantia", undefined)).toBeUndefined();
  });

  it("getUnitOrigen devuelve recepción, venta y cliente del equipo", () => {
    const db = dbCon();
    const origen = getUnitOrigen(db, db.units[0]);
    expect(origen.reception?.code).toBe("REC-00104");
    expect(origen.order?.code).toBe("PED-1");
    expect(origen.customer?.name).toBe("Cliente Uno");
  });

  it("una recepción confirmada abre la lista de equipos; una en captura, la pantalla de captura", () => {
    expect(rutaDeRecepcion({ id: "r1", status: "confirmada" }, "A B")).toBe("/recepcion?ver=r1&serial=A%20B");
    expect(rutaDeRecepcion({ id: "r1", status: "confirmada" })).toBe("/recepcion?ver=r1");
    expect(rutaDeRecepcion({ id: "r2", status: "captura" }, "123")).toBe("/recepcion/nueva/r2");
  });

  it("una garantía migrada (sin eventos) también aparece en el historial del serial", () => {
    const db = dbCon();
    db.warranties = [
      { id: "w1", code: "GAR-MIG-12", unitId: "un1", productId: "p1", reason: "Falla de pantalla", status: "recibido", receivedAt: "2026-10-06T10:00:00Z", createdBy: "u1" },
    ];
    db.warrantyEvents = [];
    const item = getUnitTimeline(db, "un1").find((entry) => entry.id === "w-w1");
    expect(item?.descripcion).toBe("GAR-MIG-12 · Falla de pantalla");
    expect(item?.enlace).toEqual({ to: "/garantias/w1", codigo: "GAR-MIG-12" });
  });

  it("si la garantía sí tiene eventos, no se duplica con una entrada extra", () => {
    const db = dbCon();
    db.warranties = [
      { id: "w1", code: "GAR-1", unitId: "un1", productId: "p1", reason: "x", status: "recibido", receivedAt: now, createdBy: "u1" },
    ];
    db.warrantyEvents = [
      { id: "e1", warrantyId: "w1", status: "recibido", notes: "Recibido", createdBy: "u1", createdAt: now },
    ];
    const entradas = getUnitTimeline(db, "un1").filter((entry) => entry.tipo === "garantia");
    expect(entradas).toHaveLength(1);
    expect(entradas[0].id).toBe("w-e1");
  });
});
