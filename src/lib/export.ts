/**
 * Exportación PDF y Excel con identidad visual Nexora.
 * Paleta fija y apta para impresión: azul noche, turquesa y fondos cian muy suaves.
 * Se mantiene independiente del tema claro/oscuro del navegador para que los informes
 * conserven una apariencia consistente al compartirlos o imprimirlos.
 */

import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import XLSX from "xlsx-js-style";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { formatDateTime } from "./format";
import officialNexoraPdfLogo from "../../scripts/nexora-pdf-logo.b64?raw";
import { normalizeCatalogText } from "./catalog-text";
export { normalizeCatalogText } from "./catalog-text";

// Se leen directamente de Vite para que importar export.ts no inicialice el cliente autenticado
// ni rompa pruebas/pantallas que solo necesitan generar documentos.
const CATALOG_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const CATALOG_SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const NAVY: [number, number, number] = [15, 39, 64];
const CYAN: [number, number, number] = [0, 196, 214];
const CYAN_DARK: [number, number, number] = [0, 112, 128];
const CYAN_PALE: [number, number, number] = [239, 250, 252];
const BORDER: [number, number, number] = [213, 230, 236];
const TEXT: [number, number, number] = [28, 46, 64];
const MUTED: [number, number, number] = [91, 113, 132];

const NAVY_HEX = "0F2740";
const CYAN_HEX = "00C4D6";
const CYAN_PALE_HEX = "EFFAFC";
const CYAN_SOFT_HEX = "DEF5F8";
const BORDER_HEX = "D5E6EC";
const TEXT_HEX = "1C2E40";
const MUTED_HEX = "5B7184";
const WHITE_HEX = "FFFFFF";

// --- Identidad oficial Nexora para PDF: independiente del tema y de la red ---
const HEADER_H = 82;
/** Reserva inferior para paginación y pie institucional. */
const FOOTER_SPACE = 42;
/** El contenido comienza siempre después del encabezado, incluso en las páginas siguientes. */
const CONTENT_TOP = HEADER_H + 17;
/** PNG oficial horizontal, adaptado para fondo oscuro en generate-brand-assets.mjs. */
const PDF_LOGO = `data:image/png;base64,${officialNexoraPdfLogo.trim()}`;

/** Evita duplicar la marca escrita al lado del logotipo oficial. */
export const tituloDocumentoSinMarcaDuplicada = (title: string): string =>
  title.replace(/\s*[—–-]\s*Nexora\s*$/i, "").trim() || title;

/** Quita el nombre que ya aparece en el logotipo, solo si abre el subtítulo. */
export const subtituloDocumentoSinMarcaDuplicada = (subtitle: string): string =>
  subtitle.replace(/^\s*Nexora\s*[·|—–-]\s*/i, "").trim();

/**
 * Membrete común de todos los PDF: logotipo PNG centrado verticalmente a la
 * izquierda; título y subtítulo alineados a la derecha, como un bloque centrado.
 * Adapta el espacio disponible a páginas A4 verticales y horizontales.
 */
export const dibujarEncabezado = (doc: jsPDF, title: string, subtitle: string, margin = 24) => {
  const pageW = doc.internal.pageSize.getWidth();
  const headerInnerW = pageW - margin * 2;
  const logoWidth = Math.min(200, headerInnerW * 0.36);
  const logoHeight = logoWidth * (128 / 556);
  const logoX = margin;
  const logoY = (HEADER_H - logoHeight) / 2;
  const textRight = pageW - margin;
  const textLeft = logoX + logoWidth + 24;
  const textWidth = Math.max(100, textRight - textLeft);

  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(0, 0, pageW, HEADER_H, "F");
  doc.setFillColor(CYAN[0], CYAN[1], CYAN[2]);
  doc.rect(0, 0, pageW, 3, "F");
  doc.rect(0, HEADER_H - 2, pageW, 2, "F");

  // Logo original transparente, sin fondo ni caja blanca.
  doc.addImage(PDF_LOGO, "PNG", logoX, logoY, logoWidth, logoHeight, undefined, "FAST");

  // Dos columnas independientes: ninguna línea debe invadir el área del logo.
  const cleanTitle = tituloDocumentoSinMarcaDuplicada(title);
  doc.setFont("helvetica", "bold");
  let titleFontSize = pageW < 650 ? 15.5 : 18;
  doc.setFontSize(titleFontSize);
  let titleLines = doc.splitTextToSize(cleanTitle, textWidth) as string[];
  while (titleLines.length > 2 && titleFontSize > 11) {
    titleFontSize -= 0.5;
    doc.setFontSize(titleFontSize);
    titleLines = doc.splitTextToSize(cleanTitle, textWidth) as string[];
  }
  titleLines = splitCatalogLines(doc, cleanTitle, textWidth, 2);

  const cleanSubtitle = subtituloDocumentoSinMarcaDuplicada(subtitle);
  doc.setFont("helvetica", "normal");
  let subtitleFontSize = 8.8;
  doc.setFontSize(subtitleFontSize);
  let subtitleLines = cleanSubtitle ? (doc.splitTextToSize(cleanSubtitle, textWidth) as string[]) : [];
  while (subtitleLines.length > 2 && subtitleFontSize > 7.5) {
    subtitleFontSize -= 0.3;
    doc.setFontSize(subtitleFontSize);
    subtitleLines = doc.splitTextToSize(cleanSubtitle, textWidth) as string[];
  }
  if (cleanSubtitle) subtitleLines = splitCatalogLines(doc, cleanSubtitle, textWidth, 2);

  // Centramos la altura combinada del título y su fecha, no cada texto por separado.
  const titleLeading = titleFontSize * 1.2;
  const subtitleLeading = subtitleFontSize * 1.25;
  const between = subtitleLines.length ? 7 : 0;
  const blockH = titleLines.length * titleLeading + between + subtitleLines.length * subtitleLeading;
  const blockTop = (HEADER_H - blockH) / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(titleFontSize);
  doc.setTextColor(255, 255, 255);
  doc.text(titleLines, textRight, blockTop + titleFontSize * 0.85, {
    align: "right", lineHeightFactor: 1.2,
  });

  if (subtitleLines.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(subtitleFontSize);
    doc.setTextColor(220, 246, 250);
    doc.text(subtitleLines, textRight,
      blockTop + titleLines.length * titleLeading + between + subtitleFontSize * 0.84,
      { align: "right", lineHeightFactor: 1.25 });
  }
};

/** Pie institucional compacto con marca, contexto y paginación en cada hoja. */
const dibujarPies = (doc: jsPDF, title: string, margin = 24) => {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  const contextWidth = Math.max(70, pageW - margin * 2 - 255);
  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina);
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.6);
    doc.line(margin, pageH - 31, pageW - margin, pageH - 31);
    doc.setFillColor(CYAN[0], CYAN[1], CYAN[2]);
    doc.roundedRect(margin, pageH - 25, 3, 12, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text("NEXORA", margin + 9, pageH - 17);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    const context = (doc.splitTextToSize(tituloDocumentoSinMarcaDuplicada(title), contextWidth) as string[])[0] ?? title;
    doc.text(context, margin + 68, pageH - 17);
    doc.text(`Página ${pagina} de ${total}`, pageW - margin, pageH - 17, { align: "right" });
  }
};

/** Subtítulo estándar de los reportes: fecha de generación y total. */
export const exportSubtitle = (count: number, note?: string) => {
  const when = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  const plural = count === 1 ? "registro" : "registros";
  return `Generado el ${when} · ${count} ${plural}${note ? ` · ${note}` : ""}`;
};

/** Nombre consistente en los documentos: sustituye valores genéricos por la marca Nexora. */
export const exportCompanyName = (value?: string | null): string => {
  const name = value?.trim();
  if (!name || ["mi empresa", "my company", "your company"].includes(name.toLowerCase())) {
    return "NEXORA";
  }
  return name;
};

export interface PdfExportOptions {
  title: string;
  subtitle: string;
  head: string[];
  body: (string | number)[][];
  filename: string;
  /** Columnas destacadas con turquesa oscuro y negrita (p. ej. el código). */
  highlightColumns?: number[];
}

/** Genera y descarga un PDF con encabezado Nexora y tabla legible. */
export const exportPdf = ({
  title,
  subtitle,
  head,
  body,
  filename,
  highlightColumns = [],
}: PdfExportOptions) => {
  const doc = new jsPDF({ orientation: head.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const margin = 24;

  // Las columnas que son solo números (unidades, cantidades) van centradas.
  const numericas = head.map(
    (_, columna) => body.length > 0 && body.every((fila) => typeof fila[columna] === "number"),
  );
  const columnStyles: Record<number, { halign: "center" }> = {};
  numericas.forEach((esNumerica, columna) => {
    if (esNumerica) columnStyles[columna] = { halign: "center" };
  });

  autoTable(doc, {
    startY: CONTENT_TOP,
    margin: { top: CONTENT_TOP, left: margin, right: margin, bottom: FOOTER_SPACE },
    head: [head],
    body,
    showHead: "everyPage",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 6, bottom: 6, left: 7, right: 7 },
      textColor: TEXT,
      lineColor: BORDER,
      lineWidth: 0.4,
      valign: "middle",
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      lineColor: CYAN,
      lineWidth: 0.8,
      fontStyle: "bold",
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: CYAN_PALE },
    columnStyles,
    // El encabezado se repite en cada página, no solo en la primera.
    didDrawPage: () => dibujarEncabezado(doc, title, subtitle, margin),
    didParseCell: (data) => {
      if (data.section === "head" && numericas[data.column.index]) {
        data.cell.styles.halign = "center";
      }
      if (data.section === "body" && highlightColumns.includes(data.column.index)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = CYAN_DARK;
      }
    },
  });

  dibujarPies(doc, title, margin);
  doc.save(filename);
};

