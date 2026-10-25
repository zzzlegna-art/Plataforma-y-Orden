// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";

import { exportCompanyName, exportExcel, exportOrderSerialRelationPdf, exportPedidosHistorialExcel, exportProductCatalogExcel, exportSalesInvoicePdf, exportSalesRemisionPdf, normalizeCatalogText } from "./export";

const ONE_PIXEL_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooA//2Q==";

describe("PDF de relación de seriales", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("genera la relación de seriales con metadatos del pedido y descarga el PDF", () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:serial-relation-test",
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    const doc = exportOrderSerialRelationPdf({
      orderCode: "PED-001",
      companyName: "NEXORA",
      customer: "Cliente de prueba",
      orderDate: "25 oct 2026",
      filename: "pedido-ped-001-seriales.pdf",
      lines: [
        {
          reference: "iPhone 18 Pro Max 256 GB",
          condition: "nuevo",
          quantity: 2,
          serials: ["000000006520990", "000000004102691"],
        },
        {
          reference: "Repuesto de prueba",
          condition: "nuevo",
          quantity: 1,
          serials: [],
          requiresSerial: false,
        },
      ],
    });

    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
  });
});

describe("documentos comerciales de pedido", () => {
  const input = {
    orderCode: "PED-261025-002",
    companyName: "NEXORA",
    currency: "COP",
    orderDate: "25 oct 2026",
    deliveryDate: "25 oct 2026",
    customer: {
      name: "Cliente de prueba",
      taxId: "900123456",
      phone: "3001234567",
      email: "cliente@example.com",
      address: "Barranquilla",
    },
    lines: [
      {
        reference: "iPhone 18 Pro Max 256 GB",
        condition: "Nuevo",
        quantity: 2,
        unitPrice: 4200000,
        subtotal: 8400000,
        serials: ["000000006520990", "000000004102691"],
      },
    ],
    filename: "documento-prueba.pdf",
  };

  it("genera factura comercial PDF con referencia al pedido", () => {
    const doc = exportSalesInvoicePdf(input);
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
    expect(doc.output()).toContain("FAC-PED-261025-002");
    expect(doc.output()).toContain("No reemplaza factura electrónica DIAN");
  });

  it("genera remisión PDF con referencia al pedido y espacio de recibido conforme", () => {
    const doc = exportSalesRemisionPdf(input);
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
    expect(doc.output()).toContain("REM-PED-261025-002");
    expect(doc.output()).toContain("Recibido conforme");
  });
});

describe("identidad de exportaciones", () => {
  it("usa Nexora cuando el nombre de empresa es genérico", () => {
    expect(exportCompanyName(" Mi Empresa ")).toBe("NEXORA");
    expect(exportCompanyName("My Company")).toBe("NEXORA");
    expect(exportCompanyName("")).toBe("NEXORA");
    expect(exportCompanyName("Tecnología del Norte")).toBe("Tecnología del Norte");
  });
});

describe("normalización de texto del catálogo", () => {
  it("repara letras separadas sin pegar las palabras de conectividad", () => {
    expect(normalizeCatalogText(
      "C o n e c t i v i d a d: 5G, Bluetooth 5.3; 5G y e S I M s o l o e n l a v e r s i ó n W i F i + C e l l u l a r",
    )).toBe("Conectividad: 5G, Bluetooth 5.3; 5G y eSIM solo en la versión Wi-Fi + Cellular");
  });

  it("conserva espacios entre nombres de producto y corrige puntuación", () => {
    expect(normalizeCatalogText(
      "C o m p a t i b i l i d a d: A p p l e P e n c i l ( U S B C ); A p p l e P e n c i l d e 1 a g e n e r a c i ó n c o n a d a p t a d o r",
    )).toBe("Compatibilidad: Apple Pencil (USB-C); Apple Pencil de 1a generación con adaptador");
  });

  it("reconstruye especificaciones completas con siglas, unidades y palabras contiguas", () => {
    expect(normalizeCatalogText(
      "C o n e c t i v i d a d: 5 G 4 G L T E, W i F i 6, B l u e t o o t h 5 . 0, N F C, L i g h t n i n g",
    )).toBe("Conectividad: 5G 4G LTE, Wi-Fi 6, Bluetooth 5.0, NFC, Lightning");

    expect(normalizeCatalogText(
      "C o m p a t i b i l i d a d: D u a l S I M: n a n o S I M + e S I M; l a v a r i a n t e r e g i o n a l p u e d e c a m b i a r",
    )).toBe("Compatibilidad: Dual SIM: nano SIM + eSIM; la variante regional puede cambiar");
  });

  it("corrige las características del catálogo aunque incluyan separadores Unicode invisibles", () => {
    expect(normalizeCatalogText(
      "C\u200B o n e c t i v i d a d: 5 G, W i F i 6, B l u e t o o t h 5 . 0, N F C, L i g h t n i n g",
    )).toBe("Conectividad: 5G, Wi-Fi 6, Bluetooth 5.0, NFC, Lightning");

    expect(normalizeCatalogText(
      "C o m p a t i b i l i d a d: D u a l S I M: n a n o S I M + e S I M o D u a l e S I M, s e g ú n r e g i ó n",
    )).toBe("Compatibilidad: Dual SIM: nano SIM + eSIM o Dual eSIM, según región");
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

  it("descarga el catálogo aunque falle la carga de todas las miniaturas y conserva sus enlaces", async () => {
    let downloadedBlob: Blob | undefined;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => {
        downloadedBlob = blob;
        return "blob:catalog-fallback-test";
      },
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Image proxy unavailable"));

    const imageUrl = "https://ivholkjldntrmagcmogh.supabase.co/storage/v1/object/public/product-images/test.png";
    await exportProductCatalogExcel({
      title: "Catálogo Nexora",
      subtitle: "1 producto",
      filename: "catalog-fallback-test.xlsx",
      products: [{
        name: "Producto de prueba",
        sku: "SKU-001",
        brand: "Nexora",
        category: "Accesorios",
        imageUrl,
        features: [{ label: "Color", value: "Negro" }],
      }],
      includePrice: true,
      includeStock: true,
      labels: {
        image: "Imagen",
        openImage: "Abrir imagen",
        product: "Producto",
        reference: "Referencia",
        brand: "Marca",
        category: "Categoría",
        description: "Descripción",
        features: "Características",
        price: "Precio",
        stock: "Existencias",
        noDescription: "Sin descripción",
        noFeatures: "Sin características",
        imageUnavailable: "Imagen no disponible",
        moreFeatures: (count) => `+${count} más`,
      },
    });

    expect(downloadedBlob).toBeDefined();
    const archive = unzipSync(new Uint8Array(await downloadedBlob!.arrayBuffer()));
    const workbookContent = Object.entries(archive)
      .filter(([path]) => path.startsWith("xl/"))
      .map(([, bytes]) => strFromU8(bytes))
      .join("");
    expect(workbookContent).toContain("Producto de prueba");
    expect(workbookContent).toContain("Abrir imagen");
    expect(workbookContent).toContain(imageUrl);
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
