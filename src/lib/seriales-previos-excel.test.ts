import * as XLSX from "xlsx-js-style";
import { describe, expect, it } from "vitest";

import { parseSerialWorkbook, SerialWorkbookError } from "./seriales-previos-excel";

const bytes = (book: XLSX.WorkBook) =>
  XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;

describe("parseSerialWorkbook", () => {
  it("detecta columnas IMEI/serial en hojas relevantes e ignora hojas de resumen", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([["Fecha", "Total"], ["2026-10-20", 3]]),
      "Resumen",
    );
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["IMEI 1", "IMEI 2", "Modelo"],
        ["000000000000001", "000000000000002", "iPhone"],
        ["000000000000003", "", "Samsung"],
      ]),
      "Seriales",
    );

    const parsed = parseSerialWorkbook(bytes(book));

    expect(parsed.seriales).toEqual([
      "000000000000001",
      "000000000000002",
      "000000000000003",
    ]);
    expect(parsed.hojas).toEqual(["Seriales"]);
    expect(parsed.columnas).toEqual(["Seriales: IMEI 1", "Seriales: IMEI 2"]);
    expect(parsed.advertencia).toBe("ignored_sheets");
  });

  it("usa la primera columna cuando no hay encabezados serial/IMEI reconocibles", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["SP-001", "No importar este texto"],
        ["SP-002", "Tampoco importar"],
      ]),
      "Hoja1",
    );

    const parsed = parseSerialWorkbook(bytes(book));

    expect(parsed.seriales).toEqual(["SP-001", "SP-002"]);
    expect(parsed.columnas).toEqual(["Hoja1: A"]);
    expect(parsed.advertencia).toBe("fallback_first_column");
  });

  it("conserva repeticiones para que la importación las contabilice como duplicados", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([["Serial"], ["SP-001"], ["sp-001"]]),
      "Datos",
    );

    expect(parseSerialWorkbook(bytes(book)).seriales).toEqual(["SP-001", "sp-001"]);
  });

  it("rechaza más de 20.000 seriales en un mismo archivo", () => {
    const book = XLSX.utils.book_new();
    const rows: string[][] = [["Serial"]];
    for (let i = 1; i <= 20_001; i += 1) rows.push([`SP-${String(i).padStart(5, "0")}`]);
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Datos");

    let thrown: unknown;
    try {
      parseSerialWorkbook(bytes(book));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "too_many" });
  });

  it("rechaza celdas numéricas que podrían haber perdido precisión", () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["Serial"]]);
    sheet["A2"] = { t: "n", v: 1234567890123456 };
    sheet["!ref"] = "A1:A2";
    XLSX.utils.book_append_sheet(book, sheet, "Datos");

    expect(() => parseSerialWorkbook(bytes(book))).toThrowError(SerialWorkbookError);
    try {
      parseSerialWorkbook(bytes(book));
    } catch (error) {
      expect(error).toMatchObject({ code: "unsafe_number", detail: "Datos!A2" });
    }
  });
});