export interface OrderSerialRelationLine {
  reference: string;
  condition: string;
  quantity: number;
  serials: string[];
  /** Los repuestos y otros artículos no serializados no requieren IMEI. */
  requiresSerial?: boolean;
}

/**
 * PDF de relación de seriales para empaque y verificación.
 * Resume el pedido en una franja superior y agrupa los IMEI por referencia,
 * conservando cada serial en una línea independiente para facilitar la lectura.
 */
export const exportOrderSerialRelationPdf = ({
  orderCode,
  companyName,
  customer,
  orderDate,
  lines,
  filename,
}: {
  orderCode: string;
  companyName?: string | null;
  customer: string;
  orderDate: string;
  lines: OrderSerialRelationLine[];
  filename: string;
}) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const width = pageW - margin * 2;
  const bottom = pageH - FOOTER_SPACE;
  const columns = 5;
  const columnWidth = (width - 24) / columns;
  const company = exportCompanyName(companyName);
  const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalSerials = lines
    .filter((line) => line.requiresSerial !== false)
    .reduce((sum, line) => sum + line.serials.length, 0);
  const title = "Relación de seriales";
  const subtitle = `${company} · Generado el ${formatDateTime(new Date().toISOString())}`;
  const bandH = 55;
  const cardStart = CONTENT_TOP + bandH + 12;

  const drawHeader = () => dibujarEncabezado(doc, title, subtitle, margin);
  const drawOrderBand = () => {
    const y = CONTENT_TOP;
    const gap = 8;
    const colWidths = [130, 160, 106, width - 130 - 160 - 106 - 3 * gap - 14];
    const details = [
      { label: "PEDIDO", value: orderCode },
      { label: "CLIENTE", value: customer || "Sin cliente" },
      { label: "FECHA", value: orderDate || "Sin registrar" },
      { label: "CONTENIDO", value: `${totalUnits} uds. · ${totalSerials} IMEI` },
    ];
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setFillColor(CYAN_PALE[0], CYAN_PALE[1], CYAN_PALE[2]);
    doc.roundedRect(margin, y, width, bandH, 5, 5, "FD");
    doc.setFillColor(CYAN[0], CYAN[1], CYAN[2]);
    doc.roundedRect(margin, y, 4, bandH, 2, 2, "F");

    let x = margin + 12;
    details.forEach((entry, index) => {
      const cellW = colWidths[index] - 7;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(entry.label, x, y + 15);
      doc.setFont("helvetica", index === 0 ? "bold" : "normal");
      doc.setFontSize(index === 0 ? 9.5 : 8.2);
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      const valueLines = doc.splitTextToSize(entry.value, cellW) as string[];
      doc.text(valueLines.slice(0, 2), x, y + 31, { lineHeightFactor: 1.18 });
      x += colWidths[index] + gap;
    });
  };

  drawHeader();
  drawOrderBand();
  let y = cardStart;

  const newPage = () => {
    doc.addPage();
    drawHeader();
    drawOrderBand();
    y = cardStart;
  };

  for (const line of lines) {
    const serials = line.requiresSerial === false ? [] : line.serials;
    const condition = line.requiresSerial === false ? "No aplica" : (line.condition || "—");
    const countLabel = line.requiresSerial === false
      ? "sin serial"
      : serials.length
        ? `${serials.length} IMEI`
        : "seriales pendientes";
    const label = `${line.reference} (${condition}) x${line.quantity} — ${countLabel}`;
    const titleLines = doc.splitTextToSize(label, width - 22) as string[];
    const titleHeight = Math.max(15, titleLines.length * 11 + 5);
    const maxRowsPerPage = Math.max(1, Math.floor((bottom - cardStart - titleHeight - 16) / 15));
    const chunks: string[][] = [];
    if (serials.length === 0) {
      chunks.push([]);
    } else {
      for (let offset = 0; offset < serials.length; offset += columns * maxRowsPerPage) {
        chunks.push(serials.slice(offset, offset + columns * maxRowsPerPage));
      }
    }

    chunks.forEach((chunk, chunkIndex) => {
      const chunkRows = chunk.length ? Math.ceil(chunk.length / columns) : 1;
      const headerText = chunkIndex === 0 ? titleLines : doc.splitTextToSize(`${line.reference} — continuación de IMEI`, width - 22) as string[];
      const headerH = Math.max(18, headerText.length * 11 + 7);
      const cardH = headerH + chunkRows * 15 + 15;
      if (y + cardH > bottom) newPage();

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
      doc.roundedRect(margin, y, width, cardH, 4, 4, "FD");
      doc.setFillColor(CYAN_PALE[0], CYAN_PALE[1], CYAN_PALE[2]);
      doc.roundedRect(margin + 0.5, y + 0.5, width - 1, headerH, 3, 3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.7);
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.text(headerText, margin + 10, y + 13);

      doc.setFont("courier", "normal");
      doc.setFontSize(7.4);
      doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
      if (chunk.length === 0) {
        const emptyText = line.requiresSerial === false ? "No requiere serial" : "Pendiente de serializar";
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.8);
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.text(emptyText, margin + 10, y + headerH + 13);
      } else {
        chunk.forEach((serial, index) => {
          const col = index % columns;
          const row = Math.floor(index / columns);
          const x = margin + 10 + col * columnWidth;
          const textY = y + headerH + 13 + row * 15;
          doc.text(serial, x, textY, { maxWidth: columnWidth - 4 });
        });
      }
      y += cardH + 6;
    });
  }

  dibujarPies(doc, `Relación de seriales · ${orderCode}`, margin);
  doc.save(filename);
  return doc;
};

