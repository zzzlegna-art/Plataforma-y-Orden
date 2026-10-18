import { describe, expect, it } from "vitest";
import { DomainError, emptyDb } from "../db";
import type { Actor, Product, Unit } from "../types";
import { addReceptionItem, confirmReception, createReception } from "./receptions";

const actor: Actor = { id: "admin-test", email: "admin@example.test", fullName: "Prueba", role: "admin" };
const producto: Product = {
  id: "producto-test",
  sku: "TAB-TEST",
  name: "Tablet para prueba",
  categoria: "tablet",
  price: 100,
  cost: 50,
  minStock: 0,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const entrada = (id: string, serial = "SERIAL-12345"): Unit => ({
  id,
  productId: producto.id,
  serial,
  condition: "nuevo",
  status: "en_bodega",
  receivedAt: "2026-01-01T00:00:00.000Z",
  createdBy: actor.id,
});

describe("protección de seriales en recepción", () => {
  it("no permite repetir un serial dentro de la misma recepción", () => {
    const db = emptyDb();
    db.products.push(producto);
    const reception = createReception(db, actor, {});
    const input = { receptionId: reception.id, productId: producto.id, serial: "SERIAL-12345", condition: "nuevo" as const };
    addReceptionItem(db, actor, input);
    expect(() => addReceptionItem(db, actor, input)).toThrow(DomainError);
    expect(db.receptionItems).toHaveLength(1);
  });

  it("bloquea un serial si sigue activo en el inventario", () => {
    const db = emptyDb();
    db.products.push(producto);
    db.units.push(entrada("unidad-1"));
    const reception = createReception(db, actor, {});
    expect(() => addReceptionItem(db, actor, {
      receptionId: reception.id, productId: producto.id, serial: "serial-12345", condition: "nuevo",
    })).toThrow(DomainError);
  });

  it("permite reingresar una unidad liberada sin duplicarla ni borrar su historial", () => {
    const db = emptyDb();
    db.products.push(producto);
    db.units.push({ ...entrada("unidad-liberada"), status: "liberado" });
    const recepcionAnterior = createReception(db, actor, {});
    recepcionAnterior.status = "confirmada";
    const reception = createReception(db, actor, {});
    addReceptionItem(db, actor, {
      receptionId: reception.id, productId: producto.id, serial: "SERIAL-12345", condition: "nuevo",
    });
    confirmReception(db, actor, { id: reception.id });
    expect(db.units).toHaveLength(1);
    expect(db.units[0].id).toBe("unidad-liberada");
    expect(db.units[0].status).toBe("en_bodega");
    expect(db.movements.some((m) => m.unitId === "unidad-liberada" && m.type === "entrada")).toBe(true);
  });

  it("no confirma dos veces una misma recepción", () => {
    const db = emptyDb();
    db.products.push(producto);
    const reception = createReception(db, actor, {});
    addReceptionItem(db, actor, {
      receptionId: reception.id, productId: producto.id, serial: "SERIAL-12345", condition: "nuevo",
    });
    confirmReception(db, actor, { id: reception.id });
    expect(() => confirmReception(db, actor, { id: reception.id })).toThrow(DomainError);
    expect(db.units).toHaveLength(1);
  });
});
