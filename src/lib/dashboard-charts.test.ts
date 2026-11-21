import { describe, expect, it } from "vitest";

import {
  firmaRankClientes,
  firmaRankProductos,
  getRankSharePercent,
  rankDatumsDeClientes,
  rankDatumsDeProductos,
  shortenRankLabel,
} from "./dashboard-charts";
import type { CustomerRanking, ProductRanking } from "./selectors";
import type { Customer, Product } from "./types";

const producto = (id: string, name: string): Product => ({
  id, sku: id, name, price: 0, cost: 0, minStock: 0, isActive: true,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
});
const cliente = (id: string, name: string): Customer => ({
  id, name, isActive: true, createdAt: "2026-01-01T00:00:00Z",
});
const rankingProducto = (id: string, name: string, quantity: number): ProductRanking => ({
  product: producto(id, name), quantity, ordersCount: 1,
});
const rankingCliente = (id: string, name: string, units: number): CustomerRanking => ({
  customer: cliente(id, name), units, ordersCount: 1,
});

describe("getRankSharePercent", () => {
  it("calcula la participación real dentro del total", () => {
    expect(getRankSharePercent(2, 3)).toBeCloseTo(66.6667, 3);
    expect(getRankSharePercent(1, 3)).toBeCloseTo(33.3333, 3);
  });
  it("devuelve cero para valores vacíos o inválidos y nunca supera 100", () => {
    expect(getRankSharePercent(5, 0)).toBe(0);
    expect(getRankSharePercent(0, 10)).toBe(0);
    expect(getRankSharePercent(Number.NaN, 10)).toBe(0);
    expect(getRankSharePercent(12, 10)).toBe(100);
  });
});

describe("rankings operativos", () => {
  it("ordena productos por unidades, sin importes", () => {
    const datos = rankDatumsDeProductos([rankingProducto("p1", "Apple iPhone 14 128 GB", 769)]);
    expect(datos[0]).toMatchObject({ key: "p1", value: 769, units: 769 });
  });
  it("ordena clientes por unidades", () => {
    const datos = rankDatumsDeClientes([rankingCliente("c1", "Bodega Central", 755)]);
    expect(datos[0]).toMatchObject({ key: "c1", name: "Bodega Central", value: 755, units: 755 });
  });
  it("maneja clientes sin nombre", () => {
    const row: CustomerRanking = { customer: undefined, units: 3, ordersCount: 1 };
    expect(rankDatumsDeClientes([row])[0]).toMatchObject({ key: "sin-cliente", name: "—", value: 3 });
  });
  it("acorta nombres largos", () => {
    expect(shortenRankLabel("Apple iPhone 14 Pro Max")).toBe("Apple iPhon…");
  });
});

describe("firmas de ranking", () => {
  it("mantiene la firma cuando los valores no cambian", () => {
    const a = [rankingProducto("p1", "iPhone 14", 769)];
    const b = [rankingProducto("p1", "iPhone 14", 769)];
    expect(firmaRankProductos(a)).toBe(firmaRankProductos(b));
    const ca = [rankingCliente("c1", "Cliente", 755)];
    const cb = [rankingCliente("c1", "Cliente", 755)];
    expect(firmaRankClientes(ca)).toBe(firmaRankClientes(cb));
  });
  it("cambia la firma cuando cambia la cantidad o el orden", () => {
    const a = [rankingProducto("p1", "A", 10), rankingProducto("p2", "B", 5)];
    const b = [rankingProducto("p2", "B", 5), rankingProducto("p1", "A", 10)];
    expect(firmaRankProductos(a)).not.toBe(firmaRankProductos(b));
    expect(firmaRankClientes([rankingCliente("c1", "C", 5)])).not.toBe(
      firmaRankClientes([rankingCliente("c1", "C", 6)]),
    );
  });
});