export interface SalesDocumentLine {
  reference: string;
  product: string;
  condition?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface SalesDocumentCustomer {
  name: string;
  taxId?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface SalesDocumentInput {
  orderCode: string;
  companyName?: string | null;
  currency: string;
  orderDate: string;
  deliveryDate?: string;
  customer: SalesDocumentCustomer;
  lines: SalesDocumentLine[];
  filename: string;
}

const formatDocumentMoney = (amount: number, currency: string) => {
  const validCurrency = /^[A-Z]{3}$/.test(currency) ? currency : "COP";
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: validCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(amount);
  }
};

const drawSalesMetadata = (
  doc: jsPDF,
  input: SalesDocumentInput,
  margin: number,
  top: number,
  width: number,
  documentNumber: string,
) => {
  const company = exportCompanyName(input.companyName);
  const customer = input.customer;
  const entries = [
    { label: "EMISOR", value: company },
    { label: "CLIENTE", value: customer.name || "Consumidor / cliente sin nombre" },
    { label: "NIT / IDENTIFICACIÓN", value: customer.taxId || "No registrado" },
    { label: "PEDIDO", value: input.orderCode },
    { label: "DOCUMENTO", value: documentNumber },
    { label: "FECHA", value: input.deliveryDate || input.orderDate },
  ];
  const columns = 3;
  const gap = 8;
  const cellW = (width - gap * (columns - 1)) / columns;
  const cellH = 42;
  entries.forEach((entry, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = margin + col * (cellW + gap);
    const y = top + row * (cellH + gap);
    doc.setFillColor(CYAN_PALE[0], CYAN_PALE[1], CYAN_PALE[2]);
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.roundedRect(x, y, cellW, cellH, 4, 4, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(entry.label, x + 8, y + 13);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    const value = doc.splitTextToSize(entry.value, cellW - 16) as string[];
    doc.text(value.slice(0, 2), x + 8, y + 27);
  });
  return top + 2 * (cellH + gap) - gap;
};

/** Genera la factura comercial del pedido en PDF. */
export const exportSalesInvoicePdf = (input: SalesDocumentInput) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 28;
  const width = pageW - margin * 2;
  const company = exportCompanyName(input.companyName);
  const documentNumber = `FAC-${input.orderCode}`;
  const title = `FACTURA COMERCIAL · ${documentNumber}`;
  const subtitle = `${company} · Pedido ${input.orderCode}`;
  const drawHeader = () => dibujarEncabezado(doc, title, subtitle, margin);
  drawHeader();

  const metaBottom = drawSalesMetadata(doc, input, margin, CONTENT_TOP, width, documentNumber);
  const customerDetails = [
    input.customer.address ? `Dirección: ${input.customer.address}` : "",
    input.customer.phone ? `Teléfono: ${input.customer.phone}` : "",
    input.customer.email ? `Correo: ${input.customer.email}` : "",
  ].filter(Boolean).join(" · ");
  let tableStart = metaBottom + 14;
  if (customerDetails) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
    const detailLines = doc.splitTextToSize(customerDetails, width) as string[];
    doc.text(detailLines, margin, metaBottom + 14, { lineHeightFactor: 1.2 });
    tableStart = metaBottom + 20 + detailLines.length * 10;
  }
  autoTable(doc, {
    startY: tableStart,
    margin: { top: CONTENT_TOP, left: margin, right: margin, bottom: FOOTER_SPACE + 20 },
    head: [["Referencia", "Producto", "Condición", "Cantidad", "Precio unitario", "Subtotal"]],
    body: input.lines.map((line) => [
      line.reference,
      line.product,
      line.condition || "—",
      line.quantity,
      formatDocumentMoney(line.unitPrice, input.currency),
      formatDocumentMoney(line.subtotal, input.currency),
    ]),
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: { top: 6, bottom: 6, left: 6, right: 6 },
      textColor: TEXT,
      lineColor: BORDER,
      lineWidth: 0.45,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], lineColor: CYAN, lineWidth: 0.8, fontStyle: "bold" },
    alternateRowStyles: { fillColor: CYAN_PALE },
    columnStyles: {
      0: { cellWidth: width * 0.13, fontStyle: "bold", textColor: CYAN_DARK },
      1: { cellWidth: width * 0.25 },
      2: { cellWidth: width * 0.12 },
      3: { cellWidth: width * 0.08, halign: "center" },
      4: { cellWidth: width * 0.21, halign: "right" },
      5: { cellWidth: width * 0.21, halign: "right" },
    },
    didDrawPage: () => drawHeader(),
  });

  let y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? tableStart) + 18;
  const totalBoxH = 62;
  if (y + totalBoxH + 10 > pageH - FOOTER_SPACE) {
    doc.addPage();
    drawHeader();
    y = CONTENT_TOP + 13;
  }

  const total = input.lines.reduce((sum, line) => sum + line.subtotal, 0);
  const boxW = 265;
  const boxX = pageW - margin - boxW;
  doc.setFillColor(CYAN_PALE[0], CYAN_PALE[1], CYAN_PALE[2]);
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.roundedRect(boxX, y, boxW, totalBoxH, 6, 6, "FD");
  doc.setFillColor(CYAN[0], CYAN[1], CYAN[2]);
  doc.roundedRect(boxX, y, 4, totalBoxH, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text("TOTAL COMERCIAL", boxX + 15, y + 20);
  const displayTotal = formatDocumentMoney(total, input.currency);
  doc.setFont("helvetica", "bold");
  let size = 17;
  doc.setFontSize(size);
  while (doc.getTextWidth(displayTotal) > boxW - 30 && size > 10) {
    size -= 1;
    doc.setFontSize(size);
  }
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text(displayTotal, boxX + boxW - 15, y + 45, { align: "right" });
  dibujarPies(doc, `Factura comercial · ${input.orderCode}`, margin);
  doc.save(input.filename);
  return doc;
};

/** Subtítulo de los reportes de garantías: fecha, nota opcional y equipos. */
export const exportSubtitleEquipos = (count: number, note?: string) => {
  const when = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
  const equipos = count === 1 ? "1 equipo" : `${count} equipos`;
  return `Generado el ${when}${note ? ` · ${note}` : ""} · ${equipos}`;
};

/** Un equipo dentro del reporte de garantías recibidas. */
export interface WarrantyCard {
  product: string;
  serial?: string;
  receivedAt: string;
  location?: string;
  reason?: string;
  /** Técnico asignado (solo aplica a casos "en servicio"). */
  technician?: string;
  /** Resolución del diagnóstico (solo aplica a casos en reenvío), ya traducida. */
  resolution?: string;
}

/** Un lote: los casos que comparten un mismo pedido. */
export interface WarrantyGroup {
  title: string;
  items: WarrantyCard[];
}

const GREY: [number, number, number] = [91, 113, 132];
const CARD_BORDER: [number, number, number] = [213, 230, 236];
const GROUP_FILL: [number, number, number] = [239, 250, 252];
const GROUP_BORDER: [number, number, number] = [213, 230, 236];
const DARK: [number, number, number] = [28, 46, 64];

/**
 * PDF de garantías recibidas en fichas, agrupadas por lote: cada equipo va en
 * su tarjeta (modelo, IMEI, fecha de ingreso, ubicación y motivo) y los que
 * pertenecen al mismo pedido quedan juntos bajo el nombre del pedido.
 */
export const exportWarrantyPdf = ({
  title,
  subtitle,
  groups,
  filename,
  labels,
}: {
  title: string;
  subtitle: string;
  groups: WarrantyGroup[];
  filename: string;
  labels: { serial: string; received: string; units: (count: number) => string; technician?: string };
}) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const bottom = pageH - FOOTER_SPACE;
  const width = pageW - margin * 2;

  const header = () => dibujarEncabezado(doc, title, subtitle, margin);
  header();

  let y = CONTENT_TOP;
  let numero = 1;

  const newPage = () => {
    doc.addPage();
    header();
    y = CONTENT_TOP;
  };

  for (const group of groups) {
    if (y + 34 > bottom) newPage();

    doc.setFillColor(GROUP_FILL[0], GROUP_FILL[1], GROUP_FILL[2]);
    doc.setDrawColor(GROUP_BORDER[0], GROUP_BORDER[1], GROUP_BORDER[2]);
    doc.roundedRect(margin, y, width, 26, 4, 4, "FD");
    doc.setFillColor(CYAN[0], CYAN[1], CYAN[2]);
    doc.roundedRect(margin, y, 5, 26, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text(group.title, margin + 14, y + 17);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(GREY[0], GREY[1], GREY[2]);
    doc.text(labels.units(group.items.length), pageW - margin - 10, y + 17, { align: "right" });
    y += 36;

    for (const item of group.items) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      const productLines = doc.splitTextToSize(`${numero}. ${item.product}`, width - 22) as string[];

      const meta = [
        item.serial ? `${labels.serial}: ${item.serial}` : null,
        `${labels.received}: ${formatDateTime(item.receivedAt)}`,
        item.technician && labels.technician ? `${labels.technician}: ${item.technician}` : null,
        item.resolution || null,
        item.location || null,
      ].filter(Boolean) as string[];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const metaLines = doc.splitTextToSize(meta.join("  ·  "), width - 22) as string[];

      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      const reasonLines = item.reason
        ? (doc.splitTextToSize(`"${item.reason}"`, width - 22) as string[])
        : [];

      const metaStart = 16 + productLines.length * 12 + 1;
      const metaLastBaseline = metaStart + Math.max(0, metaLines.length - 1) * 10;
      const reasonStart = metaLastBaseline + 13;
      const height = Math.max(
        34,
        reasonLines.length > 0
          ? reasonStart + reasonLines.length * 11 - 6
          : metaLastBaseline + 5,
      );
      if (y + height > bottom) newPage();

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(CARD_BORDER[0], CARD_BORDER[1], CARD_BORDER[2]);
      doc.roundedRect(margin, y, width, height, 4, 4, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(DARK[0], DARK[1], DARK[2]);
      doc.text(productLines, margin + 11, y + 16);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(GREY[0], GREY[1], GREY[2]);
      doc.text(metaLines, margin + 11, y + metaStart);

      if (reasonLines.length > 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(GREY[0], GREY[1], GREY[2]);
        doc.text(reasonLines, margin + 11, y + reasonStart);
      }

      y += height + 8;
      numero += 1;
    }
    y += 6;
  }

  dibujarPies(doc, title, margin);
  doc.save(filename);
};

/** Subtítulo del historial de pedidos: fecha y cantidad de pedidos. */
export const exportSubtitlePedidos = (count: number) => {
  const when = new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  const plural = count === 1 ? "1 pedido" : `${count} pedidos`;
  return `Generado el ${when} · ${plural}`;
};

/** Una referencia de un pedido con sus seriales (para el historial en PDF). */
export interface PedidoHistorialLinea {
  title: string;
  seriales: string[];
}

/** Un pedido despachado, listo para el historial. */
export interface PedidoHistorial {
  code: string;
  cliente: string;
  fecha: string;
  /** Total de unidades del pedido; si viene, se muestra en la banda. */
  unidades?: number;
  lineas: PedidoHistorialLinea[];
}

/**
 * PDF de historial de pedidos: cada pedido en su bloque con el cliente, la
 * fecha y sus referencias; los IMEIs van en cuadrícula debajo de cada línea.
 */
