import { describe, expect, it } from "vitest";
import { preciosPorColorSinConfigurar, verificarPreciosPorColor } from "./product-color-pricing";

const variants = [
  { color: "Blanco", cost: 3840000, price: 4500000 },
  { color: "Azul", cost: 3700000, price: 4350000 },
  { color: "Borgoña", cost: 0, price: 0 },
];

describe("precios de venta por color guardados en Supabase", () => {
  it("verifica importes de venta y costo tras una escritura real, independientemente del orden", () => {
    expect(verificarPreciosPorColor(variants, [
      { color: "Azul", price: 4350000, cost: 3700000 },
      { color: "Borgoña", price: 0, cost: 0 },
      { color: "Blanco", price: 4500000, cost: 3840000 },
    ])).toBe(true);
  });
  it("detecta cuando el servidor devuelve precios cero que el usuario cambió", () => {
    expect(verificarPreciosPorColor(variants, [
      { color: "Blanco", cost: 3840000, price: 0 },
      { color: "Azul", cost: 3700000, price: 0 },
      { color: "Borgoña", cost: 0, price: 0 },
    ])).toBe(false);
  });
  it("no acepta colecciones incompletas, importes mal tipados ni colores duplicados", () => {
    expect(verificarPreciosPorColor(variants, [])).toBe(false);
    expect(verificarPreciosPorColor(variants, [
      { color: "Blanco", cost: 3840000, price: 4500000 },
      { color: "Blanco", cost: 3840000, price: 4500000 },
      { color: "Borgoña", cost: 0, price: 0 },
    ])).toBe(false);
    expect(verificarPreciosPorColor(variants, null)).toBe(false);
  });
  it("advierte cuáles colores todavía mostrarían venta cero", () => {
    expect(preciosPorColorSinConfigurar(variants)).toEqual(["Borgoña"]);
  });
});
