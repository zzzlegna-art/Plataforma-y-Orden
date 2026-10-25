import { describe, expect, it } from "vitest";
import { DomainError, emptyDb } from "../db";
import type { Actor, Order, OrderItem, Product, Unit } from "../types";
import { confirmarPreparacionPedido, confirmarVentaPedido, editarPrecioReferencia } from "./orders";

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
    expect(() => confirmarPreparacionPedido(db, actor, { orderId: pedido.id })).toThrow(DomainError);
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
    expect(() => confirmarPreparacionPedido(db, actor, { orderId: pedido.id })).toThrow(DomainError);
    expect(db.units[0].status).toBe("en_bodega");
  });
  it("separa la preparación de la salida y solo vende en la segunda confirmación", () => {
    const db = emptyDb();
    db.products.push(producto);
    db.orders.push({ ...pedido });
    db.orderItems.push({ ...linea, quantity: 1, subtotal: 150 });
    db.units.push({ ...unidad });
    db.orderItemUnits.push({
      id: "asignacion-1",
      orderItemId: linea.id,
      unitId: unidad.id,
      createdAt: pedido.createdAt,
    });

    confirmarPreparacionPedido(db, actor, { orderId: pedido.id });
    expect(db.orders[0].status).toBe("preparado");
    expect(db.units[0].status).toBe("en_bodega");
    expect(db.movements).toHaveLength(0);

    confirmarVentaPedido(db, actor, { orderId: pedido.id });
    expect(db.orders[0].status).toBe("despachado");
    expect(db.units[0].status).toBe("vendido");
    expect(db.movements).toHaveLength(1);
  });

  it("permite negociar el precio de una línea y recalcula subtotal y total del pedido", () => {
    const db = emptyDb();
    db.products.push({ ...producto });
    db.orders.push({ ...pedido, status: "preparado", total: 300 });
    db.orderItems.push({ ...linea, quantity: 2, unitPrice: 150, subtotal: 300 });

    const updated = editarPrecioReferencia(db, actor, {
      orderItemId: linea.id,
      nuevoPrecio: 125,
    });

    expect(updated.unitPrice).toBe(125);
    expect(updated.subtotal).toBe(250);
    expect(db.orders[0].total).toBe(250);
    expect(db.products[0].price).toBe(150);
  });

  it("permite guardar precio por debajo del costo para mostrar advertencia, pero la venta sigue bloqueada", () => {
    const db = emptyDb();
    db.products.push({ ...producto, cost: 175 });
    db.orders.push({ ...pedido, status: "preparado" });
    db.orderItems.push({ ...linea, quantity: 1, subtotal: 150 });
    db.units.push({ ...unidad, cost: 180 });
    db.orderItemUnits.push({
      id: "asignacion-1",
      orderItemId: linea.id,
      unitId: unidad.id,
      createdAt: pedido.createdAt,
    });

    editarPrecioReferencia(db, actor, { orderItemId: linea.id, nuevoPrecio: 160 });
    expect(db.orderItems[0].unitPrice).toBe(160);
    expect(db.orders[0].total).toBe(160);
    expect(() => confirmarVentaPedido(db, actor, { orderId: pedido.id })).toThrow(DomainError);
    expect(db.orders[0].status).toBe("preparado");
  });

  it("bloquea confirmar la venta cuando el precio es inferior al costo real de la unidad", () => {
    const db = emptyDb();
    db.products.push({ ...producto, cost: 175 });
    db.orders.push({ ...pedido, status: "preparado" });
    db.orderItems.push({ ...linea, quantity: 1, unitPrice: 150, subtotal: 150 });
    db.units.push({ ...unidad, cost: 180 });
    db.orderItemUnits.push({
      id: "asignacion-1",
      orderItemId: linea.id,
      unitId: unidad.id,
      createdAt: pedido.createdAt,
    });

    expect(() => confirmarVentaPedido(db, actor, { orderId: pedido.id })).toThrow(DomainError);
    expect(db.orders[0].status).toBe("preparado");
    expect(db.units[0].status).toBe("en_bodega");
    expect(db.movements).toHaveLength(0);
  });

});
