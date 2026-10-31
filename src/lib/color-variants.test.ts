import { describe, expect, it } from "vitest";

import { estadoPrecioVentaColor, variantePorColor } from "./color-variants";

const catalogo = {
  colorVariants: [
    { color: "Blanco", cost: 3840000, price: 4600000 },
    { color: "Azul", cost: 3700000, price: 4400000 },
    { color: "Borgoña", cost: 0, price: 0 },
  ],
};

describe("estado del precio por color en los pedidos", () => {
  it("no considera sin precio un color con venta guardada aunque el pedido todavía tenga $0", () => {
    expect(estadoPrecioVentaColor(catalogo, "Blanco", 0)).toBe("desactualizado");
    expect(estadoPrecioVentaColor(catalogo, "Azul", 0)).toBe("desactualizado");
    expect(variantePorColor(catalogo, "Blanco")?.price).toBe(4600000);
  });

  it("marca como actualizado cuando coincide el precio actual del catálogo", () => {
    expect(estadoPrecioVentaColor(catalogo, "Blanco", 4600000)).toBe("actualizado");
  });

  it("solo muestra precio pendiente si esa variante realmente tiene venta cero", () => {
    expect(estadoPrecioVentaColor(catalogo, "Borgoña", 0)).toBe("pendiente");
    expect(estadoPrecioVentaColor(catalogo, "Borgoña", 4300000)).toBe("pendiente");
  });

  it("no presenta un aviso de precio pendiente para líneas sin color o sin referencia coincidente", () => {
    expect(estadoPrecioVentaColor(catalogo, undefined, 0)).toBe("sin_color");
    expect(estadoPrecioVentaColor(catalogo, "Rojo", 0)).toBe("sin_color");
    expect(estadoPrecioVentaColor(undefined, "Blanco", 0)).toBe("sin_color");
  });

  it("compara el color de manera normalizada y no confunde una tarifa antigua con una inexistente", () => {
    expect(estadoPrecioVentaColor(catalogo, "  bLanco   ", 4200000)).toBe("desactualizado");
  });
});
