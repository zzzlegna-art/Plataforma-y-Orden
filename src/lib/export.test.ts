// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";

import { exportCompanyName, exportExcel, exportPedidosHistorialExcel } from "./export";

const ONE_PIXEL_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooA//2Q==";

describe("identidad de exportaciones", () => {
  it("usa Nexora cuando el nombre de empresa es genérico", () => {
    expect(exportCompanyName(" Mi Empresa ")).toBe("NEXORA");
    expect(exportCompanyName("My Company")).toBe("NEXORA");
    expect(exportCompanyName("")).toBe("NEXORA");
    expect(exportCompanyName("Tecnología del Norte")).toBe("Tecnología del Norte");
  });
});

describe("exportExcel con miniaturas", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
    } else {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("congela título y encabezados en exportaciones Excel tabulares", async () => {
    let downloadedBlob: Blob | undefined;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => {
        downloadedBlob = blob;
        return "blob:catalog-table-test";
      },
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.useFakeTimers();

    exportExcel({
      filename: "table-test.xlsx",
      sheets: [{
        name: "Inventario",
        title: "Inventario Nexora",
        subtitle: "1 registro",
        columns: ["SKU", "Producto"],
        rows: [["SKU-001", "iPhone de prueba"]],
      }],
    });

    expect(downloadedBlob).toBeDefined();
    const archive = unzipSync(new Uint8Array(await downloadedBlob!.arrayBuffer()));
    const worksheetXml = strFromU8(archive["xl/worksheets/sheet1.xml"]);
    expect(worksheetXml).toContain('ySplit="4"');
    expect(worksheetXml).toContain('topLeftCell="A5"');
    vi.runOnlyPendingTimers();
  });

  it("exporta el historial agrupado sin depender de una variable sheets inexistente", async () => {
    let downloadedBlob: Blob | undefined;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => {
        downloadedBlob = blob;
        return "blob:history-test";
      },
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.useFakeTimers();

    exportPedidosHistorialExcel({
      title: "Historial de pedidos — NEXORA",
      subtitle: "1 pedido",
      filename: "historial-test.xlsx",
      pedidos: [{
        code: "PED-001",
        cliente: "Cliente de prueba",
        fecha: "19 oct 2026",
        lineas: [{
          referencia: "iPhone de prueba",
          cantidad: 2,
          seriales: ["IMEI-001", "IMEI-002"],
        }],
      }],
      labels: { referencia: "Referencia", cantidad: "Cantidad", seriales: "IMEI" },
    });

    expect(downloadedBlob).toBeDefined();
    const archive = unzipSync(new Uint8Array(await downloadedBlob!.arrayBuffer()));
    const worksheetXml = strFromU8(archive["xl/worksheets/sheet1.xml"]);
    expect(worksheetXml).toContain('ySplit="2"');
    const workbookXml = Object.entries(archive)
      .filter(([path]) => path.startsWith("xl/"))
      .map(([, bytes]) => strFromU8(bytes))
      .join("");
    expect(workbookXml).toContain("Cliente de prueba");
    expect(workbookXml).toContain("iPhone de prueba");
    vi.runOnlyPendingTimers();
  });

  it("incluye las imágenes en el archivo XLSX cuando la hoja tiene una columna de miniaturas", async () => {
    let downloadedBlob: Blob | undefined;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => {
        downloadedBlob = blob;
        return "blob:catalog-test";
      },
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.useFakeTimers();

    exportExcel({
      filename: "catalog-test.xlsx",
      sheets: [{
        name: "Catálogo",
        title: "Catálogo de prueba",
        subtitle: "Prueba de imágenes",
        columns: ["Imagen", "SKU"],
        rows: [["", "SKU-001"], ["", "SKU-002"]],
        imageColumn: 0,
        imageDataUrls: [ONE_PIXEL_JPEG, ONE_PIXEL_JPEG],
        imageColumnWidth: 14,
        imageSizePx: 72,
        columnWidths: [16, 15],
        rowHeights: [68, 68],
        freezeRows: 4,
      }],
    });

    expect(downloadedBlob).toBeDefined();
    const archive = unzipSync(new Uint8Array(await downloadedBlob!.arrayBuffer()));
    expect(archive["xl/media/image1.jpeg"]).toBeDefined();
    expect(archive["xl/drawings/drawing1.xml"]).toBeDefined();
    const drawingXml = strFromU8(archive["xl/drawings/drawing1.xml"]);
    expect(drawingXml.match(/<xdr:twoCellAnchor editAs="twoCell">/g)).toHaveLength(2);
    expect(drawingXml).toContain("<xdr:row>4</xdr:row>");
    expect(drawingXml).toContain("<xdr:row>5</xdr:row>");
    expect(drawingXml).not.toContain("oneCellAnchor");
    expect(strFromU8(archive["xl/worksheets/sheet1.xml"])).toContain("<drawing r:id=");
    expect(strFromU8(archive["xl/worksheets/_rels/sheet1.xml.rels"])).toContain(
      "/relationships/drawing",
    );
    vi.runOnlyPendingTimers();
  });
});
