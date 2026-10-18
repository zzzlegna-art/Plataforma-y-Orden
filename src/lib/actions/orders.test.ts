import { describe, expect, it } from "vitest";
import { DomainError, emptyDb } from "../db";
import type { Actor, Order, OrderItem, Product, Unit } from "../types";
import { finalizarPedido } from "./orders";

const actor: Actor = { id: "admin-test", email: "admin@example.test", fullName: "Prueba", role: "admin" };
const producto: Product = {
  id: "producto-test", sku: "TAB-TEST", name: "Tablet test", categoria: "tablet",
  price: 150, cost: 75, minStock: 0, isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};
const pedido: Order = {
  id: "pedido-test", code: "PED-TEST", customerId: "cliente-test", status: "en_preparacion",
  orderDate: "2026-01-01", total: 300, createdBy: actor.id,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};
const linea: OrderItem = {
  id: "linea-test", orderId: pedido.id, productId: producto.id,
  condition: "nuevo", quantity: 2, unitPrice: 150, subtotal: 300,
};
const unidad: Unit = {
  id: "unidad-test", productId: producto.id, serial: "SERIAL-12345",
  condition: "nuevo", status: "en_bodega",
  receivedAt: "2026-01-01T00:00:00.000Z", createdBy: actor.id,
};

describe("despacho seguro de pedidos", () => {
  it("rechaza asignar dos veces la misma unidad antes de hacer movimientos", () => {
    const db = emptyDb();
    db.products.push(producto);
    db.orders.push({ ...pedido });
    db.orderItems.push({ ...linea });
    db.units.push({ ...unidad });
    db.orderItemUnits.push(
      { id: "asignacion-1", orderItemId: linea.id, unitId: unidad.id, createdAt: pedido.createdAt },
      { id: "asignacion-2", orderItemId: linea.id, unitId: unidad.id, createdAt: pedido.createdAt },
    );
    expect(() => finalizarPedido(db, actor, { orderId: pedido.id })).toThrow(DomainError);
    expect(db.orders[0].status).toBe("en_preparacion");
    expect(db.units[0].status).toBe("en_bodega");
    expect(db.movements).toHaveLength(0);
  });

  it("impide despachar unidades que no coinciden con la condición pedida", () => {
    const db = emptyDb();
    db.products.push(producto);
    db.orders.push({ ...pedido });
    db.orderItems.push({ ...linea, quantity: 1 });
    db.units.push({ ...unidad, condition: "seminuevo" });
    db.orderItemUnits.push({ id: "asignacion-1", orderItemId: linea.id, unitId: unidad.id, createdAt: pedido.createdAt });
    expect(() => finalizarPedido(db, actor, { orderId: pedido.id })).toThrow(DomainError);
    expect(db.units[0].status).toBe("en_bodega");
  });
});
