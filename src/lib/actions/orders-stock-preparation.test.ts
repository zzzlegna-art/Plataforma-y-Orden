import { describe, expect, it } from "vitest";
import { emptyDb } from "../db";
import type { Actor, Db } from "../types";
import { confirmarDespachoPedido, confirmarPreparacionPedido, quitarImeiPedido } from "./orders";

const actor: Actor = { id: "admin-stock", email: "admin@example.test", fullName: "Admin", role: "admin" };
const inventory = (): Db => {
  const db = emptyDb();
  db.products.push({
    id: "modelo", sku: "SKU-1", name: "Modelo prueba", categoria: "celular",
    minStock: 0, isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  });
  db.customers.push({
    id: "cliente", name: "Cliente", isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  db.orders.push({
    id: "pedido", code: "PED-STOCK", customerId: "cliente", status: "en_preparacion",
    orderDate: "2026-01-01", createdBy: actor.id,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  });
  db.orderItems.push({
    id: "linea", orderId: "pedido", productId: "modelo", quantity: 1, condition: "nuevo",
  });
  db.units.push({
    id: "unidad", productId: "modelo", serial: "SERIAL-A", condition: "nuevo",
    status: "en_bodega", receivedAt: "2026-01-01T00:00:00.000Z", createdBy: actor.id,
  });
  db.orderItemUnits.push({
    id: "asignacion", orderItemId: "linea", unitId: "unidad",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  return db;
};

describe("Pedidos · preparación y despacho sin dependencia financiera", () => {
  it("prepara el pedido sin sacar físicamente el serial y lo despacha al confirmar", () => {
    const db = inventory();
    confirmarPreparacionPedido(db, actor, { orderId: "pedido" });
    expect(db.orders[0].status).toBe("preparado");
    expect(db.units[0].status).toBe("en_bodega");
    expect(db.movements.filter((movement) => movement.type === "salida")).toHaveLength(0);

    confirmarDespachoPedido(db, actor, { orderId: "pedido" });
    expect(db.orders[0].status).toBe("despachado");
    expect(db.units[0].status).toBe("vendido");
    expect(db.movements.filter((movement) => movement.type === "salida")).toHaveLength(1);
  });

  it("libera el serial al retirarlo del pedido antes del despacho y conserva la trazabilidad", () => {
    const db = inventory();
    quitarImeiPedido(db, actor, { orderId: "pedido", imei: "SERIAL-A" });
    expect(db.orderItemUnits).toHaveLength(0);
    expect(db.units[0].status).toBe("en_bodega");
    expect(db.movements.filter((movement) => movement.type === "salida")).toHaveLength(0);
    expect(db.movements.some((movement) => movement.type === "ajuste" && movement.notes?.includes("retirado"))).toBe(true);
  });

  it("permite despachar un pedido sin validar precios ni costos", () => {
    const db = inventory();
    confirmarPreparacionPedido(db, actor, { orderId: "pedido" });
    expect(() => confirmarDespachoPedido(db, actor, { orderId: "pedido" })).not.toThrow();
    expect(db.orders[0].status).toBe("despachado");
  });
});
