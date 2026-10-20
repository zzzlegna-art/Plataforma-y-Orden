// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";

import { exportExcel } from "./export";

const ONE_PIXEL_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooA//2Q==";

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
        rows: [["", "SKU-001"]],
        imageColumn: 0,
        imageDataUrls: [ONE_PIXEL_JPEG],
        imageColumnWidth: 14,
        imageSizePx: 72,
        columnWidths: [16, 15],
        rowHeights: [68],
        freezeRows: 4,
      }],
    });

    expect(downloadedBlob).toBeDefined();
    const archive = unzipSync(new Uint8Array(await downloadedBlob!.arrayBuffer()));
    expect(archive["xl/media/image1.jpeg"]).toBeDefined();
    expect(archive["xl/drawings/drawing1.xml"]).toBeDefined();
    expect(strFromU8(archive["xl/drawings/drawing1.xml"])).toContain("<xdr:oneCellAnchor>");
    expect(strFromU8(archive["xl/worksheets/sheet1.xml"])).toContain("<drawing r:id=");
    expect(strFromU8(archive["xl/worksheets/_rels/sheet1.xml.rels"])).toContain(
      "/relationships/drawing",
    );
    vi.runOnlyPendingTimers();
  });
});
