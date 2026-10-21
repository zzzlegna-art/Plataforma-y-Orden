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

// --- Piezas comunes de los PDF: encabezado Nexora y pie con número de página ---
const HEADER_H = 60;
/** Espacio reservado abajo para el pie de página. */
const FOOTER_SPACE = 40;
/** Donde empieza el contenido en cada página, justo debajo del encabezado. */
const CONTENT_TOP = HEADER_H + 18;

/** Encabezado Nexora: azul noche, acentos turquesa y texto de alto contraste. */
const dibujarEncabezado = (doc: jsPDF, title: string, subtitle: string, margin = 24) => {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(0, 0, pageW, HEADER_H, "F");
  doc.setFillColor(CYAN[0], CYAN[1], CYAN[2]);
  doc.rect(0, 0, pageW, 4, "F");
  doc.rect(0, HEADER_H - 2, pageW, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  const titulo = (doc.splitTextToSize(title, pageW - margin * 2) as string[])[0] ?? title;
  doc.text(titulo, margin, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(239, 250, 252);
  const subtitulo = doc.splitTextToSize(subtitle, pageW - margin * 2) as string[];
  doc.text(subtitulo.slice(0, 2), margin, 46);
};

/** Pie de cada página: línea fina, título del reporte y "Página X de Y". */
const dibujarPies = (doc: jsPDF, title: string, margin = 24) => {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  const izquierda = (doc.splitTextToSize(title, pageW / 2) as string[])[0] ?? title;
  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina);
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.6);
    doc.line(margin, pageH - 30, pageW - margin, pageH - 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(izquierda, margin, pageH - 17);
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

/**
 * Recupera palabras cuyas letras llegaron separadas por espacios en las especificaciones.
 * La reconstrucción usa un vocabulario de términos habituales de electrónica en español e
 * inglés para conservar los límites entre palabras (p. ej. "Apple Pencil" y "solo en la versión").
 */
const CATALOG_SPACED_WORDS = [
  "almacenamiento", "adaptador", "angular", "Apple", "Bluetooth", "batería", "cámara",
  "cámaras", "capacidad", "Cellular", "celular", "compatibilidad", "compatible", "cambiar",
  "conectividad", "conector", "conexión", "conexiones", "con", "CPU", "devolución",
  "de", "del", "desde", "diseño", "Dual", "eSIM", "en", "Engine", "estéreo", "frontal", "frecuencia",
  "G", "generación", "GPU", "grabación", "gran", "hasta", "inalámbrica", "inalámbrico", "LTE",
  "incluye", "iPad", "iPhone", "la", "las", "Lightning", "los", "más", "memoria",
  "micrófono", "menos", "MP", "nano", "NFC", "Neural", "no", "núcleos", "o", "operativo", "puede", "RAM", "regional", "ROM", "SIM",
  "pantalla", "para", "Pencil", "por", "procesador", "puerto", "rápida", "red",
  "resistencia", "resolución", "sensor", "sin", "sistema", "solo", "soporta", "su",
  "sus", "trasera", "ultra", "USB", "variante", "versión", "video", "Wi-Fi", "y", "a",
].map((word) => ({
  word,
  key: word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, ""),
})).sort((a, b) => b.key.length - a.key.length);

const CATALOG_SPACED_PHRASES: Record<string, string> = {
  applepencil: "Apple Pencil",
  usbc: "USB-C",
  wifi: "Wi-Fi",
  wifipluscellular: "Wi-Fi + Cellular",
};

const splitSpacedCatalogLetters = (value: string): string => {
  const compact = value.replace(/\s+/g, "");
  const key = compact.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return value;
  if (CATALOG_SPACED_PHRASES[key]) return CATALOG_SPACED_PHRASES[key];

  const memo = new Map<number, string[] | null>();
  const segment = (index: number): string[] | null => {
    if (index === key.length) return [];
    if (memo.has(index)) return memo.get(index) ?? null;

    for (const candidate of CATALOG_SPACED_WORDS) {
      if (!key.startsWith(candidate.key, index)) continue;
      const rest = segment(index + candidate.key.length);
      if (rest) {
        const result = [candidate.word, ...rest];
        memo.set(index, result);
        return result;
      }
    }

    memo.set(index, null);
    return null;
  };

  const words = segment(0);
  if (words) {
    const result = words.join(" ");
    return compact[0] && compact[0] === compact[0].toLocaleUpperCase() && compact[0] !== compact[0].toLocaleLowerCase()
      ? result[0].toLocaleUpperCase() + result.slice(1)
      : result;
  }

  // Último recurso: elimina el espaciado artificial sin alterar el resto del contenido.
  return compact.replace(/([a-záéíóúüñ])([A-ZÁÉÍÓÚÜÑ])/g, "$1 $2");
};

export const normalizeCatalogText = (value: string): string =>
  value
    .replace(/(^|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9])((?:[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]\s+){2,}[A-Za-zÁÉÍÓÚÜÑáéíóúüñ])(?=$|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9])/g, (_match, prefix: string, spaced: string) => prefix + splitSpacedCatalogLetters(spaced))
    .replace(/\b(\d+)\s+a(?=\s+generaci[oó]n\b)/gi, "$1a")
    .replace(/(\d)\s*\.\s*(?=\d)/g, "$1.")
    .replace(/(\d)\s+([A-Z])\b/g, "$1$2")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+([,;:])/g, "$1")
    .replace(/([,;:])(?=\S)/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

/** Ajusta texto al ancho y limita las líneas, conservando una elipsis legible. */
const splitCatalogLines = (doc: jsPDF, text: string, width: number, maxLines: number): string[] => {
  const lines = doc.splitTextToSize(text, width) as string[];
  if (lines.length <= maxLines) return lines;

  const visible = lines.slice(0, maxLines);
  const lastIndex = visible.length - 1;
  let last = visible[lastIndex] ?? "";
  while (last.length > 0 && doc.getTextWidth(`${last}…`) > width) {
    last = last.slice(0, -1);
  }
  visible[lastIndex] = `${last}…`;
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
export const exportProductCatalogPdf = async ({
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
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const cardWidth = pageW - margin * 2;
  const gap = 9;
  const imageBoxSize = 76;
  const imageSize = 68;
  const imageX = margin + 10;
  const imageYInset = 11;
  const textX = imageX + imageBoxSize + 13;
  const textWidth = cardWidth - (textX - margin) - 12;
  const bottom = pageH - FOOTER_SPACE;
  const drawHeader = () => dibujarEncabezado(doc, title, subtitle, margin);

  // Calculamos la altura según el contenido real de cada referencia. Así los productos
  // sencillos ocupan menos espacio y los que tienen más características siguen siendo legibles.
  const layouts = products.map((product) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.2);
    const nameLines = splitCatalogLines(doc, normalizeCatalogText(product.name), textWidth, 2);

    const metadata = [
      `${labels.reference}: ${normalizeCatalogText(product.sku || "—")}`,
      product.brand ? `${labels.brand}: ${normalizeCatalogText(product.brand)}` : null,
      product.category ? `${labels.category}: ${normalizeCatalogText(product.category)}` : null,
    ].filter(Boolean).join(" · ");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    const metadataLines = splitCatalogLines(doc, metadata, textWidth, 2);

    const allFeatures = product.features ?? [];
    const visibleFeatures = allFeatures.slice(0, 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    const featureLines = visibleFeatures.map((feature) =>
      splitCatalogLines(doc, `• ${normalizeCatalogText(feature.label)}: ${normalizeCatalogText(feature.value)}`, textWidth, 2),
    );
    const noFeaturesLines = splitCatalogLines(doc, labels.noFeatures, textWidth, 2);
    const omittedFeatures = Math.max(0, allFeatures.length - visibleFeatures.length);

    const textHeight =
      nameLines.length * 12.5 + 3 +
      metadataLines.length * 8.5 + 4 +
      7 +
      (visibleFeatures.length > 0
        ? featureLines.reduce((sum, lines) => sum + lines.length * 8.2 + 1, 0)
        : noFeaturesLines.length * 8.2) +
      (omittedFeatures > 0 ? 8.2 : 0) +
      (includePrice || includeStock ? 11 : 0);
    const cardHeight = Math.max(imageBoxSize + 22, 15 + textHeight + 10);

    return {
      product,
      cardHeight,
      nameLines,
      metadataLines,
      visibleFeatures,
      featureLines,
      noFeaturesLines,
      omittedFeatures,
    };
  });

  onProgress?.({ phase: "images", completed: 0, total: products.length, percent: 8 });
  const imageDataUrls: (string | null)[] = [];
  // Descargamos imágenes en lotes pequeños y concurrentes: evita esperar una por una
  // y permite mostrar progreso real durante la fase que suele tardar más.
  for (let index = 0; index < products.length; index += 4) {
    const batch = await Promise.all(
      products.slice(index, index + 4).map((product) => loadCatalogImageData(product.imageUrl)),
    );
    imageDataUrls.push(...batch);
    onProgress?.({
      phase: "images",
      completed: imageDataUrls.length,
      total: products.length,
      percent: 8 + Math.round((imageDataUrls.length / Math.max(1, products.length)) * 48),
    });
  }

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
      product,
      cardHeight,
      nameLines,
      metadataLines,
      visibleFeatures,
      featureLines,
      noFeaturesLines,
      omittedFeatures,
    } = layout;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.7);
    doc.roundedRect(margin, cardY, cardWidth, cardHeight, 6, 6, "FD");

    const imageY = cardY + imageYInset;
    doc.setFillColor(CYAN_PALE[0], CYAN_PALE[1], CYAN_PALE[2]);
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.roundedRect(imageX, imageY, imageBoxSize, imageBoxSize, 5, 5, "FD");

    const imageData = imageDataUrls[index] ?? null;
    if (imageData) {
      doc.addImage(
        imageData,
        "JPEG",
        imageX + (imageBoxSize - imageSize) / 2,
        imageY + (imageBoxSize - imageSize) / 2,
        imageSize,
        imageSize,
      );
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(
        splitCatalogLines(doc, labels.imageUnavailable, imageBoxSize - 14, 2),
        imageX + imageBoxSize / 2,
        imageY + imageBoxSize / 2,
        { align: "center" },
      );
    }

    let cursorY = cardY + 15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.2);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text(nameLines, textX, cursorY);
    cursorY += nameLines.length * 12.5 + 3;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(metadataLines, textX, cursorY);
    cursorY += metadataLines.length * 8.5 + 2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(CYAN_DARK[0], CYAN_DARK[1], CYAN_DARK[2]);
    doc.text(labels.features, textX, cursorY);
    cursorY += 9.2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.1);
    doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
    if (visibleFeatures.length === 0) {
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(noFeaturesLines, textX, cursorY);
      cursorY += noFeaturesLines.length * 8.2;
    } else {
      visibleFeatures.forEach((feature, index) => {
        const lines = featureLines[index] ?? [];
        doc.text(lines, textX, cursorY);
        cursorY += lines.length * 7.8 + 0.5;
      });
    }

    if (omittedFeatures > 0) {
      doc.setFont("helvetica", "italic");
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(labels.moreFeatures(omittedFeatures), textX, cursorY);
      cursorY += 8.2;
    }

    if (includePrice || includeStock) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      if (includePrice) {
        doc.text(`${labels.price}: ${product.price || "—"}`, textX, cursorY);
      }
      if (includeStock) {
        doc.text(
          `${labels.stock}: ${product.stock ?? 0}`,
          textX + textWidth,
          cursorY,
          { align: "right" },
        );
      }
    }

    cardY += cardHeight + gap;
    onProgress?.({
      phase: "rendering",
      completed: index + 1,
      total: layouts.length,
      percent: 58 + Math.round(((index + 1) / Math.max(1, layouts.length)) * 36),
    });
    // Cede el hilo entre fichas para que el navegador pueda pintar el avance.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  dibujarPies(doc, title, margin);
  onProgress?.({ phase: "saving", completed: layouts.length, total: layouts.length, percent: 96 });
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  doc.save(filename);
  onProgress?.({ phase: "complete", completed: layouts.length, total: layouts.length, percent: 100 });
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

  const requestedImageCount = products.filter((product) => Boolean(product.imageUrl)).length;
  const embeddedImageCount = imageDataUrls.filter(Boolean).length;
  if (requestedImageCount > 0 && embeddedImageCount === 0) {
    throw new Error("CATALOG_IMAGES_UNAVAILABLE");
  }

  const columns = [
    labels.image,
    labels.reference,
    labels.product,
    labels.brand,
    labels.category,
    labels.features,
  ];
  if (includePrice) columns.push(labels.price);
  if (includeStock) columns.push(labels.stock);

  const featureTexts = products.map((product) =>
    product.features.length
      ? product.features.map((feature) => normalizeCatalogText(feature.label) + ": " + normalizeCatalogText(feature.value)).join(" · ")
      : labels.noFeatures,
  );
  const rows = products.map((product, index) => {
    const row: (string | number)[] = [
      imageDataUrls[index] ? "" : product.imageUrl ? labels.openImage : labels.imageUnavailable,
      normalizeCatalogText(product.sku || "—"),
      normalizeCatalogText(product.name),
      normalizeCatalogText(product.brand || "—"),
      normalizeCatalogText(product.category || "—"),
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
    const featureLines = Math.max(1, Math.ceil(features.length / 48));
    const extraRows = includePrice || includeStock ? 1 : 0;
    return Math.min(160, Math.max(62, 14 + (featureLines + extraRows) * 11));
  });

  const columnWidths = [16, 15, 28, 16, 18, 42];
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
        wrapColumns: [5],
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
