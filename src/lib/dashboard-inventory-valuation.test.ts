import { describe, expect, it } from "vitest";

import { calculateInventoryValuation } from "./dashboard-inventory-valuation";
import type { Product, Unit } from "./types";

const product = (id: string, cost: number): Product => ({
  id,
  sku: id,
  name: id,
  cost,
  price: 100,
  minStock: 0,
  isActive: true,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

const unit = (
  id: string,
  status: Unit["status"] = "en_bodega",
  cost?: number,
): Unit => ({
  id,
  productId: "p1",
  serial: id,
  condition: "nuevo",
  status,
  ...(cost === undefined ? {} : { cost }),
  receivedAt: "2026-01-01",
  createdBy: "staff",
});

describe("valoración confiable de inventario", () => {
  it("distingue costos de IMEI, costos referenciales y equipos sin costo", () => {
    const units = [
      unit("confirmado", "en_bodega", 300),
      unit("referencia"),
      { ...unit("sin-costo"), productId: "p2" },
      unit("costo-cero", "en_local", 0),
    ];
    expect(calculateInventoryValuation(
      units, [product("p1", 200), product("p2", 0)],
      new Set(), new Set(),
    )).toEqual({
      total: 500,
      confirmed: 300,
      reference: 200,
      confirmedUnits: 1,
      referenceUnits: 1,
      missingUnits: 2,
      eligibleUnits: 4,
    });
  });

  it("excluye unidades vendidas, liberadas, comprometidas en pedidos y fuera por garantía", () => {
    const units = [
      unit("disponible", "en_local", 600),
      unit("reparacion", "en_reparacion", 300),
      unit("defectuoso", "defectuoso", 200),
      unit("vendido", "vendido", 400),
      unit("liberado", "liberado", 400),
      unit("transito", "en_transito", 400),
      unit("pedido", "en_bodega", 500),
      unit("garantia", "en_bodega", 600),
    ];
    expect(calculateInventoryValuation(
      units, [product("p1", 150)],
      new Set(["garantia"]), new Set(["pedido"]),
    )).toMatchObject({
      total: 1100,
      confirmed: 1100,
      confirmedUnits: 3,
      referenceUnits: 0,
      missingUnits: 0,
      eligibleUnits: 3,
    });
  });

  it("no presenta costos de referencia nulos como dinero comprobado", () => {
    const result = calculateInventoryValuation(
      [unit("uno"), unit("dos")],
      [product("p1", 0)],
      new Set(), new Set(),
    );
    expect(result.total).toBe(0);
    expect(result.confirmedUnits).toBe(0);
    expect(result.missingUnits).toBe(2);
  });
});