export const exportPedidosHistorialPdf = ({
  title,
  subtitle,
  pedidos,
  filename,
  incluirSeriales = true,
}: {
  title: string;
  subtitle: string;
  pedidos: PedidoHistorial[];
  filename: string;
  /** Con `false` solo salen las referencias y cantidades, sin la cuadrícula de IMEIs. */
  incluirSeriales?: boolean;
}) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const bottom = pageH - FOOTER_SPACE;
  const width = pageW - margin * 2;
  const COLUMNAS = 6;

  const header = () => dibujarEncabezado(doc, title, subtitle, margin);
  header();

  let y = CONTENT_TOP;
  const newPage = () => {
    doc.addPage();
    header();
    y = CONTENT_TOP;
  };

  for (const pedido of pedidos) {
    const meta = [
      pedido.cliente,
      pedido.fecha,
      pedido.unidades !== undefined ? `${pedido.unidades} uds` : null,
    ].filter(Boolean).join(" · ");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const metaLines = doc.splitTextToSize(meta, width - 150) as string[];
    const headerHeight = Math.max(24, 18 + Math.max(0, metaLines.length - 1) * 10);
    if (y + headerHeight > bottom) newPage();

    doc.setFillColor(GROUP_FILL[0], GROUP_FILL[1], GROUP_FILL[2]);
    doc.setDrawColor(GROUP_BORDER[0], GROUP_BORDER[1], GROUP_BORDER[2]);
    doc.roundedRect(margin, y, width, headerHeight, 4, 4, "FD");
    doc.setFillColor(CYAN[0], CYAN[1], CYAN[2]);
    doc.roundedRect(margin, y, 5, headerHeight, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text(pedido.code, margin + 14, y + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(GREY[0], GREY[1], GREY[2]);
    const metaStart = y + (headerHeight - Math.max(0, metaLines.length - 1) * 10) / 2 + 4;
    doc.text(metaLines, pageW - margin - 10, metaStart, { align: "right" });
    y += headerHeight + 8;

    for (const linea of pedido.lineas) {
      const tituloLineas = doc.splitTextToSize(linea.title, width - 22) as string[];
      const filas = incluirSeriales ? Math.max(1, Math.ceil(linea.seriales.length / COLUMNAS)) : 0;
      const alto = incluirSeriales
        ? 24 + tituloLineas.length * 12 + filas * 12
        : 12 + tituloLineas.length * 12;
      if (y + alto > bottom) newPage();

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(CARD_BORDER[0], CARD_BORDER[1], CARD_BORDER[2]);
      doc.roundedRect(margin, y, width, alto, 4, 4, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(DARK[0], DARK[1], DARK[2]);
      doc.text(tituloLineas, margin + 11, y + 15);

      const colW = (width - 22) / COLUMNAS;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(GREY[0], GREY[1], GREY[2]);
      (incluirSeriales ? linea.seriales : []).forEach((serial, indice) => {
        const col = indice % COLUMNAS;
        const fila = Math.floor(indice / COLUMNAS);
        const x = margin + 11 + col * colW;
        const yTexto = y + 24 + tituloLineas.length * 12 + fila * 12 + 8;
        doc.text(serial, x, yTexto);
      });

      y += alto + 6;
    }
    y += 4;
  }

  dibujarPies(doc, title, margin);
  doc.save(filename);
};

/** Una referencia de un pedido con cantidad y seriales (para el historial en Excel). */
export interface PedidoHistorialDetalleLinea {
  referencia: string;
  cantidad: number;
  seriales: string[];
}

/** Un pedido despachado con sus líneas detalladas, listo para el historial en Excel. */
export interface PedidoHistorialDetalle {
  code: string;
  cliente: string;
  fecha: string;
  lineas: PedidoHistorialDetalleLinea[];
}

const HIST_CLIENTE_FILL = CYAN_PALE_HEX;
const HIST_CLIENTE_BORDER = BORDER_HEX;
const HIST_CLIENTE_TEXT = NAVY_HEX;

/**
 * Excel de historial de pedidos despachados: agrupado por pedido/cliente, con
 * una sección por cada uno (nombre del cliente, código y fecha) seguida de
 * una tabla con sus referencias, cantidades e IMEIs — todo en una sola hoja,
 * organizado de arriba a abajo cliente por cliente.
 */
export const exportPedidosHistorialExcel = ({
  title,
  subtitle,
  pedidos,
  filename,
  labels,
  incluirSeriales = true,
}: {
  title: string;
  subtitle: string;
  pedidos: PedidoHistorialDetalle[];
  filename: string;
  labels: { referencia: string; cantidad: string; seriales: string; total?: string };
  /** Con `false` la hoja queda en dos columnas (referencia y cantidad), sin IMEIs. */
  incluirSeriales?: boolean;
}) => {
  const wb = XLSX.utils.book_new();
  const ncols = incluirSeriales ? 3 : 2;
  const rows: (string | number)[][] = [[title], [subtitle], []];
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: ncols - 1 } },
  ];
  const clienteRows: number[] = [];
  const headerRows: number[] = [];
  const totalRows: number[] = [];
  let totalGeneral = 0;

  pedidos.forEach((pedido) => {
    clienteRows.push(rows.length);
    merges.push({ s: { r: rows.length, c: 0 }, e: { r: rows.length, c: 1 } });
    rows.push(
      incluirSeriales
        ? [`${pedido.cliente} — ${pedido.code}`, "", pedido.fecha]
        : [`${pedido.cliente} — ${pedido.code} · ${pedido.fecha}`, ""],
    );

    headerRows.push(rows.length);
    rows.push(
      incluirSeriales
        ? [labels.referencia, labels.cantidad, labels.seriales]
        : [labels.referencia, labels.cantidad],
    );

    pedido.lineas.forEach((linea) => {
      rows.push(
        incluirSeriales
          ? [linea.referencia, linea.cantidad, linea.seriales.join(", ")]
          : [linea.referencia, linea.cantidad],
      );
    });

    // Total de unidades del bloque.
    const unidadesPedido = pedido.lineas.reduce((suma, linea) => suma + linea.cantidad, 0);
    totalGeneral += unidadesPedido;
    totalRows.push(rows.length);
    rows.push(
      incluirSeriales
        ? [labels.total ?? "Total", unidadesPedido, ""]
        : [labels.total ?? "Total", unidadesPedido],
    );

    rows.push([]);
  });

  // Total general de todo lo exportado.
  if (pedidos.length > 1) {
    totalRows.push(rows.length);
    rows.push(
      incluirSeriales ? ["Total general", totalGeneral, ""] : ["Total general", totalGeneral],
    );
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = incluirSeriales
    ? [{ wch: 34 }, { wch: 12 }, { wch: 70 }]
    : [{ wch: 60 }, { wch: 12 }];
  ws["!merges"] = merges;

  const address = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

  // Alturas: título, subtítulo, bandas de cliente y encabezados de cada bloque.
  const alturas: { hpt: number }[] = [];
  alturas[0] = { hpt: 28 };
  alturas[1] = { hpt: 16 };
  alturas[2] = { hpt: 8 };
  clienteRows.forEach((r) => {
    alturas[r] = { hpt: 24 };
  });
  headerRows.forEach((r) => {
    alturas[r] = { hpt: 20 };
  });
  ws["!rows"] = Array.from({ length: rows.length }, (_, r) => alturas[r] ?? {});

  const titleStyle = {
    font: { bold: true, sz: 16, color: { rgb: WHITE_HEX } },
    fill: { fgColor: { rgb: NAVY_HEX } },
    alignment: { vertical: "center" },
  } as const;
  for (let c = 0; c < ncols; c += 1) {
    const cell = ws[address(0, c)] ?? { t: "s" as const, v: "" };
    cell.s = titleStyle;
    ws[address(0, c)] = cell;
  }
  const subtitleStyle = {
    font: { sz: 9, italic: true, color: { rgb: MUTED_HEX } },
    fill: { fgColor: { rgb: CYAN_PALE_HEX } },
    alignment: { vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: CYAN_HEX } } },
  } as const;
  for (let c = 0; c < ncols; c += 1) {
    const cell = ws[address(1, c)] ?? { t: "s" as const, v: "" };
    cell.s = subtitleStyle;
    ws[address(1, c)] = cell;
  }

  clienteRows.forEach((r) => {
    for (let c = 0; c < ncols; c += 1) {
      const style = {
        font: { bold: true, sz: 11, color: { rgb: HIST_CLIENTE_TEXT } },
        fill: { fgColor: { rgb: HIST_CLIENTE_FILL } },
        border: {
          top: { style: "medium", color: { rgb: CYAN_HEX } },
          bottom: { style: "thin", color: { rgb: HIST_CLIENTE_BORDER } },
        },
        alignment: { horizontal: c === 2 ? "right" : "left", vertical: "center" },
      } as const;
      const cell = ws[address(r, c)];
      if (cell) cell.s = style;
      else ws[address(r, c)] = { t: "s", v: "", s: style };
    }
  });

  headerRows.forEach((r) => {
    for (let c = 0; c < ncols; c += 1) {
      const cell = ws[address(r, c)];
      if (cell) {
        cell.s = {
          font: { bold: true, sz: 9.5, color: { rgb: WHITE_HEX } },
          fill: { fgColor: { rgb: NAVY_HEX } },
          alignment: { vertical: "center", horizontal: c === 1 ? "center" : "left", wrapText: true },
          border: { bottom: { style: "medium", color: { rgb: CYAN_HEX } } },
        };
      }
    }
  });

  // Filas de total: negrita, fondo cian suave y la cifra centrada bajo "Cantidad".
  totalRows.forEach((r, indice) => {
    const esGeneral = pedidos.length > 1 && indice === totalRows.length - 1;
    for (let c = 0; c < ncols; c += 1) {
      const style = {
        font: { bold: true, sz: esGeneral ? 11 : 10, color: { rgb: esGeneral ? WHITE_HEX : HIST_CLIENTE_TEXT } },
        fill: { fgColor: { rgb: esGeneral ? NAVY_HEX : CYAN_SOFT_HEX } },
        alignment: { horizontal: c === 1 ? "center" : "left", vertical: "center" },
        border: { top: { style: "thin", color: { rgb: HIST_CLIENTE_BORDER } } },
      } as const;
      const cell = ws[address(r, c)];
      if (cell) cell.s = style;
      else ws[address(r, c)] = { t: "s", v: "", s: style };
    }
  });

  const specialRows = new Set([...clienteRows, ...headerRows, ...totalRows, 0, 1, 2]);
  rows.forEach((row, r) => {
    if (specialRows.has(r) || row.length === 0) return;
    for (let c = 0; c < ncols; c += 1) {
      const cell = ws[address(r, c)];
      if (!cell) continue;
      cell.s = {
        font: { sz: 9.5, color: { rgb: TEXT_HEX } },
        alignment: {
          vertical: "center",
          horizontal: c === 1 ? "center" : "left",
          wrapText: c === 2,
        },
        border: { bottom: { style: "thin", color: { rgb: BORDER_HEX } } },
      };
    }
  });

  XLSX.utils.book_append_sheet(wb, ws, "Historial");
  // El historial tiene bandas y encabezados repetidos por pedido: solo congelamos
  // el título y subtítulo globales, no la cabecera del primer pedido.
  downloadWorkbook(wb, [{
    name: "Historial",
    title,
    subtitle,
    columns: [],
    rows: [],
    freezeRows: 2,
  }], filename);
};

