import { describe, expect, it } from "vitest";
import { DomainError, emptyDb } from "../db";
import { pedidoDeSerialDesvinculado, recuperarSerialDesvinculado } from "./units";
import type { Actor, Order, OrderItem, Product, Unit } from "../types";
import { confirmarPreparacionPedido, confirmarDespachoPedido, editarCantidadReferencia, regresarPedidoASerializacion, serializarImeiPedido } from "./orders";

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

describe("recuperación administrativa de un IMEI desvinculado", () => {
  const caso = () => {
    const db = emptyDb();
    db.products.push({ ...producto });
    db.orders.push({ ...pedido, status: "preparado" });
    db.units.push({ ...unidad, status: "vendido" });
    const base = { productId: producto.id, unitId: unidad.id, quantity: 1, referenceType: "pedido" as const,
      referenceId: pedido.id, createdBy: actor.id };
    db.movements.push(
      { ...base, id: "mov-retirada", type: "ajuste", createdAt: "2026-01-02T11:00:00.000Z",
        notes: `Serial ${unidad.serial} retirado de la serialización del pedido ${pedido.code}` },
      { ...base, id: "mov-salida", type: "salida", createdAt: "2026-01-02T10:00:00.000Z",
        notes: `Salida física por serialización confirmada del pedido ${pedido.code}` },
    );
    return db;
  };

  it("restaura stock, conserva las salidas y permite serializar en otro pedido", () => {
    const db = caso();
    expect(pedidoDeSerialDesvinculado(db, db.units[0])?.id).toBe(pedido.id);
    recuperarSerialDesvinculado(db, actor, { id: unidad.id, confirmacionFisica: true });
    expect(db.units[0].status).toBe("en_bodega");
    expect(db.movements.map((m) => m.type)).toEqual(["devolucion", "ajuste", "salida"]);
    expect(db.auditLogs).toHaveLength(1);
    expect(() => recuperarSerialDesvinculado(db, actor, { id: unidad.id, confirmacionFisica: true })).toThrow(DomainError);
    db.orders.push({ ...pedido, id: "otro-pedido", code: "PED-OTRO" });
    db.orderItems.push({ ...linea, orderId: "otro-pedido" });
    expect(() => serializarImeiPedido(db, actor, { orderId: "otro-pedido", imei: unidad.serial })).not.toThrow();
    expect(db.orderItemUnits[0].unitId).toBe(unidad.id);
  });

  it("rechaza recuperación sin confirmación, sin permisos, con pedido vinculado o despachado", () => {
    const db = caso();
    expect(() => recuperarSerialDesvinculado(db, actor, { id: unidad.id, confirmacionFisica: false })).toThrow(DomainError);
    expect(() => recuperarSerialDesvinculado(db, { ...actor, role: "bodeguero" }, { id: unidad.id, confirmacionFisica: true })).toThrow(DomainError);
    db.orderItemUnits.push({ id: "vinculo", orderItemId: linea.id, unitId: unidad.id, createdAt: pedido.createdAt });
    expect(() => recuperarSerialDesvinculado(db, actor, { id: unidad.id, confirmacionFisica: true })).toThrow(DomainError);
    db.orderItemUnits = [];
    db.orders[0].status = "despachado";
    expect(() => recuperarSerialDesvinculado(db, actor, { id: unidad.id, confirmacionFisica: true })).toThrow(DomainError);
    expect(db.units[0].status).toBe("vendido");
    expect(db.movements).toHaveLength(2);
  });
});
