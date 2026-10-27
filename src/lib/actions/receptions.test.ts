import { describe, expect, it } from "vitest";
import { DomainError, emptyDb } from "../db";
import type { Actor, Product, Unit } from "../types";
import { addReceptionItem, confirmReception, createReception, updateReception, updateReceptionSupplier } from "./receptions";

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

describe("proveedor registrado en una recepción", () => {
  it("asigna el proveedor elegido al crear y editar sin confundirlo con la referencia", () => {
    const db = emptyDb();
    const reception = createReception(db, actor, {
      supplierId: "proveedor-uno", reference: "REM-4471",
    });
    expect(reception.supplierId).toBe("proveedor-uno");
    expect(reception.reference).toBe("REM-4471");

    const updated = updateReception(db, actor, {
      id: reception.id, supplierId: "proveedor-dos", reference: "REM-4471",
    });
    expect(updated.supplierId).toBe("proveedor-dos");
    expect(updated.reference).toBe("REM-4471");
  });

  it("permite mantener una recepción anterior sin proveedor", () => {
    const db = emptyDb();
    const reception = createReception(db, actor, { reference: "Antigua" });
    expect(reception.supplierId).toBeUndefined();
    expect(reception.reference).toBe("Antigua");
  });
});

describe("corrección retrospectiva del proveedor", () => {
  it("asocia 1.350 seriales a un proveedor después de confirmar sin tocar stock ni movimientos", () => {
    const db = emptyDb();
    db.products.push(producto);
    const reception = createReception(db, actor, { reference: "REM-4471" });
    for (let i = 0; i < 1350; i++) {
      db.receptionItems.push({
        id: "item-" + i, receptionId: reception.id, productId: producto.id,
        serial: "SR-" + i, condition: "nuevo", createdAt: "2026-10-27T10:00:00Z",
      });
    }
    confirmReception(db, actor, { id: reception.id });
    const unitsBefore = JSON.stringify(db.units);
    const movementsBefore = JSON.stringify(db.movements);
    const auditBefore = db.auditLogs.length;

    const updated = updateReceptionSupplier(db, actor, {
      id: reception.id, supplierId: "proveedor-nuevo",
    });
    expect(updated.status).toBe("confirmada");
    expect(updated.supplierId).toBe("proveedor-nuevo");
    expect(db.units.filter((unit) => unit.receptionId === reception.id)).toHaveLength(1350);
    expect(JSON.stringify(db.units)).toBe(unitsBefore);
    expect(JSON.stringify(db.movements)).toBe(movementsBefore);
    expect(db.auditLogs).toHaveLength(auditBefore + 1);
    expect(db.auditLogs.at(-1)).toEqual(expect.objectContaining({
      entity: "reception", action: "update", entityId: reception.id,
    }));

    updateReceptionSupplier(db, actor, { id: reception.id, supplierId: "proveedor-otro" });
    expect(updated.supplierId).toBe("proveedor-otro");
    updateReceptionSupplier(db, actor, { id: reception.id, supplierId: "" });
    expect(updated.supplierId).toBeUndefined();
    expect(updated.reference).toBe("REM-4471");
    expect(db.movements).toHaveLength(1350);
  });

  it("también funciona antes de confirmar y no genera auditorías al repetir el mismo proveedor", () => {
    const db = emptyDb();
    const reception = createReception(db, actor, {});
    const after = updateReceptionSupplier(db, actor, { id: reception.id, supplierId: "proveedor-1" });
    const auditCount = db.auditLogs.length;
    updateReceptionSupplier(db, actor, { id: reception.id, supplierId: "proveedor-1" });
    expect(db.auditLogs).toHaveLength(auditCount);
    expect(after.status).toBe("captura");
  });

  it("mantiene el bloqueo para intentar modificar una recepción descartada", () => {
    const db = emptyDb();
    const reception = createReception(db, actor, {});
    reception.status = "descartada";
    expect(() => updateReceptionSupplier(db, actor, {
      id: reception.id, supplierId: "proveedor-1",
    })).toThrowError(DomainError);
  });
});

describe("confirmación de recepciones grandes", () => {
  it("confirma 1.350 repuestos, genera una unidad y un movimiento por pieza, sin perder capturas", () => {
    const db = emptyDb();
    const repuesto: Product = { ...producto, id: "bateria-xr", name: "Batería iPhone XR sin flex", categoria: "repuesto" };
    db.products.push(repuesto);
    const reception = createReception(db, actor, {});
    for (let i = 0; i < 1350; i++) {
      db.receptionItems.push({
        id: "item-" + i, receptionId: reception.id, productId: repuesto.id,
        serial: "REP-" + String(i + 1).padStart(4, "0"), condition: "nuevo",
        createdAt: "2026-10-27T08:00:00Z",
      });
    }
    const confirmed = confirmReception(db, actor, { id: reception.id });
    expect(confirmed.status).toBe("confirmada");
    expect(db.receptionItems).toHaveLength(0);
    expect(db.units).toHaveLength(1350);
    expect(new Set(db.units.map((unit) => unit.serial)).size).toBe(1350);
    expect(db.movements.filter((movement) => movement.referenceId === reception.id)).toHaveLength(1350);
    expect(db.auditLogs.filter((event) => event.entityId === reception.id)).toHaveLength(1);
  });

  it("rechaza un serial repetido en un lote grande antes de crear una sola unidad", () => {
    const db = emptyDb();
    db.products.push(producto);
    const reception = createReception(db, actor, {});
    for (let i = 0; i < 1350; i++) {
      db.receptionItems.push({
        id: "item-" + i, receptionId: reception.id, productId: producto.id,
        serial: i === 1349 ? "SERIAL-0002" : "SERIAL-" + String(i + 1).padStart(4, "0"),
        condition: "nuevo", createdAt: "2026-10-27T08:00:00Z",
      });
    }
    expect(() => confirmReception(db, actor, { id: reception.id }))
      .toThrowError(DomainError);
    expect(db.units).toHaveLength(0);
    expect(db.movements).toHaveLength(0);
    expect(reception.status).toBe("captura");
    expect(db.receptionItems).toHaveLength(1350);
  });
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
