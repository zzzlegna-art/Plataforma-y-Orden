import { describe, expect, it } from "vitest";
import { emptyDb } from "./db";
import type { Db, Reception, Unit, Warranty } from "./types";
import type { Supplier } from "./suppliers";
import { calculateSupplierQuality } from "./supplier-quality";

const suppliers: Supplier[] = [
  { id: "a", name: "Sunlong", isActive: true },
  { id: "b", name: "JK", isActive: true },
  { id: "c", name: "Sin pedidos", isActive: false },
];
const date = (day: number) => `2026-10-${String(day).padStart(2, "0")}T10:00:00Z`;

const receipt = (id: string, supplierId: string | undefined, day = 1): Reception => ({
  id, code: "REC-" + id, supplierId, status: "confirmada",
  receivedAt: date(day), confirmedAt: date(day),
  createdBy: "admin", createdAt: date(day),
});
const unit = (id: string, receptionId: string, day = 1, serial = id): Unit => ({
  id, productId: "p", serial, receptionId, condition: "nuevo",
  status: "vendido", receivedAt: date(day), createdBy: "admin",
});
const warranty = (id: string, unitId: string | undefined, day: number, imeiManual?: string): Warranty => ({
  id, code: "GAR-" + id, unitId, reason: "Falla de pantalla",
  status: "recibido", receivedAt: date(day),
  imeiManual, createdBy: "admin",
});
const snapshot = (db: Db) => JSON.stringify(db);

