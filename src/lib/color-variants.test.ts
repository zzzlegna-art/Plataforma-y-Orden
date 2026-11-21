import { describe, expect, it } from "vitest";

import { normalizarColor, stockPorColor, variantePorColor } from "./color-variants";

const catalogo = { colorVariants: [{ color: "Blanco" }, { color: "Azul" }] };

describe("variantes de color", () => {
  it("normaliza espacios sin cambiar el nombre del color", () => {
    expect(normalizarColor("  Azul   Marino ")).toBe("Azul Marino");
  });

  it("encuentra una variante ignorando mayúsculas y espacios", () => {
    expect(variantePorColor(catalogo, "  bLANCO ")?.color).toBe("Blanco");
    expect(variantePorColor(catalogo, "Rojo")).toBeUndefined();
  });

  it("cuenta unidades en bodega no asignadas por color", () => {
    const units = [
      { id: "1", productId: "p1", color: "Blanco", status: "en_bodega" },
      { id: "2", productId: "p1", color: "Blanco", status: "en_bodega" },
      { id: "3", productId: "p1", color: "Azul", status: "en_local" },
      { id: "4", productId: "p1", color: "Blanco", status: "vendido" },
    ];
    expect(stockPorColor("p1", "Blanco", units, new Set(["2"]))).toBe(1);
  });
});
