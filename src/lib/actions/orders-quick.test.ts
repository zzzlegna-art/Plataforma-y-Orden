import { describe, expect, it } from "vitest";
import { emptyDb, DomainError } from "../db";
import type { Actor, Db } from "../types";
import { crearPedidoRapidoPorSeriales } from "./orders-quick";

const actor: Actor = { id: "admin-quick", email: "admin@example.test", fullName: "Admin", role: "admin" };

const fixture = () => {
  const db: Db = emptyDb();
  db.customers.push({ id: "buyer", name: "Comprador", categoriaMayorista: "celulares", isActive: true, createdAt: "2026-01-01" });
  db.products.push({
    id: "phone", name: "Teléfono", sku: "PHONE-1", categoria: "celular", colorVariants: [{ color: "Negro" }, { color: "Azul" }],
    minStock: 0, isActive: true, createdAt: "2026-01-01", updatedAt: "2026-01-01",
  }, {
    id: "tablet", name: "Tableta", sku: "TAB-1", categoria: "tablet", minStock: 0, isActive: true,
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
  });
  db.units.push(
    { id: "a", productId: "phone", serial: "IMEI-1", condition: "seminuevo", status: "en_bodega", color: "Negro", receivedAt: "2026-01-01", createdBy: actor.id },
    { id: "b", productId: "phone", serial: "IMEI-2", condition: "seminuevo", status: "en_bodega", receivedAt: "2026-01-01", createdBy: actor.id },
    { id: "c", productId: "tablet", serial: "TAB-1", condition: "nuevo", status: "en_bodega", receivedAt: "2026-01-01", createdBy: actor.id },
  );
  return db;
};

describe("pedidos rápidos por IMEI", () => {
  it("crea y prepara un pedido estándar agrupado por referencia y color, sin despacho", () => {
    const db = fixture();
    const order = crearPedidoRapidoPorSeriales(db, actor, {
      customerId: "buyer",
      serials: [{ serial: "IMEI-1" }, { serial: "IMEI-2", color: "Negro" }, { serial: "TAB-1" }],
    });
    expect(order.status).toBe("preparado");
    expect(db.orderItems.filter((item) => item.orderId === order.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: "phone", color: "Negro", condition: "seminuevo", quantity: 2 }),
      expect.objectContaining({ productId: "tablet", condition: "nuevo", quantity: 1 }),
    ]));
    expect(db.orderItemUnits).toHaveLength(3);
    expect(db.units.every((unit) => unit.status === "en_bodega")).toBe(true);
    expect(db.movements.filter((m) => m.type === "salida")).toHaveLength(0);
  });

  it("rechaza repetidos y no crea un pedido incompleto", () => {
    const db = fixture();
    expect(() => crearPedidoRapidoPorSeriales(db, actor, {
      customerId: "buyer", serials: [{ serial: "IMEI-1" }, { serial: "imei-1" }],
    })).toThrow(DomainError);
    expect(db.orders).toHaveLength(0);
    expect(db.orderItemUnits).toHaveLength(0);
  });

  it("rechaza seriales reservados, inexistentes o no disponibles sin escribir nada", () => {
    for (const kind of ["reserved", "missing", "sold"] as const) {
      const db = fixture();
      if (kind === "reserved") {
        db.orders.push({ id: "other", customerId: "buyer", code: "PED-OTHER", status: "preparado", orderDate: "2026-01-01", createdBy: actor.id, createdAt: "2026-01-01", updatedAt: "2026-01-01" });
        db.orderItems.push({ id: "item", orderId: "other", productId: "phone", condition: "seminuevo", quantity: 1 });
        db.orderItemUnits.push({ id: "assignment", orderItemId: "item", unitId: "a", createdAt: "2026-01-01" });
      }
      if (kind === "sold") db.units[0].status = "vendido";
      expect(() => crearPedidoRapidoPorSeriales(db, actor, {
        customerId: "buyer", serials: [{ serial: kind === "missing" ? "UNKNOWN" : "IMEI-1" }],
      })).toThrow(DomainError);
      expect(db.orders.filter((order) => order.status === "en_preparacion")).toHaveLength(0);
      expect(db.movements).toHaveLength(0);
    }
  });

  it("exige color cuando hay variantes pero inventario no identifica una", () => {
    const db = fixture();
    expect(() => crearPedidoRapidoPorSeriales(db, actor, {
      customerId: "buyer", serials: [{ serial: "IMEI-2" }],
    })).toThrow(DomainError);
    expect(db.orders).toHaveLength(0);
  });

  it("respeta categoría del cliente y permisos", () => {
    const db = fixture();
    db.customers[0].categoriaMayorista = "repuestos";
    expect(() => crearPedidoRapidoPorSeriales(db, actor, {
      customerId: "buyer", serials: [{ serial: "TAB-1" }],
    })).toThrow(DomainError);
    expect(db.orders).toHaveLength(0);
  });
});