export interface ExcelSheet {
  name: string;
  title: string;
  subtitle: string;
  columns: string[];
  rows: (string | number)[][];
  /** Columnas cuyo texto se ajusta (wrap) dentro de la celda. */
  wrapColumns?: number[];
  /** Columnas que deben exportarse como hipervínculos cuando contienen una URL http(s). */
  hyperlinkColumns?: number[];
  /** Destinos explícitos de hipervínculos por fila y columna (índices desde cero). */
  hyperlinkTargets?: (string | undefined)[][];
  /** Anchos de columna explícitos, en caracteres de Excel. */
  columnWidths?: number[];
  /** Columna (índice desde cero) donde se anclan las miniaturas. */
  imageColumn?: number;
  /** Miniaturas JPEG en data URL, una por cada fila de datos. */
  imageDataUrls?: (string | null | undefined)[];
  /** Altura de cada fila de datos, en puntos. */
  rowHeights?: number[];
  /** Cantidad de filas superiores que se mantienen congeladas. */
  freezeRows?: number;
  /** Ancho de la columna de miniaturas, en caracteres de Excel. */
  imageColumnWidth?: number;
  /** Tamaño cuadrado de la miniatura, en píxeles. */
  imageSizePx?: number;
  /** Formatos numéricos de Excel por índice de columna (por ejemplo, "#,##0"). */
  numberFormats?: Record<number, string>;
}


const EXCEL_DATA_START_ROW = 4;
const EXCEL_EMU_PER_PIXEL = 9525;

const freezeWorksheetRows = (xml: string, rows: number): string => {
  const firstVisibleRow = rows + 1;
  const pane =
    '<pane ySplit="' + rows + '" topLeftCell="A' + firstVisibleRow +
    '" activePane="bottomLeft" state="frozen"/>' +
    '<selection pane="bottomLeft" activeCell="A' + firstVisibleRow +
    '" sqref="A' + firstVisibleRow + '"/>';

  const selfClosingView = /<sheetView\b([^>]*)\/>/;
  if (selfClosingView.test(xml)) {
    return xml.replace(selfClosingView, (_match, attributes: string) =>
      '<sheetView' + attributes + '>' + pane + '</sheetView>',
    );
  }

  const fullView = /<sheetView\b([^>]*)>([\s\S]*?)<\/sheetView>/;
  if (fullView.test(xml)) {
    return xml.replace(fullView, (_match, attributes: string, body: string) => {
      const withoutOldPane = body
        .replace(/<pane\b[^>]*\/>/g, "")
        .replace(/<selection\b[^>]*\/>/g, "");
      return '<sheetView' + attributes + '>' + pane + withoutOldPane + '</sheetView>';
    });
  }

  return xml.replace(
    /(<sheetViews\b[^>]*>)/,
    '$1<sheetView workbookViewId="0">' + pane + '</sheetView>',
  );
};

