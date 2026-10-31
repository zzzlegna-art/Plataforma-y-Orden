import { describe, expect, it } from "vitest";
import { imageForVariant, inventoryProductPhoto, swatchForVariant, verifyVariantPhotoUrls } from "./product-color-photos";
import { createProduct, updateProduct } from "./actions/catalogs";
import { emptyDb } from "./db";
import type { Actor } from "./types";

const admin: Actor = { id: "admin", email: "admin@example.test", fullName: "Admin", role: "admin" };
const blanco = { color: "Blanco", cost: 3840000, price: 4400000, imageUrl: "https://example.org/blanco.webp", swatchHex: "#fefefe" };
const azul = { color: "Azul", cost: 3700000, price: 4200000, imageUrl: "https://example.org/azul.webp", swatchHex: "#2769ba" };

describe("fotografías opcionales por color", () => {
  it("conserva una sola referencia y la fotografía principal con sus dos imágenes", () => {
    const db = emptyDb();
    const product = createProduct(db, admin, {
      sku: "IP17PM-256", name: "iPhone 17 Pro Max 256 GB", categoria: "celular",
      price: 0, cost: 0, minStock: 0,
      imageUrl: "https://example.org/principal.webp",
      colorVariants: [blanco, azul],
    });
    expect(db.products).toHaveLength(1);
    expect(product.imageUrl).toBe("https://example.org/principal.webp");
    expect(product.colorVariants?.map((variant) => variant.imageUrl)).toEqual([
      "https://example.org/blanco.webp", "https://example.org/azul.webp",
    ]);
    expect(imageForVariant(product.imageUrl, product.colorVariants?.[0])).toBe(blanco.imageUrl);
    expect(imageForVariant(product.imageUrl, product.colorVariants?.[1])).toBe(azul.imageUrl);
    expect(imageForVariant(product.imageUrl)).toBe(product.imageUrl);
  });

  it("abre el visor con una foto real de variante cuando falta la foto principal", () => {
    expect(inventoryProductPhoto(undefined, [blanco, azul])).toBe(blanco.imageUrl);
    expect(inventoryProductPhoto("https://example.org/principal.webp", [blanco, azul]))
      .toBe("https://example.org/principal.webp");
    expect(inventoryProductPhoto(undefined, [{ color: "Blanco", price: 1, cost: 1 }]))
      .toBeUndefined();
  });

  it("muestra la imagen principal cuando un color no tiene foto", () => {
    const base = "https://example.org/principal.webp";
    expect(imageForVariant(base, { color: "Borgoña", cost: 0, price: 0 })).toBe(base);
  });

  it("conserva imágenes y tarifas existentes al editar el mismo modelo", () => {
    const db = emptyDb();
    const product = createProduct(db, admin, {
      sku: "IP17PM-256", name: "iPhone", categoria: "celular",
      price: 0, cost: 0, minStock: 0,
      imageUrl: "https://example.org/principal.webp",
      colorVariants: [blanco, azul],
    });
    const result = updateProduct(db, admin, {
      id: product.id, sku: product.sku, name: product.name,
      categoria: product.categoria, price: 0, cost: 0, minStock: 0,
      colorVariants: [{ ...blanco, price: 4500000 }, azul],
    });
    expect(result.colorVariants?.[0]).toMatchObject({ imageUrl: blanco.imageUrl, price: 4500000 });
    expect(result.imageUrl).toBe("https://example.org/principal.webp");
  });

  it("verifica URLs y muestras recibidas de Supabase antes de cerrar el formulario", () => {
    expect(verifyVariantPhotoUrls([blanco, azul], [azul, blanco])).toBe(true);
    expect(verifyVariantPhotoUrls([blanco, azul], [
      { ...blanco, imageUrl: undefined }, azul,
    ])).toBe(false);
    expect(verifyVariantPhotoUrls([blanco, azul], [{ ...blanco, swatchHex: "#000000" }, azul])).toBe(false);
  });

  it("interpreta tonos comerciales y permite escoger una muestra exacta", () => {
    expect(swatchForVariant({ color: "Blanco" })).toBe("#ffffff");
    expect(swatchForVariant({ color: "Borgoña" })).toBe("#752b4a");
    expect(swatchForVariant({ color: "Azul", swatchHex: "#448aff" })).toBe("#448aff");
  });
});
