import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";

import {
  MAX_PRODUCT_CSV_IMPORT_ROWS,
  parseProductCsv,
  parseProductWorkbook,
  ProductCsvImportError,
} from "./product-csv-import";

describe("importación operativa de productos", () => {
  it("lee productos sin columnas de precio ni costo", () => {
    const rows = parseProductCsv(
      "Producto;Referencia;Marca;Categoría;Descripción;Enlace de imagen;Stock mínimo;Características técnicas\n" +
      "iPhone 16 Pro;IP16P-256;Apple;celular;Equipo nuevo;;2;Almacenamiento: 256 GB",
    );
    expect(rows[0]).toMatchObject({
      name: "iPhone 16 Pro", sku: "IP16P-256", brand: "Apple",
      category: "celular", minStock: 2, error: "",
    });
    expect(rows[0]).not.toHaveProperty("price");
    expect(rows[0]).not.toHaveProperty("cost");
  });

  it("ignora columnas monetarias antiguas sin importarlas", () => {
    const rows = parseProductCsv("Producto;Precio;Costo;Stock mínimo\nTablet;100000;80000;3");
    expect(rows[0]).toMatchObject({ name: "Tablet", minStock: 3, error: "" });
    expect(rows[0]).not.toHaveProperty("price");
    expect(rows[0]).not.toHaveProperty("cost");
  });

  it("conserva comillas escapadas y saltos de línea dentro de campos", () => {
    const rows = parseProductCsv('Producto,Referencia,Descripción\r\n"iPhone 16","IP16","Incluye ""cable"", cargador\ny garantía"');
    expect(rows[0].description).toBe('Incluye "cable", cargador\ny garantía');
  });

  it("rechaza nombre vacío, stock inválido y enlaces no seguros", () => {
    const rows = parseProductCsv("Producto;Stock mínimo;Enlace de imagen\n;mucho;javascript:alert(1)");
    expect(rows[0].error).toContain("nombre del producto es obligatorio");
    expect(rows[0].error).toContain("stock mínimo");
    expect(rows[0].error).toContain("enlace de imagen");
  });

  it("rechaza referencias mayores a 40 caracteres y cabeceras duplicadas", () => {
    expect(parseProductCsv("Producto;Referencia\nTablet;" + "X".repeat(41))[0].error).toContain("40 caracteres");
    expect(() => parseProductCsv("Producto;Nombre\nTablet;Otra")).toThrowError(ProductCsvImportError);
  });

  it("limita la cantidad de filas", () => {
    const rows = ["Producto", ...Array.from({ length: MAX_PRODUCT_CSV_IMPORT_ROWS + 1 }, (_, i) => `Producto ${i}`)];
    expect(() => parseProductCsv(rows.join("\n"))).toThrowError(expect.objectContaining({ code: "too_many" }));
  });
});

describe("parseProductWorkbook", () => {
  it("importa Excel con la misma estructura operativa", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Producto", "Referencia", "Marca", "Categoría", "Stock mínimo"],
      ["iPhone 16 Pro", "IP16P-256", "Apple", "celular", 2],
    ]), "Productos");
    const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    expect(parseProductWorkbook(data)[0]).toMatchObject({
      name: "iPhone 16 Pro", sku: "IP16P-256", brand: "Apple", minStock: 2, error: "",
    });
  });
});
