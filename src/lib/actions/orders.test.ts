import { describe, expect, it } from "vitest";
import { DomainError, emptyDb } from "../db";
import type { Actor, Order, OrderItem, Product, Unit } from "../types";
import { confirmarPreparacionPedido, confirmarDespachoPedido, editarCantidadReferencia, editarPrecioReferencia, regresarPedidoASerializacion, serializarImeiPedido } from "./orders";

const actor: Actor = { id: "admin-test", email: "admin@example.test", fullName: "Prueba", role: "admin" };
const producto: Product = {
  id: "producto-test", sku: "TAB-TEST", name: "Tablet test", categoria: "tablet",
  minStock: 0, isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};
const pedido: Order = {
  id: "pedido-test", code: "PED-TEST", customerId: "cliente-test", status: "en_preparacion",
  orderDate: "2026-01-01", createdBy: actor.id,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};
const linea: OrderItem = {
  id: "linea-test", orderId: pedido.id, productId: producto.id,
  condition: "nuevo", quantity: 2,
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
  it("reserva al preparar y registra la salida únicamente al confirmar el despacho", () => {
    const db = emptyDb();
    db.products.push(producto);
    db.orders.push({ ...pedido });
    db.orderItems.push({ ...linea, quantity: 1 });
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
    expect(db.movements.filter((movement) => movement.type === "salida")).toHaveLength(0);

    confirmarDespachoPedido(db, actor, { orderId: pedido.id });
    expect(db.orders[0].status).toBe("despachado");
    expect(db.units[0].status).toBe("vendido");
    expect(db.movements.filter((movement) => movement.type === "salida")).toHaveLength(1);
  });



});

describe("regreso seguro de preparado a serialización", () => {
  it("conserva los IMEI reservados sin generar salidas antes del despacho", () => {
    const db = emptyDb();
    db.products.push({ ...producto });
    db.orders.push({ ...pedido, status: "en_preparacion" });
    db.orderItems.push({ ...linea, quantity: 1 });
    db.units.push({ ...unidad }, { ...unidad, id: "unidad-2", serial: "SERIAL-67890" });
    db.orderItemUnits.push({
      id: "asignacion-1", orderItemId: linea.id, unitId: unidad.id, createdAt: pedido.createdAt,
    });

    confirmarPreparacionPedido(db, actor, { orderId: pedido.id });
    const asignacionesOriginales = db.orderItemUnits.map((a) => ({ ...a }));
    const reabierto = regresarPedidoASerializacion(db, actor, { orderId: pedido.id });

    expect(reabierto.status).toBe("en_preparacion");
    expect(db.orderItemUnits).toEqual(asignacionesOriginales);
    expect(db.units.find((u) => u.id === unidad.id)?.status).toBe("en_bodega");
    expect(db.movements.filter((movement) => movement.type === "salida")).toHaveLength(0);

    editarCantidadReferencia(db, actor, { orderItemId: linea.id, nuevaCantidad: 2 });
    serializarImeiPedido(db, actor, { orderId: pedido.id, imei: "SERIAL-67890" });
    expect(db.orderItemUnits.map((a) => a.unitId).sort()).toEqual(["unidad-2", unidad.id].sort());

    confirmarPreparacionPedido(db, actor, { orderId: pedido.id });
    expect(db.orders[0].status).toBe("preparado");
    expect(db.orderItemUnits).toHaveLength(2);
    expect(db.units.every((u) => u.status === "en_bodega")).toBe(true);
    expect(db.movements.filter((movement) => movement.type === "salida")).toHaveLength(0);
  });

  it("no reabre pedidos despachados o cancelados, ni altera sus seriales", () => {
    for (const status of ["despachado", "cancelado"] as const) {
      const db = emptyDb();
      db.orders.push({ ...pedido, status });
      db.orderItems.push({ ...linea, quantity: 1 });
      db.units.push({ ...unidad });
      db.orderItemUnits.push({
        id: "asignacion-1", orderItemId: linea.id, unitId: unidad.id, createdAt: pedido.createdAt,
      });
      expect(() => regresarPedidoASerializacion(db, actor, { orderId: pedido.id })).toThrow(DomainError);
      expect(db.orders[0].status).toBe(status);
      expect(db.orderItemUnits).toHaveLength(1);
      expect(db.units[0].status).toBe("en_bodega");
      expect(db.movements).toHaveLength(0);
    }
  });
});