const nextRelationshipId = (xml: string): number => {
  const ids = [...xml.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  return Math.max(0, ...ids) + 1;
};

const decodeJpegDataUrl = (dataUrl: string): Uint8Array | null => {
  const separator = dataUrl.indexOf(",");
  if (separator < 0 || !dataUrl.startsWith("data:image/jpeg;base64,")) return null;
  const binary = atob(dataUrl.slice(separator + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const downloadWorkbook = (
  workbook: ReturnType<typeof XLSX.utils.book_new>,
  sheets: ExcelSheet[],
  filename: string,
) => {
  const output = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    cellStyles: true,
  }) as ArrayBuffer | Uint8Array;
  const sourceBytes = output instanceof Uint8Array ? output : new Uint8Array(output);
  const archive = unzipSync(sourceBytes);
  const contentTypesBytes = archive["[Content_Types].xml"];
  if (!contentTypesBytes) throw new Error("No se encontró el manifiesto del libro Excel.");

  let contentTypesXml = strFromU8(contentTypesBytes);
  const drawingOverrides: string[] = [];
  let nextImageNumber = 1;
  let nextDrawingNumber = 1;
  let hasImages = false;

  sheets.forEach((sheet, sheetIndex) => {
    const worksheetPath = "xl/worksheets/sheet" + (sheetIndex + 1) + ".xml";
    const worksheetBytes = archive[worksheetPath];
    if (!worksheetBytes) return;

    let worksheetXml = strFromU8(worksheetBytes);
    // Todas las tablas mantienen visibles el título y el encabezado al desplazarse.
    const freezeRows = sheet.freezeRows ?? 4;
    if (freezeRows > 0) {
      worksheetXml = freezeWorksheetRows(worksheetXml, freezeRows);
    }

    const imageColumn = sheet.imageColumn;
    const images = imageColumn === undefined
      ? []
      : (sheet.imageDataUrls ?? []).flatMap((dataUrl, rowIndex) => {
          if (!dataUrl) return [];
          const bytes = decodeJpegDataUrl(dataUrl);
          return bytes ? [{ rowIndex, bytes }] : [];
        });

    if (images.length > 0 && imageColumn !== undefined) {
      hasImages = true;
      const drawingNumber = nextDrawingNumber++;
      const drawingPath = "xl/drawings/drawing" + drawingNumber + ".xml";
      const drawingRelsPath = "xl/drawings/_rels/drawing" + drawingNumber + ".xml.rels";
      const worksheetRelsPath = "xl/worksheets/_rels/sheet" + (sheetIndex + 1) + ".xml.rels";
      let worksheetRelsXml = archive[worksheetRelsPath]
        ? strFromU8(archive[worksheetRelsPath])
        : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

      const drawingRelId = "rId" + nextRelationshipId(worksheetRelsXml);
      worksheetRelsXml = worksheetRelsXml.replace(
        "</Relationships>",
        '<Relationship Id="' + drawingRelId +
          '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing' +
          drawingNumber + '.xml"/></Relationships>',
      );
      archive[worksheetRelsPath] = strToU8(worksheetRelsXml);

      const worksheetRoot = worksheetXml.match(/<worksheet\b[^>]*>/)?.[0] ?? "";
      if (worksheetRoot && !/\sxmlns:r=/.test(worksheetRoot)) {
        worksheetXml = worksheetXml.replace(
          /<worksheet\b/,
          '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
        );
      }
      const drawingTag = '<drawing r:id="' + drawingRelId + '"/>';
      if (/<extLst\b/.test(worksheetXml)) {
        worksheetXml = worksheetXml.replace(/<extLst\b/, drawingTag + "<extLst");
      } else {
        worksheetXml = worksheetXml.replace("</worksheet>", drawingTag + "</worksheet>");
      }
      drawingOverrides.push(
        '<Override PartName="/xl/drawings/drawing' + drawingNumber +
          '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>',
      );

      const drawingRelationships: string[] = [];
      const anchors: string[] = [];
      images.forEach((entry, imageIndex) => {
        const mediaNumber = nextImageNumber++;
        const relationshipId = "rId" + (imageIndex + 1);
        archive["xl/media/image" + mediaNumber + ".jpeg"] = entry.bytes;
        drawingRelationships.push(
          '<Relationship Id="' + relationshipId +
            '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image' +
            mediaNumber + '.jpeg"/>',
        );

        const imageSize = sheet.imageSizePx ?? 72;
        const rowHeight = sheet.rowHeights?.[entry.rowIndex] ?? 68;
        const columnWidth = sheet.columnWidths?.[imageColumn] ?? sheet.imageColumnWidth ?? 14;
        const columnPixels = columnWidth * 7 + 5;
        const rowPixels = rowHeight * 96 / 72;
        const columnOffset = Math.max(0, Math.round((columnPixels - imageSize) / 2 * EXCEL_EMU_PER_PIXEL));
        const rowOffset = Math.max(0, Math.round((rowPixels - imageSize) / 2 * EXCEL_EMU_PER_PIXEL));
        const sizeEmu = imageSize * EXCEL_EMU_PER_PIXEL;
        const pictureId = imageIndex + 1;

        const imageRow = EXCEL_DATA_START_ROW + entry.rowIndex;
        const endColumnOffset = columnOffset + sizeEmu;
        const endRowOffset = rowOffset + sizeEmu;
        // Dos anclajes a la misma celda hacen que Excel mueva y oculte la imagen junto con
        // la fila al aplicar filtros, en lugar de dejarla flotando sobre otra referencia.
        anchors.push(
          '<xdr:twoCellAnchor editAs="twoCell">' +
            '<xdr:from><xdr:col>' + imageColumn + '</xdr:col><xdr:colOff>' +
              columnOffset + '</xdr:colOff><xdr:row>' +
              imageRow +
              '</xdr:row><xdr:rowOff>' + rowOffset + '</xdr:rowOff></xdr:from>' +
            '<xdr:to><xdr:col>' + imageColumn + '</xdr:col><xdr:colOff>' +
              endColumnOffset + '</xdr:colOff><xdr:row>' +
              imageRow +
              '</xdr:row><xdr:rowOff>' + endRowOffset + '</xdr:rowOff></xdr:to>' +
            '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + pictureId +
              '" name="Imagen de producto ' + pictureId + '"/>' +
              '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
              '<xdr:blipFill><a:blip r:embed="' + relationshipId +
                '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
              '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + sizeEmu +
                '" cy="' + sizeEmu + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
            '</xdr:pic><xdr:clientData/></xdr:twoCellAnchor>',
        );
      });

      archive[drawingPath] = strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ' +
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        anchors.join("") + "</xdr:wsDr>",
      );
      archive[drawingRelsPath] = strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        drawingRelationships.join("") + "</Relationships>",
      );
    }

    archive[worksheetPath] = strToU8(worksheetXml);
  });

  if (hasImages) {
    if (!/<Default\b[^>]*Extension="jpeg"/i.test(contentTypesXml)) {
      contentTypesXml = contentTypesXml.replace(
        /(<Types\b[^>]*>)/,
        '$1<Default Extension="jpeg" ContentType="image/jpeg"/>',
      );
    }
    if (drawingOverrides.length > 0) {
      contentTypesXml = contentTypesXml.replace("</Types>", drawingOverrides.join("") + "</Types>");
    }
    archive["[Content_Types].xml"] = strToU8(contentTypesXml);
  }

  const zipBytes = zipSync(archive, { level: 6 });
  const zipBuffer = zipBytes.buffer.slice(
    zipBytes.byteOffset,
    zipBytes.byteOffset + zipBytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([zipBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Genera y descarga un libro de Excel con una hoja por tabla. */
export const exportExcel = ({
  filename,
  sheets,
}: {
  filename: string;
  sheets: ExcelSheet[];
}) => {
  const wb = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const ncols = sheet.columns.length;
    const rows: (string | number)[][] = [[sheet.title], [sheet.subtitle], []];
    const headerRow = rows.length;
    rows.push([...sheet.columns]);
    sheet.rows.forEach((row) => rows.push(row));

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Ancho de cada columna según su contenido (con un mínimo y un tope) para que los nombres de
    // producto y demás textos largos no se corten con la celda vecina.
    ws["!cols"] = Array.from({ length: ncols }, (_, c) => {
      const explicitWidth = sheet.columnWidths?.[c];
      if (explicitWidth) return { wch: explicitWidth };
      const largo = Math.max(
        String(sheet.columns[c] ?? "").length,
        ...sheet.rows.map((row) => String(row[c] ?? "").length),
      );
      const tope = sheet.wrapColumns?.includes(c) ? 40 : 60;
      return { wch: Math.min(Math.max(largo + 2, 12), tope) };
    });
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: ncols - 1 } },
    ];

    const address = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

    // Filas del título y altura de producto: las miniaturas quedan centradas y el texto envuelto.
    const worksheetRows: { hpt?: number }[] = [
      { hpt: 28 },
      { hpt: 16 },
      { hpt: 8 },
      { hpt: 24 },
    ];
    sheet.rows.forEach((_, rowIndex) => {
      const rowHeight = sheet.rowHeights?.[rowIndex] ??
        (sheet.imageColumn !== undefined ? 68 : undefined);
      if (rowHeight) worksheetRows[headerRow + 1 + rowIndex] = { hpt: rowHeight };
    });
    ws["!rows"] = worksheetRows;

    // Las columnas que son solo números (unidades, cantidades) van centradas.
    const numericas = sheet.columns.map(
      (_, c) => sheet.rows.length > 0 && sheet.rows.every((row) => typeof row[c] === "number"),
    );

    const titleStyle = {
      font: { bold: true, sz: 16, color: { rgb: WHITE_HEX } },
      fill: { fgColor: { rgb: NAVY_HEX } },
      alignment: { vertical: "center" },
    } as const;
    for (let c = 0; c < ncols; c += 1) {
      const cell = ws[address(0, c)] ?? { t: "s" as const, v: "" };
      cell.s = titleStyle;
      ws[address(0, c)] = cell;
    }
    const subtitleStyle = {
      font: { sz: 9, italic: true, color: { rgb: MUTED_HEX } },
      fill: { fgColor: { rgb: CYAN_PALE_HEX } },
      alignment: { vertical: "center" },
      border: { bottom: { style: "thin", color: { rgb: CYAN_HEX } } },
    } as const;
    for (let c = 0; c < ncols; c += 1) {
      const cell = ws[address(1, c)] ?? { t: "s" as const, v: "" };
      cell.s = subtitleStyle;
      ws[address(1, c)] = cell;
    }

    // Encabezado de la tabla: azul noche con acento turquesa.
    for (let c = 0; c < ncols; c += 1) {
      const cell = ws[address(headerRow, c)];
      if (cell) {
        cell.s = {
          font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: NAVY_HEX } },
          alignment: {
            vertical: "center",
            horizontal: numericas[c] ? "center" : "left",
          },
          border: { bottom: { style: "medium", color: { rgb: CYAN_HEX } } },
        };
      }
    }

    // Filas alternas en cian muy suave para leer mejor de lado a lado.
    for (let r = headerRow + 1; r < rows.length; r += 1) {
      if (rows[r].length === 0) continue;
      const alterna = (r - headerRow) % 2 === 0;
      for (let c = 0; c < ncols; c += 1) {
        const cell = ws[address(r, c)];
        if (!cell) continue;
        const dataRowIndex = r - headerRow - 1;
        const rowData = sheet.rows[dataRowIndex];
        const linkValue = sheet.hyperlinkTargets?.[dataRowIndex]?.[c] ??
          (sheet.hyperlinkColumns?.includes(c) ? rowData?.[c] : undefined);
        const hyperlink = typeof linkValue === "string" &&
          (linkValue.startsWith("https://") || linkValue.startsWith("http://"));
        cell.s = {
          font: {
            sz: 10,
            color: { rgb: hyperlink ? "0563C1" : TEXT_HEX },
            ...(hyperlink ? { underline: true } : {}),
          },
          ...(sheet.numberFormats?.[c] ? { numFmt: sheet.numberFormats[c] } : {}),
          ...(alterna ? { fill: { fgColor: { rgb: CYAN_PALE_HEX } } } : {}),
          alignment: {
            vertical: "center",
            horizontal: sheet.imageColumn === c || numericas[c] ? "center" : "left",
            wrapText: sheet.wrapColumns?.includes(c) ?? false,
          },
          border: { bottom: { style: "thin", color: { rgb: BORDER_HEX } } },
        };
        if (hyperlink && typeof linkValue === "string") {
          cell.l = { Target: linkValue, Tooltip: linkValue };
        }
      }
    }

    // Filtros en el encabezado para ordenar y buscar desde Excel.
    if (sheet.rows.length > 0) {
      ws["!autofilter"] = {
        ref: XLSX.utils.encode_range({
          s: { r: headerRow, c: 0 },
          e: { r: rows.length - 1, c: ncols - 1 },
        }),
      };
    }

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  });

  // Usar un único escritor para todos los Excel: aplica paneles congelados y,
  // cuando corresponda, incrusta las imágenes en el mismo archivo XLSX.
  downloadWorkbook(wb, sheets, filename);
};


