import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";

import {
  MAX_PRODUCT_CSV_IMPORT_ROWS,
  parseProductCsv,
  parseProductWorkbook,
  ProductCsvImportError,
} from "./product-csv-import";

describe("parseProductCsv", () => {
  it("lee el CSV separado por punto y coma que exporta Nexora", () => {
    const rows = parseProductCsv(
      '\uFEFFProducto;Referencia;Marca;CategorÃ­a;DescripciÃ³n;Enlace de imagen;Precio;Stock\r\n' +
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

  it("detecta CSV con comas, comillas escapadas y saltos de lÃ­nea dentro de campos", () => {
    const rows = parseProductCsv(
      'Product,Reference,Description,Price\r\n"iPhone 16","IP16","Incluye ""cable"", cargador\ny garantÃ­a","1,299.99"',
    );

    expect(rows[0].description).toBe('Incluye "cable", cargador\ny garantÃ­a');
    expect(rows[0].price).toBe(1299.99);
  });

  it("acepta referencias vacÃ­as para generar el SKU automÃ¡ticamente al guardar", () => {
    const rows = parseProductCsv("Producto;Precio\nTablet 10 pulgadas¶»§q«^