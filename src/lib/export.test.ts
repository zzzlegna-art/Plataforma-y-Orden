// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { jsPDF } from "jspdf";

import { dibujarEncabezado, subtituloDocumentoSinMarcaDuplicada, exportCompanyName, exportExcel, exportOrderSerialRelationPdf, exportPedidosHistorialExcel, exportProductCatalogExcel, exportProductCatalogPdf, exportSalesInvoicePdf, normalizeCatalogText, tituloDocumentoSinMarcaDuplicada, splitCatalogLines } from "./export";

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
    const pdfText = doc.output();
    expect(pdfText).toContain("iPhone 18 Pro Max 256 GB");
    expect(pdfText).toContain("000000006520990");
    expect(pdfText).toContain("000000004102691");
    expect(pdfText).toContain("PED-001");
    expect(pdfText).toContain("/Subtype /Image"); // Logo oficial incrustado en el archivo, sin red.
    expect(pdfText).toContain("NEXORA");
    expect(pdfText).toContain("Página 1 de 1");
  });

  it("divide grandes cantidades de IMEI en páginas legibles sin omitir seriales", () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:serial-relation-many-test",
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    const serials = Array.from({ length: 420 }, (_, index) => String(100000000000000 + index));
    const doc = exportOrderSerialRelationPdf({
      orderCode: "PED-MULTI",
      companyName: "NEXORA",
      customer: "Cliente de prueba",
      orderDate: "25 oct 2026",
      filename: "pedido-multi-seriales.pdf",
      lines: [{ reference: "iPhone de prueba", condition: "nuevo", quantity: serials.length, serials }],
    });

    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const pdfText = doc.output();
    expect(pdfText).toContain(serials[0]);
    expect(pdfText).toContain(serials[serials.length - 1]);
    expect(pdfText).toContain("/Subtype /Image");
    expect((pdfText.match(/NEXORA/g) ?? []).length).toBeGreaterThanOrEqual(doc.getNumberOfPages());
    expect(pdfText).toContain(`Página 1 de ${doc.getNumberOfPages()}`);
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
        reference: "IPH18PM-256",
        product: "iPhone 18 Pro Max 256 GB",
        condition: "Nuevo",
        quantity: 2,
        unitPrice: 4200000,
        subtotal: 8400000,
        serials: ["000000006520990", "000000004102691"],
      },
    ],
    filename: "documento-prueba.pdf",
  };

  it("genera factura comercial PDF con referencia, producto y valores sin incluir seriales ni avisos fiscales", () => {
    const doc = exportSalesInvoicePdf(input);
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
    const pdfText = doc.output();
    expect(pdfText).toContain("FAC-PED-261025-002");
    expect(pdfText).toContain("IPH18PM-256");
    expect(pdfText).toContain("iPhone 18 Pro Max 256 GB");
    expect(pdfText).toContain("Referencia");
    expect(pdfText).toContain("Producto");
    expect(pdfText).toContain("Condición");
    expect(pdfText).toContain("Cantidad");
    expect(pdfText).toContain("Precio unitario");
    expect(pdfText).toContain("Subtotal");
    expect(pdfText).not.toContain("000000006520990");
    expect(pdfText).not.toContain("000000004102691");
    expect(pdfText).not.toContain("Impuestos y requisitos fiscales");
    expect(pdfText).not.toContain("sistema autorizado correspondiente");
    expect(pdfText).not.toContain("No reemplaza factura electrónica DIAN");
    expect(pdfText).toContain("/Subtype /Image");
    expect(pdfText).toContain("NEXORA");
    expect(pdfText).toContain("TOTAL COMERCIAL");
    expect(pdfText).toContain("Página 1 de 1");
  });

  it("conserva los precios y el total en facturas extensas con varias páginas y logo oficial", () => {
    const doc = exportSalesInvoicePdf({
      ...input,
      filename: "factura-multipagina.pdf",
      lines: Array.from({ length: 80 }, (_, index) => ({
        reference: `REF-${index + 1}`,
        product: "iPhone de prueba 256 GB",
        condition: "Nuevo",
        quantity: 1,
        unitPrice: 1250000,
        subtotal: 1250000,
      })),
    });
    const text = doc.output();
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(text).toContain("REF-1");
    expect(text).toContain("REF-80");
    expect(text).toContain("TOTAL COMERCIAL");
    expect(text).toContain("/Subtype /Image");
    expect((text.match(/NEXORA/g) ?? []).length).toBeGreaterThanOrEqual(doc.getNumberOfPages());
    expect(text).toContain(`Página 1 de ${doc.getNumberOfPages()}`);
  });
});