/** Característica técnica registrada para una referencia del catálogo. */
export interface ProductCatalogFeature {
  label: string;
  value: string;
}

/** Datos de una referencia para el catálogo comercial y la hoja administrativa. */
export interface ProductCatalogItem {
  name: string;
  sku: string;
  brand?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  price?: string;
  stock?: number;
  features: ProductCatalogFeature[];
}

export interface ProductCatalogLabels {
  image: string;
  openImage: string;
  product: string;
  reference: string;
  brand: string;
  category: string;
  description: string;
  features: string;
  price: string;
  stock: string;
  noDescription: string;
  noFeatures: string;
  imageUnavailable: string;
  moreFeatures: (count: number) => string;
}

export type CatalogExportPhase = "preparing" | "images" | "rendering" | "saving" | "complete";

export interface CatalogExportProgress {
  phase: CatalogExportPhase;
  completed: number;
  total: number;
  percent: number;
}

export interface ProductCatalogExportOptions {
  title: string;
  subtitle: string;
  filename: string;
  products: ProductCatalogItem[];
  includePrice: boolean;
  includeStock: boolean;
  labels: ProductCatalogLabels;
  onProgress?: (progress: CatalogExportProgress) => void;
}

/** Divide incluso palabras/cadenas anómalas que jsPDF deje demasiado largas.
 * Cada línea se mide con la fuente activa; nunca invade el ancho de su columna.
 * Solo los textos resumidos llevan elipsis, no las fichas técnicas completas.
 */
export const splitCatalogLines = (doc: jsPDF, text: string, width: number, maxLines: number): string[] => {
  const safeWidth = Math.max(16, width);
  const initial = doc.splitTextToSize(text, safeWidth) as string[];
  const wrapped: string[] = [];
  for (const raw of initial) {
    if (!raw) { wrapped.push(""); continue; }
    let current = "";
    for (const char of raw) {
      if (current && doc.getTextWidth(current + char) > safeWidth) {
        wrapped.push(current);
        current = char;
      } else {
        current += char;
      }
    }
    if (current) wrapped.push(current);
  }
  if (wrapped.length <= maxLines) return wrapped;
  const visible = wrapped.slice(0, maxLines);
  let last = visible[visible.length - 1] ?? "";
  while (last.length && doc.getTextWidth(last + "…") > safeWidth) {
    last = last.slice(0, -1);
  }
  visible[visible.length - 1] = last + "…";
  return visible;
};

/**
 * Descarga la imagen por la Edge Function del proyecto para evitar bloqueos CORS del storage.
 * La respuesta se rasteriza a JPEG para que Excel pueda incrustarla de forma compatible.
 */
const loadCatalogImageData = async (url?: string): Promise<string | null> => {
  if (!url) return null;

  try {
    if (!CATALOG_SUPABASE_URL || !CATALOG_SUPABASE_KEY) return null;
    const requestedUrl = new URL(url);
    const projectUrl = new URL(CATALOG_SUPABASE_URL);
    if (
      requestedUrl.origin !== projectUrl.origin ||
      !requestedUrl.pathname.startsWith("/storage/v1/object/public/product-images/")
    ) {
      return null;
    }

    const response = await fetch(
      CATALOG_SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1/catalog-image-proxy",
      {
        method: "POST",
        headers: {
          apikey: CATALOG_SUPABASE_KEY,
          Authorization: "Bearer " + CATALOG_SUPABASE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: requestedUrl.href }),
      },
    );
    if (!response.ok) return null;

    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;

    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context || !bitmap.width || !bitmap.height) return null;

      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
      const width = bitmap.width * scale;
      const height = bitmap.height * scale;
      context.drawImage(
        bitmap,
        (canvas.width - width) / 2,
        (canvas.height - height) / 2,
        width,
        height,
      );
      return canvas.toDataURL("image/jpeg", 0.9);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
};

/**
 * Catálogo PDF Nexora: fichas compactas de altura dinámica para aprovechar cada página.
 * Conserva las fotografías y características registradas sin reservar media página
 * para cada producto. Las referencias sin datos se identifican explícitamente.
 */



/**
 * Catálogo comercial: la foto y las primeras especificaciones comparten una
 * fila. El resto fluye a todo el ancho, con tarjetas de altura dinámica.
 * Las líneas se miden con la fuente realmente utilizada antes de dibujarlas.
 */
