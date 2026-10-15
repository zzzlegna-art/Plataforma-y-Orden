import { describe, expect, it } from "vitest";

import { ordenarProductos } from "./product-order";

const p = (name: string, sku = "") => ({ name, sku });

describe("ordenarProductos", () => {
  it("ordena alfabéticamente sin distinguir mayúsculas", () => {
    const orden = ordenarProductos([p("Apple iPhone 14"), p("apple battery"), p("Apple Hard Oled")]).map((x) => x.name);
    expect(orden).toEqual(["apple battery", "Apple Hard Oled", "Apple iPhone 14"]);
  });

  it("entiende los números: 12 antes que 14 y 128 GB antes que 256 GB", () => {
    const orden = ordenarProductos([
      p("Apple iPhone 16 Pro 256 GB"),
      p("Apple iPhone 2"),
      p("Apple iPhone 16 Pro 128 GB"),
      p("Apple iPhone 14 Pro Max 128 GB"),
      p("Apple iPhone 12 Pro Max 256 GB"),
    ]).map((x) => x.name);
    expect(orden).toEqual([
      "Apple iPhone 2",
      "Apple iPhone 12 Pro Max 256 GB",
      "Apple iPhone 14 Pro Max 128 GB",
      "Apple iPhone 16 Pro 128 GB",
      "Apple iPhone 16 Pro 256 GB",
    ]);
  });

  it("ignora acentos y desempata por SKU", () => {
    const orden = ordenarProductos([p("Cámara", "B"), p("Camara", "A"), p("Batería")]).map((x) => x.sku || x.name);
    expect(orden).toEqual(["Batería", "A", "B"]);
  });

  it("no modifica la lista original", () => {
    const lista = [p("B"), p("A")];
    ordenarProductos(lista);
    expect(lista.map((x) => x.name)).toEqual(["B", "A"]);
  });
});
