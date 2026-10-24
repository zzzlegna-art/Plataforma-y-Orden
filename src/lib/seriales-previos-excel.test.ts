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

  it("detecta referencias en los encabezados de columnas y cliente/fecha del Excel de ventas", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["", "", "", "", "", "", "", ""],
        ["", "", "", "", "", "", "", ""],
        ["REFERENCIA", "Harold - Cucuta", "", "", "", "", "Apple iPhone 12 128 GB", "Apple iPhone 13 Pro Max 128 GB"],
        ["Apple iPhone 12 128 GB", 2, "", "", "", "", "352513420258440", "358800351040804"],
        ["Apple iPhone 13 Pro Max 128 GB", 1, "", "", "", "", "352513420258441", "358800351040805"],
      ]),
      "Ventas",
    );

    const parsed = parseSerialWorkbook(bytes(book), "Ventas_08-02-2026.xlsx");

    expect(parsed.registros).toHaveLength(4);
    expect(parsed.registros[0]).toMatchObject({
      serial: "352513420258440",
      referencia: "Apple iPhone 12 128 GB",
      hoja: "Ventas",
      fila: 4,
    });
    expect(parsed.clienteDetectado).toBe("Harold - Cucuta");
    expect(parsed.fechaVentaDetectada).toBe("2026-02-08");
    expect(parsed.registros[1].referencia).toBe("Apple iPhone 13 Pro Max 128 GB");
  });

  it("separa el cliente y la referencia de encabezados agrupados y no confunde CANTIDADES con el cliente", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["REFERENCIA", "CANTIDADES", "", "", "", "", "1. Chavela : Apple iPhone 12 - 128", "2. Juan David: Apple iPhone 13 128 GB"],
        ["Apple iPhone 12 - 128", 2, "", "", "", "", "351139867580418", "352678439208841"],
        ["Apple iPhone 12 - 128", 1, "", "", "", "", "351139867580419", "352678439208842"],
      ]),
      "Ventas",
    );

    const parsed = parseSerialWorkbook(bytes(book), "Ventas_26-03-2026.xlsx");

    expect(parsed.registros).toHaveLength(4);
    expect(parsed.clienteDetectado).toBeUndefined();
    expect(parsed.registros[0]).toMatchObject({
      serial: "351139867580418",
      referencia: "Apple iPhone 12 - 128",
      cliente: "Chavela",
      fechaVenta: undefined,
    });
    expect(parsed.registros[1]).toMatchObject({
      serial: "352678439208841",
      referencia: "Apple iPhone 13 128 GB",
      cliente: "Juan David",
    });
    expect(parsed.fechaVentaDetectada).toBe("2026-03-26");
  });

  it("lee referencia, cliente y fecha cuando vienen en columnas con encabezado", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["Serial", "Referencia", "Cliente", "Fecha de venta"],
        ["SP-0001", "iPhone 12", "Camilo Lider", "08/02/2026"],
      ]),
      "Datos",
    );

    const parsed = parseSerialWorkbook(bytes(book));

    expect(parsed.registros[0]).toMatchObject({
      serial: "SP-0001",
      referencia: "iPhone 12",
      cliente: "Camilo Lider",
      fechaVenta: "2026-02-08",
    });
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
