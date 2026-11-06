import { describe, expect, it } from "vitest";

import { parseDashboardOrderRankings } from "./dashboard-order-rankings";

describe("parseDashboardOrderRankings", () => {
  it("normaliza la respuesta combinada de pedidos operativos e históricos", () => {
    const result = parseDashboardOrderRankings({
      totalOrders: 133,
      consideredOrders: 123,
      cancelledOrders: 10,
      operationalOrders: 14,
      historicalOrders: 119,
      products: [{ key: "iphone17promax256gb", name: "iPhone 17 Pro Max 256 GB", value: "1035", units: "1035", ordersCount: "42" }],
      customers: [{ key: "javier caliz", name: "Javier Caliz", value: "636", units: "636", ordersCount: "9" }],
    });

    expect(result).toEqual({
      totalOrders: 133,
      consideredOrders: 124,
      cancelledOrders: 9,
      operationalOrders: 14,
      historicalOrders: 119,
      products: [{ key: "iphone17promax256gb", name: "iPhone 17 Pro Max 256 GB", units: 1035, ordersCount: 42 }],
      customers: [{ key: "javier caliz", name: "Javier Caliz", units: 636, ordersCount: 9 }],
    });
  });

  it("omite filas sin nombre y convierte listas ausentes en arreglos vacíos", () => {
    const result = parseDashboardOrderRankings({
      totalOrders: 10,
      products: [{ key: "invalid", units: 5 }, null],
    });

    expect(result.products).toEqual([]);
    expect(result.customers).toEqual([]);
    expect(result.consideredOrders).toBe(0);
  });

  it("rechaza una respuesta que no sea un objeto", () => {
    expect(() => parseDashboardOrderRankings(null)).toThrow("formato válido");
    expect(() => parseDashboardOrderRankings([])).toThrow("formato válido");
  });
});
