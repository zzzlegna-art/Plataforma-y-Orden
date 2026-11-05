import { describe, expect, it, vi } from "vitest";
import { extractPageText, shouldOcrInvoicePage, resolveOcrCreateWorker } from "./nexora-invoice-reader";

describe("Factura de proveedor · carga del OCR en fotografías", () => {
  const worker = {
    recognize: vi.fn(async () => ({ data: { text: "FACTURA FE-123" } })),
    terminate: vi.fn(async () => undefined),
  };

  it("reconoce la exportación ESM por defecto del CDN de Tesseract.js", async () => {
    const createWorker = vi.fn(async () => worker);
    const load = resolveOcrCreateWorker({ default: { createWorker } });
    const instance = await load("spa+eng");

    expect(createWorker).toHaveBeenCalledOnce();
    expect(createWorker).toHaveBeenCalledWith("spa+eng");
    expect((await instance.recognize(new Blob(["JPEG"], { type: "image/jpeg" }))).data.text)
      .toBe("FACTURA FE-123");
    await instance.terminate();
  });

  it("admite también la exportación nombrada de createWorker", async () => {
    const createWorker = vi.fn(async () => worker);
    const load = resolveOcrCreateWorker({ createWorker });
    expect(await load("spa+eng")).toBe(worker);
    expect(createWorker).toHaveBeenCalledWith("spa+eng");
  });

  it("prefiere la exportación nombrada si ambas están presentes", async () => {
    const named = vi.fn(async () => worker);
    const fromDefault = vi.fn(async () => worker);
    await resolveOcrCreateWorker({
      createWorker: named,
      default: { createWorker: fromDefault },
    })("spa+eng");
    expect(named).toHaveBeenCalledOnce();
    expect(fromDefault).not.toHaveBeenCalled();
  });

  it.each([null, {}, { default: {} }, { createWorker: "not a function" }])(
    "informa si el módulo no ofrece la fábrica de OCR (%s)",
    (invalid) => {
      expect(() => resolveOcrCreateWorker(invalid)).toThrow(/manual/i);
    },
  );
});


describe("Facturas PDF · extracción por columnas y respaldo OCR", () => {
  const textItem = (str: string, x: number, y: number) => ({
    str, transform: [1, 0, 0, 1, x, y],
  });
  it("reordena columnas entregadas fuera de secuencia por PDF.js", () => {
    const page = extractPageText([
      textItem("2.500.000", 310, 675),
      textItem("Proveedor: Tecnocentro", 30, 800),
      textItem("5.000.000", 410, 675),
      textItem("iPhone 15 Pro 256GB", 80, 675),
      textItem("2", 25, 675),
      textItem("Factura FE-91573", 30, 773),
    ]);
    expect(page.split("\n")).toEqual([
      "Proveedor: Tecnocentro",
      "Factura FE-91573",
      "2 iPhone 15 Pro 256GB 2.500.000 5.000.000",
    ]);
    expect(shouldOcrInvoicePage(page)).toBe(false);
  });
  it("conserva el orden proporcionado si no existen coordenadas", () => {
    expect(extractPageText([{ str: "FACTURA", hasEOL: true }, { str: "FE-123" }]))
      .toBe("FACTURA\nFE-123 ");
  });
  it("activa OCR cuando el PDF contiene apenas un encabezado sin datos", () => {
    expect(shouldOcrInvoicePage("FACTURA ELECTRÓNICA DE VENTA")).toBe(true);
    expect(shouldOcrInvoicePage("Proveedor: A\nFactura FE-400\nFecha: 2026-11-05")).toBe(false);
  });
});