export const exportProductCatalogPdf = async ({
  title, subtitle, filename, products, includePrice, includeStock, labels, onProgress,
}: ProductCatalogExportOptions) => {
  onProgress?.({ phase: "preparing", completed: 0, total: products.length, percent: 3 });
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const padding = 12;
  const gap = 10;
  const cardWidth = pageW - margin * 2;
  const imageBoxSize = 94;
  const imageSize = 86;
  const imageX = margin + padding;
  const detailX = imageX + imageBoxSize + 15;
  const detailWidth = pageW - margin - padding - detailX;
  const sideTextX = detailX + 7;
  const sideTextWidth = detailWidth - 7;
  const fullTextX = margin + padding + 13;
  const fullTextWidth = cardWidth - 2 * padding - 26;
  const footerHeight = includePrice || includeStock ? 27 : 0;
  const bottom = pageH - FOOTER_SPACE;
  const maxCardHeight = bottom - CONTENT_TOP;
  const detailLineHeight = 11.6;
  const drawHeader = () => dibujarEncabezado(doc, title, subtitle, margin);

  const layouts = products.map((product) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.2);
    const nameLines = splitCatalogLines(doc, normalizeCatalogText(product.name), detailWidth, 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.4);
    const metadata = [
      labels.reference + ": " + normalizeCatalogText(product.sku || "—"),
      product.brand ? labels.brand + ": " + normalizeCatalogText(product.brand) : null,
      product.category ? labels.category + ": " + normalizeCatalogText(product.category) : null,
    ].filter(Boolean).join("  ·  ");
    const metadataLines = splitCatalogLines(doc, metadata, detailWidth, 2);
    const descriptionLines = product.description?.trim()
      ? splitCatalogLines(doc, normalizeCatalogText(product.description), detailWidth, 2)
      : [];
    const introHeight = nameLines.length * 15 + 4 + metadataLines.length * 10.8 +
      (descriptionLines.length ? 5 + descriptionLines.length * 10.8 : 0);
    doc.setFontSize(8.6);
    const specs = product.features ?? [];
    const safeSpecText = (feature: ProductCatalogFeature) =>
      normalizeCatalogText(feature.label) + ": " + normalizeCatalogText(feature.value);
    const sideRows = specs.map((feature) =>
      splitCatalogLines(doc, safeSpecText(feature), sideTextWidth, 12));
    const fullRows = specs.map((feature) =>
      splitCatalogLines(doc, safeSpecText(feature), fullTextWidth, 12));
    const noFeatures = splitCatalogLines(doc, labels.noFeatures, sideTextWidth, 4);

    // Hasta la altura inferior de la fotografía, sin invadirla.
    const sideRoom = Math.max(0, imageBoxSize - introHeight - 19);
    let sideUsed = 0;
    let sideCount = 0;
    for (const lines of sideRows) {
      const next = lines.length * detailLineHeight + 2;
      if (sideUsed + next > sideRoom) break;
      sideUsed += next;
      sideCount++;
    }
    const visibleSide = sideRows.slice(0, sideCount);
    const remaining = fullRows.slice(sideCount);
    const maxBottomHeight = maxCardHeight - (padding * 2 + imageBoxSize + 7 + footerHeight);
    const bottomRows: string[][] = [];
    let remainingHeight = 0;
    for (const lines of remaining) {
      const rowH = lines.length * detailLineHeight + 2;
      if (remainingHeight + rowH + 18 > maxBottomHeight) break;
      bottomRows.push(lines);
      remainingHeight += rowH;
    }
    const omitted = remaining.length - bottomRows.length;
    const bottomPanelHeight = bottomRows.length || omitted
      ? 13 + remainingHeight + (omitted ? 14 : 0) + 5
      : 0;
    const cardHeight = padding * 2 + imageBoxSize +
      (bottomPanelHeight ? 7 + bottomPanelHeight : 0) + footerHeight;
    return {
      product, nameLines, metadataLines, descriptionLines, introHeight,
      visibleSide, bottomRows, noFeatures, omitted, bottomPanelHeight, cardHeight,
    };
  });

  onProgress?.({ phase: "images", completed: 0, total: products.length, percent: 8 });
  const imageDataUrls: (string | null)[] = [];
  for (let index = 0; index < products.length; index += 4) {
    const batch = await Promise.all(
      products.slice(index, index + 4).map((product) => loadCatalogImageData(product.imageUrl)),
    );
    imageDataUrls.push(...batch);
    onProgress?.({
      phase: "images", completed: imageDataUrls.length, total: products.length,
      percent: 8 + Math.round((imageDataUrls.length / Math.max(1, products.length)) * 48),
    });
  }

  const drawSpecRows = (rows: string[][], x: number, width: number, y: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.6);
    for (const lines of rows) {
      doc.setFillColor(CYAN_DARK[0], CYAN_DARK[1], CYAN_DARK[2]);
      doc.circle(x - 6, y - 3, 1.15, "F");
      doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
      // La segunda medida protege también frente a texto Unicode largo.
      const safeLines = lines.flatMap((line) => splitCatalogLines(doc, line, width, 12));
      doc.text(safeLines, x, y, { lineHeightFactor: 1.32, maxWidth: width });
      y += safeLines.length * detailLineHeight + 2;
    }
    return y;
  };

  onProgress?.({ phase: "rendering", completed: 0, total: layouts.length, percent: 58 });
  drawHeader();
  let cardY = CONTENT_TOP;
  for (let index = 0; index < layouts.length; index += 1) {
    const layout = layouts[index];
    if (cardY > CONTENT_TOP && cardY + layout.cardHeight > bottom) {
      doc.addPage();
      drawHeader();
      cardY = CONTENT_TOP;
    }
    const {
      product, nameLines, metadataLines, descriptionLines, introHeight,
      visibleSide, bottomRows, noFeatures, omitted, bottomPanelHeight, cardHeight,
    } = layout;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.65);
    doc.roundedRect(margin, cardY, cardWidth, cardHeight, 7, 7, "FD");
    doc.setFillColor(CYAN[0], CYAN[1], CYAN[2]);
    doc.roundedRect(margin + 1, cardY + 13, 3, 24, 1, 1, "F");

    const imageY = cardY + padding;
    doc.setFillColor(CYAN_PALE[0], CYAN_PALE[1], CYAN_PALE[2]);
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.roundedRect(imageX, imageY, imageBoxSize, imageBoxSize, 5, 5, "FD");
    const imageData = imageDataUrls[index] ?? null;
    if (imageData) {
      doc.addImage(imageData, "JPEG",
        imageX + (imageBoxSize - imageSize) / 2,
        imageY + (imageBoxSize - imageSize) / 2,
        imageSize, imageSize);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.8);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(splitCatalogLines(doc, labels.imageUnavailable, imageBoxSize - 15, 2),
        imageX + imageBoxSize / 2, imageY + imageBoxSize / 2, { align: "center" });
    }

    let y = cardY + padding + 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.2);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text(nameLines, detailX, y, { lineHeightFactor: 1.19 });
    y += nameLines.length * 15 + 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.4);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(metadataLines, detailX, y, { lineHeightFactor: 1.28 });
    y += metadataLines.length * 10.8;
    if (descriptionLines.length) {
      y += 5;
      doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
      doc.text(descriptionLines, detailX, y, { lineHeightFactor: 1.25 });
    }
    if (product.features.length) {
      const featuresLabelY = cardY + padding + introHeight + 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.4);
      doc.setTextColor(CYAN_DARK[0], CYAN_DARK[1], CYAN_DARK[2]);
      doc.text(splitCatalogLines(doc, labels.features.toUpperCase(), detailWidth, 1),
        detailX, featuresLabelY);
      drawSpecRows(visibleSide, sideTextX, sideTextWidth, featuresLabelY + 14);
    } else {
      drawSpecRows([noFeatures], sideTextX, sideTextWidth,
        cardY + padding + introHeight + 12);
    }

    let cardContentBottom = imageY + imageBoxSize;
    if (bottomPanelHeight) {
      const panelY = cardContentBottom + 7;
      const panelX = margin + padding;
      const panelWidth = cardWidth - padding * 2;
      doc.setFillColor(CYAN_PALE[0], CYAN_PALE[1], CYAN_PALE[2]);
      doc.roundedRect(panelX, panelY, panelWidth, bottomPanelHeight, 5, 5, "F");
      const lastY = drawSpecRows(bottomRows, fullTextX, fullTextWidth, panelY + 13);
      if (omitted) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.text(splitCatalogLines(doc, labels.moreFeatures(omitted), fullTextWidth, 1),
          fullTextX, lastY + 1);
      }
      cardContentBottom = panelY + bottomPanelHeight;
    }

    if (includePrice || includeStock) {
      const footerY = cardContentBottom + 18;
      doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
      doc.line(margin + padding, footerY - 12, pageW - margin - padding, footerY - 12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      if (includePrice) {
        doc.text(splitCatalogLines(doc,
          labels.price + ": " + (product.price || "—"), cardWidth * (includeStock ? 0.55 : 0.88), 1),
          margin + padding, footerY);
      }
      if (includeStock) {
        doc.text(labels.stock + ": " + (product.stock ?? 0),
          pageW - margin - padding, footerY, { align: "right" });
      }
    }
    cardY += cardHeight + gap;
    onProgress?.({
      phase: "rendering", completed: index + 1, total: layouts.length,
      percent: 58 + Math.round(((index + 1) / Math.max(1, layouts.length)) * 36),
    });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  dibujarPies(doc, title, margin);
  onProgress?.({ phase: "saving", completed: layouts.length, total: layouts.length, percent: 96 });
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  doc.save(filename);
  onProgress?.({ phase: "complete", completed: layouts.length, total: layouts.length, percent: 100 });
  return doc;
};

/**
 * Excel administrativo y visual del catálogo: miniaturas incrustadas, enlaces directos,
 * columnas con ancho legible, filtros, filas alternas y encabezado congelado.
 */
export const exportProductCatalogExcel = async ({
  title,
  subtitle,
  filename,
  products,
  includePrice,
  includeStock,
  labels,
  onProgress,
}: ProductCatalogExportOptions) => {
  onProgress?.({ phase: "preparing", completed: 0, total: products.length, percent: 3 });
  const imageDataUrls: (string | null)[] = [];
  // Limita la concurrencia para no abrir decenas de descargas de imágenes a la vez.
  for (let index = 0; index < products.length; index += 4) {
    const batch = await Promise.all(
      products.slice(index, index + 4).map((product) => loadCatalogImageData(product.imageUrl)),
    );
    imageDataUrls.push(...batch);
    onProgress?.({
      phase: "images",
      completed: imageDataUrls.length,
      total: products.length,
      percent: 8 + Math.round((imageDataUrls.length / Math.max(1, products.length)) * 58),
    });
  }

  // La exportación no debe depender de que el navegador pueda incrustar las imágenes.
  // Si falla el proxy/CORS, la hoja conserva el enlace directo de cada imagen en la primera columna.
  // Así el usuario recibe el Excel completo en vez de perder toda la exportación por un recurso opcional.

  const columns = [
    labels.image,
    labels.reference,
    labels.product,
    labels.brand,
    labels.category,
    labels.description,
    labels.features,
  ];
  if (includePrice) columns.push(labels.price);
  if (includeStock) columns.push(labels.stock);

  const featureTexts = products.map((product) =>
    product.features.length
      ? product.features.map((feature) => normalizeCatalogText(feature.label) + ": " + normalizeCatalogText(feature.value)).join("\n")
      : labels.noFeatures,
  );
  const rows = products.map((product, index) => {
    const row: (string | number)[] = [
      imageDataUrls[index] ? "" : product.imageUrl ? labels.openImage : labels.imageUnavailable,
      normalizeCatalogText(product.sku || "—"),
      normalizeCatalogText(product.name),
      normalizeCatalogText(product.brand || "—"),
      normalizeCatalogText(product.category || "—"),
      normalizeCatalogText(product.description || labels.noDescription),
      featureTexts[index],
    ];
    if (includePrice) row.push(product.price || "—");
    if (includeStock) row.push(product.stock ?? 0);
    return row;
  });

  const hyperlinkTargets = products.map((product) => {
    const targets: (string | undefined)[] = Array(columns.length).fill(undefined);
    targets[0] = product.imageUrl || undefined;
    return targets;
  });
  const rowHeights = products.map((_, index) => {
    const features = featureTexts[index] || labels.noFeatures;
    const featureLines = features.split("\n").reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(line.length / 52)), 0,
    );
    const descriptionLines = Math.ceil((products[index].description?.length ?? 0) / 46);
    return Math.min(220, Math.max(82, 18 + Math.max(featureLines, descriptionLines) * 12));
  });

  const columnWidths = [16, 17, 34, 17, 20, 44, 55];
  if (includePrice) columnWidths.push(15);
  if (includeStock) columnWidths.push(10);

  onProgress?.({ phase: "rendering", completed: products.length, total: products.length, percent: 75 });
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  onProgress?.({ phase: "saving", completed: products.length, total: products.length, percent: 92 });
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  exportExcel({
    filename,
    sheets: [
      {
        name: "Catálogo",
        title,
        subtitle,
        columns,
        rows,
        wrapColumns: [5, 6],
        hyperlinkTargets,
        columnWidths,
        imageColumn: 0,
        imageDataUrls,
        imageColumnWidth: 14,
        imageSizePx: 72,
        rowHeights,
        freezeRows: 4,
      },
    ],
  });
  onProgress?.({ phase: "complete", completed: products.length, total: products.length, percent: 100 });
};
