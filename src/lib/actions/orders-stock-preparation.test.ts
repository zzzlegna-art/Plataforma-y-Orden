import { describe, expect, it } from "vitest";

import { DomainError, emptyDb } from "../db";
import { getDashboard, getProductStock } from "../selectors";
import type { Actor, Db, Unit } from "../types";
import {
  cancelarPedido,
  confirmarPreparacionPedido,
  confirmarVentaPedido,
  editarPrecioReferencia,
  regresarPedidoASerializacion,
  quitarImeiPedido,
} from "./orders";

const actor: Actor = { id: "admin-stock", email: "admin@example.test", fullName: "Admin", role: "admin" };

const inventario = (): Db => {
  const db = emptyDb();
  db.products.push({
    id: "modelo", sku: "SKU-1", name: "Modelo prueba", categoria: "celular",
    price: 200, cost: 120, minStock: 0, isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  });
  db.orders.push({
    id: "pedido", code: "PED-STOCK", customerId: "cliente",
    status: "en_preparacion", orderDate: "2026-01-01", total: 200,
    createdBy: actor.id, createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  db.orderItems.push({
    id: "linea", orderId: "pedido", productId: "modelo",
    quantity: 1, condition: "nuevo", unitPrice: 200, subtotal: 200,
  });
  const unit = (id: string, serial: string, status: Unit["status"]): Unit => ({
    id, productId: "modelo", serial, condition: "nuevo", status, cost: 120,
    receivedAt: "2026-01-01T00:00:00.000Z", createdBy: actor.id,
  });
  db.units.push(unit("unidad-bodega", "SERIAL-A", "en_bodega"));
  db.units.push(unit("unidad-local", "SERIAL-B", "en_local"));
  db.orderItemUnits.push({
    id: "asignacion-a", orderItemId: "linea", unitId: "unidad-bodega",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  return db;
};

describe("stock operativo: exclusión desde primer IMEI asignado al pedido", () => {
  it("descuenta desde el primer IMEI serializado sin volver a descontar al vender", () => {
    const db = inventario();
    expect(getProductStock(db, "modelo").disponible).toBe(1);
    expect(getProductStock(db, "modelo").enPedidos).toBe(1);
    expect(getProductStock(db, "modelo").enSedeFisica).toBe(2);
    expect(getDashboard(db).kpis.inventoryValue).toBe(120);
    confirmarPreparacionPedido(db, actor, { orderId: "pedido" });
    expect(db.orders[0].status).toBe("preparado");
    expect(getProductStock(db, "modelo").disponible).toBe(1);
    expect(getProductStock(db, "modelo").enInventario).toBe(1);
    expect(getDashboard(db).kpis.available).toBe(1);
    expect(getDashboard(db).kpis.inventoryValue).toBe(120);
    expect(db.units[0].status).toBe("en_bodega"); // No es una venta anticipada.
    expect(db.movements.filter((m) => m.type === "salida")).toHaveLength(0);

    confirmarVentaPedido(db, actor, { orderId: "pedido" });
    expect(db.orders[0].status).toBe("despachado");
    expect(db.units[0].status).toBe("vendido");
    expect(getProductStock(db, "modelo").disponible).toBe(1);
    expect(getDashboard(db).kpis.inventoryValue).toBe(120);
    expect(db.movements.filter((m) => m.type === "salida")).toHaveLength(1);
  });

  it("libera el IMEI al retirarlo antes del despacho y conserva la trazabilidad", () => {
    const db = inventario();
    quitarImeiPedido(db, actor, { orderId: "pedido", imei: "SERIAL-A" });
    expect(db.orderItemUnits).toHaveLength(0);
    expect(db.units.find((unit) => unit.id === "unidad-bodega")?.status).toBe("en_bodega");
    expect(db.movements.filter((movement) => movement.type === "salida")).toHaveLength(0);
    expect(db.movements.some((movement) => movement.type === "ajuste" && movement.notes?.includes("retirado"))).toBe(true);
  });

  it("revierte una salida heredada al retirar un serial antes del despacho", () => {
    const db = inventario();
    db.units[0].status = "vendido";
    db.movements.push({
      id: "salida-antigua",
      productId: "modelo",
      unitId: "unidad-bodega",
      type: "salida",
      quantity: 1,
      referenceType: "pedido",
      referenceId: "pedido",
      notes: "Salida física por serialización confirmada",
      createdBy: actor.id,
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    quitarImeiPedido(db, actor, { orderId: "pedido", imei: "SERIAL-A" });
    expect(db.units[0].status).toBe("en_bodega");
    expect(db.movements.filter((movement) => movement.type === "salida")).toHaveLength(1);
    expect(db.movements.filter((movement) => movement.type === "devolucion")).toHaveLength(1);
    expect(db.orderItemUnits).toHaveLength(0);
  });

  it("conserva el IMEI fuera del stock libre cuando el pedido se reabre", () => {
    const db = inventario();
    confirmarPreparacionPedido(db, actor, { orderId: "pedido" });
    regresarPedidoASerializacion(db, actor, { orderId: "pedido" });
    expect(getProductStock(db, "modelo").disponible).toBe(1);
    expect(getProductStock(db, "modelo").enPedidos).toBe(1);
    expect(db.orderItemUnits.map((a) => a.unitId)).toEqual(["unidad-bodega"]);
    confirmarPreparacionPedido(db, actor, { orderId: "pedido" });
    expect(getProductStock(db, "modelo").disponible).toBe(1);
    expect(db.movements.filter((m) => m.type === "salida")).toHaveLength(0);
  });

  it("recupera unidades del stock disponible al cancelar sin vender", () => {
    const db = inventario();
    confirmarPreparacionPedido(db, actor, { orderId: "pedido" });
    cancelarPedido(db, actor, { orderId: "pedido", motivo: "Pedido anulado" });
    expect(db.orders[0].status).toBe("cancelado");
    expect(db.orderItemUnits).toHaveLength(0);
    expect(getProductStock(db, "modelo").disponible).toBe(2);
    expect(getDashboard(db).kpis.inventoryValue).toBe(240);
    expect(db.movements.filter((m) => m.type === "salida")).toHaveLength(0);
  });

  it("si los precios no alcanzan el costo, no confirma la venta ni libera los seriales", () => {
    const db = inventario();
    confirmarPreparacionPedido(db, actor, { orderId: "pedido" });
    editarPrecioReferencia(db, actor, { orderItemId: "linea", nuevoPrecio: 100 });
    expect(() => confirmarVentaPedido(db, actor, { orderId: "pedido" })).toThrow(DomainError);
    expect(db.orders[0].status).toBe("preparado");
    expect(db.orderItemUnits).toHaveLength(1);
    expect(getProductStock(db, "modelo").disponible).toBe(1);
    expect(db.movements.filter((m) => m.type === "salida")).toHaveLength(0);
  });
});
