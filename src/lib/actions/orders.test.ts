import { describe, expect, it } from "vitest";
import { DomainError, emptyDb } from "../db";
import type { Actor, Order, OrderItem, Product, Unit } from "../types";
import { actualizarPreciosPedido, confirmarPreparacionPedido, finalizarPedido } from "./orders";

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
    db.orders.push({ ...pedido, status: "preparado" });
    db.orderItems.push({ ...linea });
    db.units.push({ ...unidad });
    db.orderItemUnits.push(
      { id: "asignacion-1", orderItemId: linea.id, unitId: unidad.id, createdAt: pedido.createdAt },
      { id: "asignacion-2", orderItemId: linea.id, unitId: unidad.id, createdAt: pedido.createdAt },
    );
    expect(() => finalizarPedido(db, actor, { orderId: pedido.id })).toThrow(DomainError);
    expect(db.orders[0].status).toBe("preparado");
    expect(db.units[0].status).toBe("en_bodega");
    expect(db.movements).toHaveLength(0);
  });

  it("impide despachar unidades que no coinciden con la condición pedida", () => {
    const db = emptyDb();
    db.products.push(producto);
    db.orders.push({ ...pedido, status: "preparado" });
    db.orderItems.push({ ...linea, quantity: 1 });
    db.units.push({ ...unidad, condition: "seminuevo" });
    db.orderItemUnits.push({ id: "asignacion-1", orderItemId: linea.id, unitId: unidad.id, createdAt: pedido.createdAt });
    expect(() => finalizarPedido(db, actor, { orderId: pedido.id })).toThrow(DomainError);
    expect(db.units[0].status).toBe("en_bodega");
  });

  it("confirma preparación sin vender ni descontar unidades", () => {
    const db = emptyDb();
    db.products.push({ ...producto, cost: 75 });
    db.orders.push({ ...pedido, status: "en_preparacion" });
    db.orderItems.push({ ...linea, quantity: 1, unitPrice: 150, subtotal: 150 });
    db.units.push({ ...unidad, cost: 75 });
    db.orderItemUnits.push({ id: "asignacion-1", orderItemId: linea.id, unitId: unidad.id, createdAt: pedido.createdAt });

    const result = confirmarPreparacionPedido(db, actor, { orderId: pedido.id });
    expect(result.status).toBe("preparado");
    expect(db.units[0].status).toBe("en_bodega");
    expect(db.movements).toHaveLength(0);
  });

  it("bloquea la venta por debajo del costo real de la unidad", () => {
    const db = emptyDb();
    db.products.push({ ...producto, cost: 70 });
    db.orders.push({ ...pedido, status: "preparado" });
    db.orderItems.push({ ...linea, quantity: 1, unitPrice: 70, subtotal: 70 });
    db.units.push({ ...unidad, cost: 80 });
    db.orderItemUnits.push({ id: "asignacion-1", orderItemId: linea.id, unitId: unidad.id, createdAt: pedido.createdAt });

    expect(() => finalizarPedido(db, actor, { orderId: pedido.id, aceptarMargenBajo: true })).toThrow(DomainError);
    expect(db.orders[0].status).toBe("preparado");
    expect(db.units[0].status).toBe("en_bodega");
    expect(db.movements).toHaveLength(0);
  });

  it("requiere aceptación expresa cuando el margen es inferior al 5 %", () => {
    const db = emptyDb();
    db.products.push({ ...producto, cost: 95 });
    db.orders.push({ ...pedido, status: "preparado" });
    db.orderItems.push({ ...linea, quantity: 1, unitPrice: 100, subtotal: 100 });
    db.units.push({ ...unidad, cost: 96 });
    db.orderItemUnits.push({ id: "asignacion-1", orderItemId: linea.id, unitId: unidad.id, createdAt: pedido.createdAt });

    expect(() => finalizarPedido(db, actor, { orderId: pedido.id })).toThrow(DomainError);
    expect(db.units[0].status).toBe("en_bodega");

    const result = finalizarPedido(db, actor, { orderId: pedido.id, aceptarMargenBajo: true });
    expect(result.status).toBe("despachado");
    expect(db.units[0].status).toBe("vendido");
    expect(db.movements).toHaveLength(1);
  });

  it("guarda el precio por referencia sin modificar el precio del catálogo", () => {
    const db = emptyDb();
    db.products.push({ ...producto });
    db.orders.push({ ...pedido, status: "preparado" });
    db.orderItems.push({ ...linea });

    actualizarPreciosPedido(db, actor, {
      orderId: pedido.id,
      precios: [{ orderItemId: linea.id, unitPrice: 180 }],
    });

    expect(db.orderItems[0].unitPrice).toBe(180);
    expect(db.orderItems[0].subtotal).toBe(360);
    expect(db.orders[0].total).toBe(360);
    expect(db.products[0].price).toBe(150);
  });
});
