import { describe, expect, it } from "vitest";

import { DomainError, emptyDb } from "../db";
import type { Actor, Db, Unit } from "../types";
import { agregarSerialDespachado, serializarImeiPedido } from "./orders";

const admin: Actor = { id: "u1", email: "a@x.com", fullName: "Admin", role: "admin" };
const now = new Date().toISOString();

const unidad = (id: string, productId: string, serial: string, condition: Unit["condition"]): Unit => ({
  id, productId, serial, condition, status: "en_bodega", receivedAt: now, createdBy: "u1",
});

/** Pedido en preparación con dos referencias distintas: A (p1, nuevo) y B (p2, nuevo). */
const dbCon = (): Db => {
  const db = emptyDb();
  db.orders = [
    {
      id: "o1", code: "PED-1", customerId: "c1", status: "en_preparacion", orderDate: now,
      total: 0, createdBy: "u1", createdAt: now, updatedAt: now,
    },
  ];
  db.orderItems = [
    { id: "i1", orderId: "o1", productId: "p1", quantity: 1, condition: "nuevo", unitPrice: 0, subtotal: 0 },
    { id: "i2", orderId: "o1", productId: "p2", quantity: 1, condition: "nuevo", unitPrice: 0, subtotal: 0 },
  ];
  db.units = [unidad("a", "p1", "SER-A", "nuevo"), unidad("b", "p2", "SER-B", "nuevo")];
  return db;
};

describe("serializarImeiPedido · informa en qué referencia quedó el serial", () => {
  it("devuelve la línea de la referencia que le corresponde al serial", () => {
    const db = dbCon();
    const result = serializarImeiPedido(db, admin, { orderId: "o1", imei: "SER-B" });
    expect(result.orderItemId).toBe("i2");
    expect(db.orderItemUnits).toHaveLength(1);
    expect(db.orderItemUnits[0].orderItemId).toBe("i2");
  });

  it("un serial escaneado desde la tarjeta equivocada cae en la referencia correcta", () => {
    const db = dbCon();
    // El serial es de la referencia B (i2): la tarjeta desde la que se escaneó (A, i1) no importa.
    const desdeLinea = "i1";
    const result = serializarImeiPedido(db, admin, { orderId: "o1", imei: "ser-b" });
    expect(result.orderItemId).not.toBe(desdeLinea);
    expect(result.producto).toBe("");
  });

  it("si la referencia que le corresponde ya está completa, se rechaza (no se mueve a otra)", () => {
    const db = dbCon();
    serializarImeiPedido(db, admin, { orderId: "o1", imei: "SER-A" });
    db.units.push(unidad("a2", "p1", "SER-A2", "nuevo"));
    expect(() => serializarImeiPedido(db, admin, { orderId: "o1", imei: "SER-A2" })).toThrow(DomainError);
    expect(db.orderItemUnits).toHaveLength(1);
  });
});

describe("la plataforma no deja meter un serial en una referencia que no es", () => {
  it("un serial de un producto que el pedido no incluye se rechaza y no se asigna", () => {
    const db = dbCon();
    db.units.push(unidad("z", "p9", "SER-Z", "nuevo"));
    expect(() => serializarImeiPedido(db, admin, { orderId: "o1", imei: "SER-Z" })).toThrow(DomainError);
    expect(db.orderItemUnits).toHaveLength(0);
  });

  it("el mismo producto pero con otra condición (seminuevo en una línea de nuevo) se rechaza", () => {
    const db = dbCon();
    db.units.push(unidad("s", "p1", "SER-S", "seminuevo"));
    expect(() => serializarImeiPedido(db, admin, { orderId: "o1", imei: "SER-S" })).toThrow(DomainError);
    expect(db.orderItemUnits).toHaveLength(0);
  });

  it("en un pedido despachado, el administrador tampoco puede forzar un serial en otra línea", () => {
    const db = dbCon();
    db.orders[0].status = "despachado";
    // SER-B es del producto p2 (línea i2): intentar meterlo en la línea i1 (producto p1) falla.
    expect(() =>
      agregarSerialDespachado(db, admin, { orderId: "o1", orderItemId: "i1", imei: "SER-B" }),
    ).toThrow(DomainError);
    expect(db.orderItemUnits).toHaveLength(0);
  });
});
