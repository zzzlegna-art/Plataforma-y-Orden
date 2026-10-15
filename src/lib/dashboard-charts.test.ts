import { describe, expect, it } from "vitest";

import {
  firmaRankClientes,
  firmaRankProductos,
  rankDatumsDeClientes,
  rankDatumsDeProductos,
  shortenRankLabel,
} from "./dashboard-charts";
import type { CustomerRanking, ProductRanking } from "./selectors";
import type { Customer, Product } from "./types";

const producto = (id: string, name: string): Product => ({
  id,
  sku: id,
  name,
  price: 0,
  cost: 0,
  minStock: 0,
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});
const cliente = (id: string, name: string): Customer => ({
  id,
  name,
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
});
const rankingProducto = (id: string, name: string, quantity: number): ProductRanking => ({
  product: producto(id, name),
  quantity,
  revenue: 0,
  ordersCount: 1,
});
const rankingCliente = (id: string, name: string, total: number, units: number): CustomerRanking => ({
  customer: cliente(id, name),
  total,
  units,
  ordersCount: 1,
});

describe("shortenRankLabel", () => {
  it("recorta los nombres largos con puntos suspensivos", () => {
    expect(shortenRankLabel("Apple iPhone 14 Pro Max")).toBe("Apple iPhon…");
  });
  it("deja igual un nombre que ya es corto", () => {
    expect(shortenRankLabel("iPad")).toBe("iPad");
  });
});

describe("rankDatumsDeProductos / rankDatumsDeClientes", () => {
  it("arma los puntos de la gráfica de productos con la cantidad como valor", () => {
    const datos = rankDatumsDeProductos([rankingProducto("p1", "Apple iPhone 14 128 GB", 769)]);
    expect(datos).toEqual([{ key: "p1", name: "Apple iPhone 14 128 GB", short: "Apple iPhon…", value: 769, units: 769 }]);
  });

  it("clientes: por monto cuando hay montos cargados, por unidades si no", () => {
    const fila = rankingCliente("c1", "Iphone America", 5_000_000, 755);
    expect(rankDatumsDeClientes([fila], true)[0].value).toBe(5_000_000);
    expect(rankDatumsDeClientes([fila], false)[0].value).toBe(755);
  });

  it("un cliente sin datos (venta manual sin cliente) usa el nombre como clave y un guion como nombre", () => {
    const fila: CustomerRanking = { customer: undefined, total: 0, units: 3, ordersCount: 1 };
    const [datum] = rankDatumsDeClientes([fila], false);
    expect(datum.key).toBe("sin-cliente");
    expect(datum.name).toBe("—");
  });
});

describe("firmaRankProductos / firmaRankClientes", () => {
  it("dos arreglos DISTINTOS en referencia, con los mismos valores, dan la misma firma", () => {
    const a = [rankingProducto("p1", "iPhone 14", 769), rankingProducto("p2", "iPhone 15", 176)];
    // Mismos ids y cantidades, pero objetos y arreglo recién creados (como pasa en cada
    // actualización en vivo del panel, aunque nada haya cambiado de verdad).
    const b = [rankingProducto("p1", "iPhone 14", 769), rankingProducto("p2", "iPhone 15", 176)];
    expect(a).not.toBe(b);
    expect(firmaRankProductos(a)).toBe(firmaRankProductos(b));
  });

  it("si cambia una cantidad, la firma cambia", () => {
    const antes = [rankingProducto("p1", "iPhone 14", 769)];
    const despues = [rankingProducto("p1", "iPhone 14", 770)];
    expect(firmaRankProductos(antes)).not.toBe(firmaRankProductos(despues));
  });

  it("si cambia el orden del ranking, la firma cambia (la gráfica sí debe redibujarse)", () => {
    const orden1 = [rankingProducto("p1", "A", 10), rankingProducto("p2", "B", 5)];
    const orden2 = [rankingProducto("p2", "B", 5), rankingProducto("p1", "A", 10)];
    expect(firmaRankProductos(orden1)).not.toBe(firmaRankProductos(orden2));
  });

  it("clientes: misma firma con arreglos distintos pero mismos valores, y cambia con el monto o las unidades", () => {
    const a = [rankingCliente("c1", "Iphone America", 5_000_000, 755)];
    const b = [rankingCliente("c1", "Iphone America", 5_000_000, 755)];
    expect(firmaRankClientes(a, true)).toBe(firmaRankClientes(b, true));
    expect(firmaRankClientes(a, true)).not.toBe(firmaRankClientes(a, false)); // monto vs unidades
    const conMasUnidades = [rankingCliente("c1", "Iphone America", 5_000_000, 800)];
    expect(firmaRankClientes(a, false)).not.toBe(firmaRankClientes(conMasUnidades, false));
  });
});
