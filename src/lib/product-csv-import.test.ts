import { describe, expect, it } from "vitest";

import {
  MAX_PRODUCT_CSV_IMPORT_ROWS,
  parseProductCsv,
  ProductCsvImportError,
} from "./product-csv-import";

describe("parseProductCsv", () => {
  it("lee el CSV separado por punto y coma que exporta Nexora", () => {
    const rows = parseProductCsv(
      '\uFEFFProducto;Referencia;Marca;Categoría;Descripción;Enlace de imagen;Precio;Stock\r\n' +
        '"iPhone 16 Pro";IP16P-256;Apple;"Celulares / Smartphones";"Equipo; nuevo";https://example.com/phone.jpg;"$ 4.200.000";3',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      name: "iPhone 16 Pro",
      sku: "IP16P-256",
      brand: "Apple",
      category: "Celulares / Smartphones",
      description: "Equipo; nuevo",
      imageUrl: "https://example.com/phone.jpg",
      price: 4200000,
      error: "",
    });
  });

  it("detecta CSV con comas, comillas escapadas y saltos de línea dentro de campos", () => {
    const rows = parseProductCsv(
      'Product,Reference,Description,Price\r\n"iPhone 16","IP16","Incluye ""cable"", cargador\ny garantía","1,299.99"',
    );

    expect(rows[0].description).toBe('Incluye "cable", cargador\ny garantía');
    expect(rows[0].price).toBe(1299.99);
  });

  it("acepta referencias vacías para generar el SKU automáticamente al guardar", () => {
    const rows = parseProductCsv("Producto;Precio\nTablet 10 pulgadas;1.200.000");
    expect(rows[0]).toMatchObject({ sku: "", price: 1200000, error: "" });
  });

  it("rechaza texto no numérico en precio, costo y stock mínimo", () => {
    const rows = parseProductCsv(
      "Producto;Precio;Costo;Stock mínimo\nTablet;abc;sin costo;mucho",
    );
    expect(rows[0].error).toContain("precio debe ser un número");
    expect(rows[0].error).toContain("costo debe ser un número");
    expect(rows[0].error).toContain("stock mínimo debe ser un número");
  });

  it("rechaza texto mezclado con importes en vez de extraer solo los dígitos", () => {
    const rows = parseProductCsv(
      "Producto;Precio;Costo;Stock mínimo\nTablet;12abc;100xyz;1",
    );
    expect(rows[0].error).toContain("precio debe ser un número");
    expect(rows[0].error).toContain("costo debe ser un número");
  });

  it("rechaza códigos de moneda incrustados entre dígitos", () => {
    const rows = parseProductCsv(
      "Producto;Precio;Costo;Stock mínimo\nTablet;1 COP 2;USD 100;1",
    );
    expect(rows[0].error).toContain("precio debe ser un número");
  });

  it("permite códigos monetarios conocidos sin aceptar texto arbitrario", () => {
    const rows = parseProductCsv(
      "Producto;Precio;Costo;Stock mínimo\nTablet;COP 1.200;USD 100;1",
    );
    expect(rows[0].price).toBe(1200);
    expect(rows[0].cost).toBe(100);
    expect(rows[0].error).toBe("");
  });

  it("marca nombres vacíos, importes inválidos y enlaces de imagen no seguros", () => {
    const rows = parseProductCsv(
      "Producto;Referencia;Precio;Enlace de imagen\n;SKU-1;-5;javascript:alert(1)",
    );
    expect(rows[0].error).toContain("obligatorio");
    expect(rows[0].error).toContain("precio");
    expect(rows[0].error).toContain("enlace de imagen");
  });

  it("marca referencias demasiado largas antes de que el guardado las trunque", () => {
    const rows = parseProductCsv("Producto;Referencia\nTablet;" + "X".repeat(41));
    expect(rows[0].error).toContain("40 caracteres");
  });
  it("marca filas con columnas extra en vez de ignorar silenciosamente datos CSV", () => {
    const rows = parseProductCsv("Producto;Precio\nTablet;100;DATO_EXTRA");
    expect(rows[0].error).toContain("más columnas");
    expect(rows[0].error).toContain("revisa los separadores y las comillas");
  });

  it("rechaza stock mínimo fraccionario porque la existencia mínima debe ser entera", () => {
    const rows = parseProductCsv("Producto;Stock mínimo\nTablet;1.5");
    expect(rows[0].error).toContain("stock mínimo debe ser un número entero");
  });

  it("acepta stock mínimo entero y no altera precios fraccionarios válidos", () => {
    const rows = parseProductCsv("Producto;Stock mínimo;Precio\nTablet;2;1299.99");
    expect(rows[0]).toMatchObject({ minStock: 2, price: 1299.99, error: "" });
  });


  it("rechaza cabeceras duplicadas para un campo reconocido", () => {
    expect(() => parseProductCsv("Producto;Nombre;Precio\nTablet;Otra tablet;100")).toThrowError(
      expect.objectContaining({
        code: "malformed",
        message: expect.stringContaining("columnas repetidas"),
      }),
    );
  });

  it("permite cabeceras desconocidas adicionales", () => {
    const rows = parseProductCsv("Producto;Precio;Nota interna\nTablet;100;Importado");
    expect(rows[0]).toMatchObject({ name: "Tablet", price: 100, error: "" });
  });

  it("rechaza archivos sin columna de nombre o sin filas de datos", () => {
    expect(() => parseProductCsv("Referencia;Precio\nSKU-1;100")).toThrowError(ProductCsvImportError);
    expect(() => parseProductCsv("Producto;Referencia\n")).toThrowError(ProductCsvImportError);
  });

  it("limita la cantidad de productos para evitar una importación accidentalmente masiva", () => {
    const rows = ["Producto", ...Array.from({ length: MAX_PRODUCT_CSV_IMPORT_ROWS + 1 }, (_, i) => `Producto ${i}`)];
    expect(() => parseProductCsv(rows.join("\n"))).toThrowError(
      expect.objectContaining({ code: "too_many" }),
    );
  });
});
