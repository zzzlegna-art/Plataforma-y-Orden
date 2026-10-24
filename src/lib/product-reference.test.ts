import { describe, expect, it } from "vitest";

import { findProductForReference } from "./product-reference";

describe("findProductForReference", () => {
  it("encuentra la foto del mismo modelo aunque la capacidad de la venta sea distinta", () => {
    const product = {
      name: "iPhone 13 Pro Max 128 GB",
      imageUrl: "https://example.com/iphone-13-pro-max.png",
    };

    expect(findProductForReference([product], "Apple iPhone 13 Pro Max 256 GB")).toBe(product);
  });

  it("prefiere una coincidencia exacta que ya tenga imagen", () => {
    const product128 = {
      name: "iPhone 13 Pro Max 128 GB",
      imageUrl: "https://example.com/iphone-128.png",
    };
    const product256 = {
      name: "iPhone 13 Pro Max 256 GB",
      imageUrl: "https://example.com/iphone-256.png",
    };

    expect(findProductForReference([product128, product256], "Apple iPhone 13 Pro Max 256 GB")).toBe(product256);
  });

  it("no confunde modelos distintos", () => {
    const product = {
      name: "iPhone 13 Pro 128 GB",
      imageUrl: "https://example.com/iphone-13-pro.png",
    };

    expect(findProductForReference([product], "Apple iPhone 13 Pro Max 256 GB")).toBeUndefined();
  });

  it("usa la imagen del inventario para Apple Watch con sufijos de Excel", () => {
    const watch42 = {
      name: "Watch Serie 11 - 42",
      imageUrl: "https://example.com/watch-42.png",
    };
    const watch46 = {
      name: "Watch Serie 11 - 46",
      imageUrl: "https://example.com/watch-46.png",
    };

    expect(findProductForReference([watch42, watch46], "Apple Watch Serie 11 46 MMM NEW")).toBe(watch46);
  });

  it("ignora colores, condición y capacidad sin confundir el modelo", () => {
    const samsung = {
      name: "Samsung S26 Ultra negro 512 GB",
      imageUrl: "https://example.com/samsung-s26.png",
    };

    expect(findProductForReference([samsung], "Samsung S26 Ultra 256 GB NEW")).toBe(samsung);
  });

  it("no confunde iPhone Pro con Pro Max al quitar variantes", () => {
    const pro = {
      name: "iPhone 13 Pro 128 GB",
      imageUrl: "https://example.com/iphone-pro.png",
    };

    expect(findProductForReference([pro], "Apple iPhone 13 Pro Max 256 GB")).toBeUndefined();
  });

  it("devuelve undefined si no hay referencia", () => {
    expect(findProductForReference([], "")).toBeUndefined();
  });
});
