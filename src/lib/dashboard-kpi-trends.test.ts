import { describe, expect, it } from "vitest";

import { getMonthToDateEntryComparison } from "./dashboard-kpi-trends";
import type { StockMovement } from "./types";

const movement = (
  id: string,
  type: StockMovement["type"],
  quantity: number,
  createdAt: string,
): StockMovement => ({
  id,
  productId: "product-1",
  type,
  quantity,
  referenceType: "manual",
  createdBy: "user-1",
  createdAt,
});

describe("getMonthToDateEntryComparison", () => {
  it("compara las entradas del mismo tramo de días y excluye otros movimientos", () => {
    const movements = [
      movement("current-1", "entrada", 3, "2026-10-01T10:00:00"),
      movement("current-2", "entrada", 2, "2026-10-21T10:00:00"),
      movement("current-future", "entrada", 90, "2026-10-22T10:00:00"),
      movement("previous-1", "entrada", 4, "2026-09-01T10:00:00"),
      movement("previous-2", "entrada", 1, "2026-09-21T10:00:00"),
      movement("previous-outside", "entrada", 80, "2026-09-22T10:00:00"),
      movement("sale", "salida", 20, "2026-10-10T10:00:00"),
    ];

    expect(getMonthToDateEntryComparison(movements, new Date(2026, 9, 21))).toEqual({
      current: 5,
      previous: 5,
    });
  });

  it("limita el tramo anterior al último día cuando el mes anterior es más corto", () => {
    const movements = [
      movement("march", "entrada", 7, "2026-03-31T10:00:00"),
      movement("february", "entrada", 4, "2026-02-28T10:00:00"),
    ];

    expect(getMonthToDateEntryComparison(movements, new Date(2026, 2, 31))).toEqual({
      current: 7,
      previous: 4,
    });
  });

  it("devuelve cero cuando no hay entradas en los periodos comparados", () => {
    expect(getMonthToDateEntryComparison([], new Date(2026, 9, 21))).toEqual({
      current: 0,
      previous: 0,
    });
  });
});
