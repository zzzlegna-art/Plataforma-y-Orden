import { describe, expect, it } from "vitest";

import { emptyDb } from "./db";
import { getUnitOrigen, getUnitTimeline } from "./selectors";
import type { Unit, Warranty } from "./types";
import { getWarrantyOrigin } from "./warranty-origin";

const now = "2026-10-23T10:00:00.000Z";

const warranty = (overrides: Partial<Warranty> = {}): Warranty => ({
  id: "w1",
  code: "GAR-1",
  reason: "No carga",
  status: "recibido",
  receivedAt: now,
  createdBy: "user-1",
  imeiManual: "PREVIA-123",
  referenciaManual: "iPhone 13",
  clienteManual: "Cliente previo",
  ...overrides,
});

const unit = (): Unit => ({
  id: "unit-1",
  productId: "p1",
  serial: "PREVIA-123",
  condition: "seminuevo",
  status: "en_reparacion",
  receivedAt: now,
  createdBy: "user-1",
});

describe("historial de serial · garantías previas", () => {
  it("conserva el origen de garantía previa cuando el serial ya está vinculado a inventario", () => {
    expect(getWarrantyOrigin(warranty({ unitId: "unit-1", productId: "p1" }))).toBe("previa");
  });

  it("vincula por serial las garantías previas antiguas aunque no tengan unitId", () => {
    const db = emptyDb();
    const equipo = unit();
    db.units = [equipo];
    db.warranties = [warranty()];
    db.warrantyEvents = [{
      id: "event-1",
      warrantyId: "w1",
      status: "recibido",
      notes: "Garantía previa recibida en bodega",
      createdBy: "user-1",
      createdAt: now,
    }];

    expect(getUnitOrigen(db, equipo).warranties.map((item) => item.id)).toEqual(["w1"]);
    expect(getUnitTimeline(db, equipo.id).some((item) => item.descripcion.includes("Garantía previa recibida en bodega"))).toBe(true);
  });
});