describe("membrete común de PDF", () => {
  it.each(["portrait", "landscape"] as const)(
    "centra el PNG y alinea título y fecha a la derecha en A4 %s",
    (orientation) => {
      const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });
      const textSpy = vi.spyOn(doc, "text");
      const imageSpy = vi.spyOn(doc, "addImage");
      dibujarEncabezado(
        doc,
        "Catálogo de productos — Nexora",
        "NEXORA · Generado el 26 oct 2026, 07:31 p.m. · 1 registro",
      );

      const logoCall = imageSpy.mock.calls[0];
      expect(logoCall?.[1]).toBe("PNG");
      const logoY = Number(logoCall?.[3]);
      const logoHeight = Number(logoCall?.[5]);
      expect(logoY).toBeCloseTo((82 - logoHeight) / 2, 3);

      const titleCall = textSpy.mock.calls.find(
        (args) => Array.isArray(args[0]) && args[0].join(" ").includes("Catálogo de productos"),
      );
      const subtitleCall = textSpy.mock.calls.find(
        (args) => Array.isArray(args[0]) && args[0].join(" ").includes("Generado el 26 oct"),
      );
      expect(titleCall).toBeDefined();
      expect(subtitleCall).toBeDefined();
      expect(titleCall?.[1]).toBeCloseTo(doc.internal.pageSize.getWidth() - 24, 2);
      expect(subtitleCall?.[1]).toBeCloseTo(doc.internal.pageSize.getWidth() - 24, 2);
      expect(titleCall?.[3]).toEqual(expect.objectContaining({ align: "right" }));
      expect(subtitleCall?.[3]).toEqual(expect.objectContaining({ align: "right" }));
      expect((titleCall?.[0] as string[]).join(" ")).not.toContain("Nexora");
      expect((subtitleCall?.[0] as string[]).join(" ")).not.toContain("NEXORA");
      expect(Number(titleCall?.[2])).toBeGreaterThan(logoY);
      expect(Number(subtitleCall?.[2])).toBeLessThan(82);
    },
  );

  it("solo retira la marca del subtítulo cuando se repite al comienzo", () => {
    expect(subtituloDocumentoSinMarcaDuplicada("NEXORA · Generado el 26 oct")).toBe("Generado el 26 oct");
    expect(subtituloDocumentoSinMarcaDuplicada("Nexora — Pedido 123")).toBe("Pedido 123");
    expect(subtituloDocumentoSinMarcaDuplicada("Empresa del Norte · Pedido 123")).toBe("Empresa del Norte · Pedido 123");
  });
});

describe("identidad de exportaciones", () => {
  it("no repite la marca en el título cuando el PNG ya dice Nexora", () => {
    expect(tituloDocumentoSinMarcaDuplicada("Catálogo de productos — Nexora")).toBe("Catálogo de productos");
    expect(tituloDocumentoSinMarcaDuplicada("Inventario - NEXORA")).toBe("Inventario");
    expect(tituloDocumentoSinMarcaDuplicada("Relación de seriales – nexora  ")).toBe("Relación de seriales");
    expect(tituloDocumentoSinMarcaDuplicada("Facturas comerciales")).toBe("Facturas comerciales");
    expect(tituloDocumentoSinMarcaDuplicada("Catálogo — Otra empresa")).toBe("Catálogo — Otra empresa");
  });

  it("usa Nexora cuando el nombre de empresa es genérico", () => {
    expect(exportCompanyName(" Mi Empresa ")).toBe("NEXORA");
    expect(exportCompanyName("My Company")).toBe("NEXORA");
    expect(exportCompanyName("")).toBe("NEXORA");
    expect(exportCompanyName("Tecnología del Norte")).toBe("Tecnología del Norte");
  });
});

