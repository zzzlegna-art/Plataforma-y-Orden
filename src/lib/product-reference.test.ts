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

  it("devuelve undefined si no hay referencia", () => {
    expect(findProductForReference([], "")).toBeUndefined();
  });
});
