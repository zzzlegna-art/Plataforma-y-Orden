import { describe, expect, it } from "vitest";

import { emptyDb } from "../db";
import type { Actor, Db } from "../types";
import { getWarrantyOrigin } from "../warranty-origin";
import { createWarrantiesPorImeiDesdePrevias, createWarrantiesPrevias } from "./warranties";

const actor: Actor = {
  id: "user-1", email: "warehouse@example.test", fullName: "Operador", role: "admin",
};
const now = "2026-11-23T10:00:00Z";
const previa = (imeiManual: string, clienteManual: string, observacion: string) => ({
  imeiManual,
  referenciaManual: "iPhone 13 128 GB",
  clienteManual,
  fechaVentaManual: "2026-10-10",
  observacion,
});

const buildDb = (): Db => {
  const db = emptyDb();
  db.products.push({
    id: "prod-1", sku: "IP13-128", name: "iPhone 13 128 GB", categoria: "celular",
    minStock: 0, isActive: true, createdAt: now, updatedAt: now,
  });
  db.customers.push({
    id: "cliente-venta", name: "Mayorista de la venta", isActive: true, createdAt: now,
  });
  db.units.push(
    { id: "u-1", productId: "prod-1", serial: "IMEI-VENDIDO-1",
      condition: "seminuevo", status: "vendido", receivedAt: now, createdBy: actor.id },
    { id: "u-2", productId: "prod-1", serial: "IMEI-VENDIDO-2",
      condition: "seminuevo", status: "entregado_garantia", receivedAt: now, createdBy: actor.id },
    { id: "u-3", productId: "prod-1", serial: "IMEI-EN-BODEGA",
      condition: "seminuevo", status: "en_bodega", receivedAt: now, createdBy: actor.id },
  );
  db.orders.push({
    id: "order-1", code: "PED-1", customerId: "cliente-venta", status: "despachado",
    orderDate: now, createdAt: now, createdBy: actor.id, updatedAt: now,
  });
  db.orderItems.push({
    id: "item-1", orderId: "order-1", productId: "prod-1", quantity: 2,
  });
  db.orderItemUnits.push(
    { id: "oiu-1", orderItemId: "item-1", unitId: "u-1", createdAt: now },
    { id: "oiu-2", orderItemId: "item-1", unitId: "u-2", createdAt: now },
  );
  return db;
};

describe("Garantía previa por lote → recibir los seriales existentes por IMEI", () => {
  it("recibe los dos IMEI de la venta, mantiene motivos y clientes manuales sin perder el pedido original", () => {
    const db = buildDb();
    const items = [
      previa("IMEI-VENDIDO-1", "Lucho Ibagué", "Lentes pintados - parlante defectuoso"),
      previa("IMEI-VENDIDO-2", "Manito Valledupar", "No carga y falla de micrófono"),
    ];
    const previaFail = createWarrantiesPrevias(db, actor, { items });
    expect(previaFail.map((r) => r.motivo_error)).toEqual([
      "errors.previaSerialInSystem", "errors.previaSerialInSystem",
    ]);
    expect(db.warranties).toHaveLength(0);

    const results = createWarrantiesPorImeiDesdePrevias(db, actor, { items });
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(db.warranties).toHaveLength(2);
    const w1 = db.warranties.find((w) => w.unitId === "u-1")!;
    const w2 = db.warranties.find((w) => w.unitId === "u-2")!;
    expect(w1).toEqual(expect.objectContaining({
      orderId: "order-1",
      customerId: "cliente-venta",
      clienteManual: "Lucho Ibagué",
      referenciaManual: "iPhone 13 128 GB",
      fechaVentaManual: "2026-10-10",
      reason: "Lentes pintados - parlante defectuoso",
      status: "recibido",
    }));
    expect(w2.clienteManual).toBe("Manito Valledupar");
    expect(w2.reason).toBe("No carga y falla de micrófono");
    expect(getWarrantyOrigin(w1, db.orders[0])).toBe("normal");
    expect(db.units[0].status).toBe("en_reparacion");
    expect(db.units[1].status).toBe("en_reparacion");
    expect(db.movements.filter((m) => m.type === "garantia")).toHaveLength(2);
  });

  it("procesa únicamente los vendidos; los de bodega permanecen pendientes sin alterar su estado", () => {
    const db = buildDb();
    const items = [
      previa("IMEI-VENDIDO-1", "Lucho Ibagué", "Falla de volumen"),
      previa("IMEI-EN-BODEGA", "Lucho Ibagué", "Pantalla sin imagen"),
    ];
    const result = createWarrantiesPorImeiDesdePrevias(db, actor, { items });
    expect(result.map((item) => item.ok)).toEqual([true, false]);
    expect(result[1].motivo_error).toBe("errors.unitNotReturnable");
    expect(db.warranties).toHaveLength(1);
    expect(db.units[2].status).toBe("en_bodega");
  });

  it("rechaza casos ya abiertos por IMEI, sin duplicar garantías ni movimientos", () => {
    const db = buildDb();
    const item = previa("IMEI-VENDIDO-1", "Lucho Ibagué", "Falla de volumen");
    const first = createWarrantiesPorImeiDesdePrevias(db, actor, { items: [item] });
    expect(first[0].ok).toBe(true);
    const second = createWarrantiesPorImeiDesdePrevias(db, actor, { items: [item] });
    expect(second[0].ok).toBe(false);
    expect(db.warranties).toHaveLength(1);
    expect(db.movements.filter((m) => m.type === "garantia")).toHaveLength(1);
  });

  it("valida los datos manuales antes de cambiar el estado de la unidad", () => {
    const db = buildDb();
    const item = previa("IMEI-VENDIDO-1", "", "Pantalla sin imagen");
    const result = createWarrantiesPorImeiDesdePrevias(db, actor, { items: [item] });
    expect(result[0].ok).toBe(false);
    expect(db.warranties).toHaveLength(0);
    expect(db.units[0].status).toBe("vendido");
  });
});