describe("ajuste seguro de texto técnico en PDF", () => {
  it("no permite que conectividad y otros textos largos sobresalgan de la tarjeta", () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const maxWidth = 300;
    const text = "Conectividad: Wi-Fi 4, Bluetooth 5.3, NFC, GPS o GPS + Cellular " +
      "y compatibilidad con más funciones y referencias técnicas extremadamente largas " +
      "SINESPACIOSPARAPROBARUNAPALABRATANLARGAQUENOCABENINGUNACOLUMNAA4";
    const lines = splitCatalogLines(doc, text, maxWidth, 8);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(8);
    lines.forEach((line) => expect(doc.getTextWidth(line)).toBeLessThanOrEqual(maxWidth + 0.01));
  });
});

describe("catálogo PDF legible", () => {
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

  it("coloca varias fichas compactas en una página sin desperdiciar espacio bajo la foto", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:catalog-compact-test" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    const doc = await exportProductCatalogPdf({
      title: "Catálogo de productos",
      subtitle: "3 registros",
      filename: "catalogo-compacto.pdf",
      products: Array.from({ length: 3 }, (_, index) => ({
        name: "iPad A16 128 GB " + (index + 1),
        sku: "A16-128-" + index,
        brand: "Apple",
        category: "Tablets",
        features: [
          { label: "Almacenamiento", value: "128 GB" },
          { label: "Memoria RAM", value: "6 GB" },
          { label: "Procesador", value: "Apple A16" },
          { label: "Conectividad", value: "Wi-Fi 6 y Bluetooth 5.3" },
          { label: "Compatibilidad", value: "Apple Pencil USB-C" },
        ],
      })),
      includePrice: false,
      includeStock: false,
      labels: {
        image: "Imagen", openImage: "Abrir imagen", product: "Producto",
        reference: "SKU", brand: "Marca", category: "Categoría",
        description: "Descripción", features: "Características del equipo",
        price: "Precio", stock: "Existencias", noDescription: "Sin descripción",
        noFeatures: "Sin características", imageUnavailable: "Sin imagen",
        moreFeatures: (count) => "+" + count + " características",
      },
    });
    expect(doc.getNumberOfPages()).toBe(1);
    const pdf = doc.output();
    expect(pdf).toContain("A16-128-0");
    expect(pdf).toContain("A16-128-2");
    expect(pdf).toContain("Almacenamiento");
    expect(pdf).toContain("Compatibilidad");
  });

  it("conserva datos y reparte fichas con varias características entre páginas", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:catalog-pdf-test" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    const doc = await exportProductCatalogPdf({
      title: "Catálogo de productos — Nexora",
      subtitle: "10 registros",
      filename: "catalogo-test.pdf",
      products: Array.from({ length: 10 }, (_, i) => ({
        name: "Tablet para prueba " + (i + 1),
        sku: "SKU-PRUEBA-" + (i + 1),
        brand: "Apple",
        category: "Tablets",
        description: "Equipo con pantalla brillante y conectividad de última generación.",
        price: "$1.000.000",
        stock: 5,
        features: Array.from({ length: 8 }, (_, j) => ({
          label: "Característica " + (j + 1),
          value: "Detalle técnico completo de referencia y compatibilidad para la ficha comercial.",
        })),
      })),
      includePrice: true,
      includeStock: true,
      labels: {
        image: "Imagen", openImage: "Abrir imagen", product: "Producto",
        reference: "SKU", brand: "Marca", category: "Categoría",
        description: "Descripción", features: "Características técnicas",
        price: "Precio", stock: "Existencias", noDescription: "Sin descripción",
        noFeatures: "Sin características", imageUnavailable: "Sin imagen",
        moreFeatures: (count) => "+" + count + " características",
      },
    });

    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const pdf = doc.output();
    expect(pdf).toContain("SKU-PRUEBA-1");
    expect(pdf).toContain("SKU-PRUEBA-10");
    expect(pdf).toContain("Catálogo de productos");
    expect(pdf).toContain("Página 1 de " + doc.getNumberOfPages());
    expect(pdf).toContain("/Subtype /Image");
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
        description: "Descripción completa del producto",
        features: [{ label: "Color", value: "Negro" }, { label: "Memoria", value: "128 GB" }],
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
    expect(workbookContent).toContain("Descripción completa del producto");
    expect(workbookContent).toContain("Memoria: 128 GB");
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