describe("estadísticas reales de novedades por proveedor", () => {
  it("ordena por tasa de fallas, no por cantidad total de reclamos", () => {
    const db = emptyDb();
    db.receptions.push(receipt("ra", "a"), receipt("rb", "b"));
    db.units.push(...Array.from({ length: 100 }, (_, i) => unit("a" + i, "ra")));
    db.units.push(...Array.from({ length: 10 }, (_, i) => unit("b" + i, "rb")));
    db.warranties.push(
      ...Array.from({ length: 10 }, (_, i) => warranty("w-a-" + i, "a" + i, 5)),
      ...Array.from({ length: 3 }, (_, i) => warranty("w-b-" + i, "b" + i, 5)),
    );
    const result = calculateSupplierQuality(db, suppliers);
    expect(result.rows[0]).toMatchObject({ name: "JK", received: 10, affected: 3, cases: 3, rate: 30 });
    expect(result.rows[1]).toMatchObject({ name: "Sunlong", received: 100, affected: 10, cases: 10, rate: 10 });
    expect(result.rows[2]).toMatchObject({ received: 0, affected: 0, rate: 0 });
  });

  it("varias garantías de un mismo serial cuentan como un equipo afectado", () => {
    const db = emptyDb();
    db.receptions.push(receipt("r1", "a"));
    db.units.push(unit("u1", "r1"), unit("u2", "r1"));
    db.warranties.push(warranty("w1", "u1", 4), warranty("w2", "u1", 6));
    const result = calculateSupplierQuality(db, suppliers);
    expect(result.rows.find((x) => x.supplierId === "a"))
      .toMatchObject({ received: 2, affected: 1, cases: 2, rate: 50 });
  });

  it("corregir el proveedor de la recepción recalcula las cifras sin cambiar unidades", () => {
    const db = emptyDb();
    db.receptions.push(receipt("r1", undefined));
    db.units.push(unit("u1", "r1"));
    db.warranties.push(warranty("w1", "u1", 3));
    const before = snapshot(db.units);
    const initial = calculateSupplierQuality(db, suppliers);
    expect(initial).toMatchObject({
      received: 0, unassignedReceived: 1, unassignedCases: 1,
    });
    db.receptions[0].supplierId = "b";
    const changed = calculateSupplierQuality(db, suppliers);
    expect(changed.rows.find((row) => row.supplierId === "b"))
      .toMatchObject({ received: 1, affected: 1, cases: 1, rate: 100 });
    expect(snapshot(db.units)).toBe(before);
  });

  it("nunca cuenta recepciones en captura o descartadas ni garantías previas huérfanas", () => {
    const db = emptyDb();
    const draft = receipt("r1", "a");
    draft.status = "captura";
    const discarded = receipt("r2", "a");
    discarded.status = "descartada";
    db.receptions.push(draft, discarded, receipt("r3", "b"));
    db.units.push(unit("u1", "r1"), unit("u2", "r2"), unit("u3", "r3"));
    db.warranties.push(warranty("w1", "u1", 8), warranty("w2", undefined, 8, "historic-serial"));
    const result = calculateSupplierQuality(db, suppliers);
    expect(result.received).toBe(1);
    expect(result.cases).toBe(0);
    expect(result.unmatchedCases).toBe(2);
  });

  it("atribuye cada garantía al último ingreso anterior, conservando proveedores de reingresos", () => {
    const db = emptyDb();
    db.receptions.push(receipt("r1", "a", 1), receipt("r2", "b", 10));
    db.units.push(unit("u1", "r2", 10));
    db.movements.push(
      { id: "m1", type: "entrada", referenceType: "recepcion", referenceId: "r1",
        unitId: "u1", productId: "p", quantity: 1, createdBy: "admin", createdAt: date(1) },
      { id: "m2", type: "entrada", referenceType: "recepcion", referenceId: "r2",
        unitId: "u1", productId: "p", quantity: 1, createdBy: "admin", createdAt: date(10) },
    );
    db.warranties.push(warranty("w1", "u1", 5), warranty("w2", "u1", 12));
    const result = calculateSupplierQuality(db, suppliers);
    expect(result.rows.find((x) => x.supplierId === "a"))
      .toMatchObject({ received: 1, affected: 1, cases: 1, rate: 100 });
    expect(result.rows.find((x) => x.supplierId === "b"))
      .toMatchObject({ received: 1, affected: 1, cases: 1, rate: 100 });
    expect(result.cases).toBe(2);
  });

  it("reconoce una garantía manual solo cuando el serial identifica una única unidad", () => {
    const db = emptyDb();
    db.receptions.push(receipt("r1", "a"));
    db.units.push(unit("u1", "r1", 1, "IMEI-123"));
    db.warranties.push(warranty("w1", undefined, 3, " imei-123 "));
    expect(calculateSupplierQuality(db, suppliers).rows.find((x) => x.supplierId === "a")?.cases).toBe(1);
    db.units.push(unit("u2", "r1", 1, "imei-123"));
    expect(calculateSupplierQuality(db, suppliers)).toMatchObject({
      received: 2, cases: 0, unmatchedCases: 1,
    });
  });

  it("no atribuye a un proveedor una garantía anterior al primer ingreso", () => {
    const db = emptyDb();
    db.receptions.push(receipt("r1", "a", 10));
    db.units.push(unit("u1", "r1", 10));
    db.warranties.push(warranty("w1", "u1", 4));
    const result = calculateSupplierQuality(db, suppliers);
    expect(result.rows.find((x) => x.supplierId === "a"))
      .toMatchObject({ received: 1, affected: 0, cases: 0, rate: 0 });
    expect(result.unmatchedCases).toBe(1);
  });

  it("un movimiento duplicado para el mismo ingreso no infla el total recibido", () => {
    const db = emptyDb();
    db.receptions.push(receipt("r1", "a"));
    db.units.push(unit("u1", "r1"));
    db.movements.push(
      { id: "m1", type: "entrada", referenceType: "recepcion", referenceId: "r1",
        unitId: "u1", productId: "p", quantity: 1, createdBy: "admin", createdAt: date(1) },
      { id: "m2", type: "entrada", referenceType: "recepcion", referenceId: "r1",
        unitId: "u1", productId: "p", quantity: 1, createdBy: "admin", createdAt: date(1) },
    );
    expect(calculateSupplierQuality(db, suppliers).received).toBe(1);
  });
});
