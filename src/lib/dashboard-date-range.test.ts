import { describe, expect, it } from "vitest";

import {
  buildDashboardMovementChartData,
  getLocalDateInputValue,
  isWithinDateRange,
} from "./dashboard-date-range";

describe("dashboard date range", () => {
  it("formats the local calendar date without converting it to UTC", () => {
    expect(getLocalDateInputValue(new Date(2026, 9, 21, 23, 30))).toBe("2026-10-21");
  });

  it("uses inclusive boundaries and supports an unbounded endpoint", () => {
    expect(isWithinDateRange("2026-10-01T23:59:00", "2026-10-01", "2026-10-31")).toBe(true);
    expect(isWithinDateRange("2026-10-31", "2026-10-01", "2026-10-31")).toBe(true);
    expect(isWithinDateRange("2026-11-01", "2026-10-01", "2026-10-31")).toBe(false);
    expect(isWithinDateRange("2026-09-30", "", "2026-10-31")).toBe(true);
    expect(isWithinDateRange("2026-11-01", "2026-10-01", "")).toBe(true);
    expect(isWithinDateRange(undefined, "", "")).toBe(false);
  });

  it("uses the full available movement range when both date inputs are empty", () => {
    const data = buildDashboardMovementChartData([
      { createdAt: "2026-10-02T10:00:00", type: "entrada", quantity: 2 },
      { createdAt: "2026-10-04T10:00:00", type: "salida", quantity: 1 },
    ], "", "", new Date(2026, 9, 21));

    expect(data.map((point) => point.key)).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(data.reduce((sum, point) => sum + point.entradas, 0)).toBe(2);
    expect(data.reduce((sum, point) => sum + point.salidas, 0)).toBe(1);
  });

  it("does not truncate ranges longer than 366 days and groups them by week", () => {
    const data = buildDashboardMovementChartData([
      { createdAt: "2025-01-02T10:00:00", type: "entrada", quantity: 3 },
      { createdAt: "2026-10-21T10:00:00", type: "salida", quantity: 2 },
    ], "2025-01-01", "2026-10-31", new Date(2026, 9, 21));

    expect(data.length).toBeGreaterThan(52);
    expect(data.reduce((sum, point) => sum + point.entradas, 0)).toBe(3);
    expect(data.reduce((sum, point) => sum + point.salidas, 0)).toBe(2);
    expect(data[data.length - 1].key).toBe("2026-10-19");
  });

  it("keeps empty selected periods visible as zero-value buckets", () => {
    const data = buildDashboardMovementChartData([], "2026-10-01", "2026-10-03", new Date(2026, 9, 21));
    expect(data).toHaveLength(3);
    expect(data.every((point) => point.entradas === 0 && point.salidas === 0 && point.devoluciones === 0)).toBe(true);
  });

  it("returns no buckets for an invalid reversed range", () => {
    expect(buildDashboardMovementChartData([], "2026-10-10", "2026-10-01")).toEqual([]);
  });
});
