/**
 * Exportación PDF y Excel con identidad visual Nexora.
 * Paleta fija y apta para impresión: azul noche, turquesa y fondos cian muy suaves.
 * Se mantiene independiente del tema claro/oscuro del navegador para que los informes
 * conserven una apariencia consistente al compartirlos o imprimirlos.
 */

import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import XLSX from "xlsx-js-style";

import { formatDateTime } from "./format";

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
      const reasonLines = item.reason
        ? (doc.splitTextToSize(`"${item.reason}"`, width - 22) as string[])
        : [];
      const height = 34 + reasonLines.length * 11;
      if (y + height > bottom) newPage();

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(CARD_BORDER[0], CARD_BORDER[1], CARD_BORDER[2]);
      doc.roundedRect(margin, y, width, height, 4, 4, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(DARK[0], DARK[1], DARK[2]);
      doc.text(`${numero}. ${item.product}`, margin + 11, y + 16);

      const meta = [
        item.serial ? `${labels.serial}: ${item.serial}` : null,
        `${labels.received}: ${formatDateTime(item.receivedAt)}`,
        item.technician && labels.technician ? `${labels.technician}: ${item.technician}` : null,
        item.resolution || null,
        item.location || null,
      ].filter(Boolean) as string[];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(GREY[0], GREY[1], GREY[2]);
      doc.text(meta.join("  ·  "), margin + 11, y + 29);

      if (reasonLines.length > 0) {
        doc.setFont("helvetica", "italic");
        doc.text(reasonLines, margin + 11, y + 42);
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
    if (y + 30 > bottom) newPage();

    doc.setFillColor(GROUP_FILL[0], GROUP_FILL[1], GROUP_FILL[2]);
    doc.setDrawColor(GROUP_BORDER[0], GROUP_BORDER[1], GROUP_BORDER[2]);
    doc.roundedRect(margin, y, width, 24, 4, 4, "FD");
    doc.setFillColor(CYAN[0], CYAN[1], CYAN[2]);
    doc.roundedRect(margin, y, 5, 24, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text(pedido.code, margin + 14, y + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(GREY[0], GREY[1], GREY[2]);
    doc.text(
      [
        pedido.cliente,
        pedido.fecha,
        pedido.unidades !== undefined ? `${pedido.unidades} uds` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      pageW - margin - 10,
      y + 16,
      { align: "right" },
    );
    y += 32;

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
  XLSX.writeFile(wb, filename, { cellStyles: true });
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
}

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

    // Filas del título algo más altas; el resto se ajusta solo al contenido.
    ws["!rows"] = [{ hpt: 28 }, { hpt: 16 }, { hpt: 8 }, { hpt: 24 }];

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
        const rowData = sheet.rows[r - headerRow - 1];
        const linkValue = sheet.hyperlinkColumns?.includes(c) ? rowData?.[c] : undefined;
        const hyperlink = typeof linkValue === "string" && (linkValue.startsWith("https://") || linkValue.startsWith("http://"));
        cell.s = {
          font: {
            sz: 10,
            color: { rgb: hyperlink ? "0563C1" : TEXT_HEX },
            ...(hyperlink ? { underline: true } : {}),
          },
          ...(alterna ? { fill: { fgColor: { rgb: CYAN_PALE_HEX } } } : {}),
          alignment: {
            vertical: "center",
            horizontal: numericas[c] ? "center" : "left",
            wrapText: sheet.wrapColumns?.includes(c) ?? false,
          },
          border: { bottom: { style: "thin", color: { rgb: BORDER_HEX } } },
        };
        if (hyperlink) {
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

  XLSX.writeFile(wb, filename, { cellStyles: true });
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
  product: string;
  reference: string;
  brand: string;
  category: string;
  description: string;
  features: string;
  price: string;
  stock: string;
  imageUrl: string;
  noDescription: string;
  noFeatures: string;
  imageUnavailable: string;
  moreFeatures: (count: number) => string;
}

export interface ProductCatalogExportOptions {
  title: string;
  subtitle: string;
  filename: string;
  products: ProductCatalogItem[];
  includePrice: boolean;
  includeStock: boolean;
  labels: ProductCatalogLabels;
}

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
 * Descarga una imagen pública y la convierte a JPEG cuadrado para incrustarla en el PDF.
 * Si la URL falla o el navegador bloquea el canvas por CORS, el catálogo sigue generándose.
 */
const loadCatalogImageData = (url?: string): Promise<string | null> =>
  new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext("2d");
        if (!context || !image.naturalWidth || !image.naturalHeight) {
          resolve(null);
          return;
        }

        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.drawImage(
          image,
          (canvas.width - width) / 2,
          (canvas.height - height) / 2,
          width,
          height,
        );
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });

/**
 * Catálogo PDF Nexora: dos fichas por página, fotografía original y datos técnicos
 * registrados. Las referencias sin descripción o características se identifican
 * explícitamente; no se inventan especificaciones.
 */
export const exportProductCatalogPdf = async ({
  title,
  subtitle,
  filename,
  products,
  includePrice,
  includeStock,
  labels,
}: ProductCatalogExportOptions) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const cardWidth = pageW - margin * 2;
  const gap = 12;
  const cardHeight = (pageH - CONTENT_TOP - FOOTER_SPACE - gap) / 2;
  const imageBoxSize = 148;
  const imageSize = 136;
  const imageX = margin + 12;
  const textX = margin + 174;
  const textWidth = cardWidth - (textX - margin) - 12;
  const drawHeader = () => dibujarEncabezado(doc, title, subtitle, margin);

  drawHeader();

  for (let index = 0; index < products.length; index += 1) {
    if (index > 0 && index % 2 === 0) {
      doc.addPage();
      drawHeader();
    }

    const product = products[index];
    const rowOnPage = index % 2;
    const cardY = CONTENT_TOP + rowOnPage * (cardHeight + gap);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.7);
    doc.roundedRect(margin, cardY, cardWidth, cardHeight, 7, 7, "FD");

    const imageY = cardY + 14;
    doc.setFillColor(CYAN_PALE[0], CYAN_PALE[1], CYAN_PALE[2]);
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.roundedRect(imageX, imageY, imageBoxSize, imageBoxSize, 5, 5, "FD");

    const imageData = await loadCatalogImageData(product.imageUrl);
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
      doc.setFontSize(8);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(
        splitCatalogLines(doc, labels.imageUnavailable, imageBoxSize - 16, 2),
        imageX + imageBoxSize / 2,
        imageY + imageBoxSize / 2,
        { align: "center" },
      );
    }

    let cursorY = cardY + 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    const nameLines = splitCatalogLines(doc, product.name, textWidth, 2);
    doc.text(nameLines, textX, cursorY);
    cursorY += nameLines.length * 14 + 4;

    const metadata = [
      `${labels.reference}: ${product.sku || "—"}`,
      product.brand ? `${labels.brand}: ${product.brand}` : null,
      product.category ? `${labels.category}: ${product.category}` : null,
    ].filter(Boolean).join(" · ");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    const metadataLines = splitCatalogLines(doc, metadata, textWidth, 2);
    doc.text(metadataLines, textX, cursorY);
    cursorY += metadataLines.length * 10 + 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(CYAN_DARK[0], CYAN_DARK[1], CYAN_DARK[2]);
    doc.text(labels.description, textX, cursorY);
    cursorY += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
    const description = product.description?.trim() || labels.noDescription;
    const descriptionLines = splitCatalogLines(doc, description, textWidth, 3);
    doc.text(descriptionLines, textX, cursorY);
    cursorY += descriptionLines.length * 9.5 + 5;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(CYAN_DARK[0], CYAN_DARK[1], CYAN_DARK[2]);
    doc.text(labels.features, textX, cursorY);
    cursorY += 10;

    const footerReserve = includePrice || includeStock ? 25 : 12;
    const featureBottom = cardY + cardHeight - footerReserve;
    const features = product.features ?? [];
    if (features.length === 0) {
      if (cursorY + 9 <= featureBottom) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.text(splitCatalogLines(doc, labels.noFeatures, textWidth, 2), textX, cursorY);
      }
    } else {
      let omitted = 0;
      for (let featureIndex = 0; featureIndex < features.length; featureIndex += 1) {
        const feature = features[featureIndex];
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
        const featureLines = splitCatalogLines(
          doc,
          `• ${feature.label}: ${feature.value}`,
          textWidth,
          2,
        );
        const featureHeight = featureLines.length * 9 + 1;
        if (cursorY + featureHeight > featureBottom) {
          omitted = features.length - featureIndex;
          break;
        }
        doc.text(featureLines, textX, cursorY);
        cursorY += featureHeight;
      }

      if (omitted > 0 && cursorY + 9 <= featureBottom) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.text(labels.moreFeatures(omitted), textX, cursorY);
      }
    }

    if (includePrice || includeStock) {
      const footerY = cardY + cardHeight - 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      if (includePrice) {
        doc.text(`${labels.price}: ${product.price || "—"}`, textX, footerY);
      }
      if (includeStock) {
        doc.text(
          `${labels.stock}: ${product.stock ?? 0}`,
          textX + textWidth,
          footerY,
          { align: "right" },
        );
      }
    }
  }

  dibujarPies(doc, title, margin);
  doc.save(filename);
};

/**
 * Excel administrativo del catálogo. Incluye una columna con la URL pública de cada imagen;
 * el PDF es el formato que incrusta las fotografías dentro del documento.
 */
export const exportProductCatalogExcel = ({
  title,
  subtitle,
  filename,
  products,
  includePrice,
  includeStock,
  labels,
}: ProductCatalogExportOptions) => {
  const columns = [
    labels.reference,
    labels.product,
    labels.brand,
    labels.category,
    labels.description,
    labels.features,
    labels.imageUrl,
  ];
  if (includePrice) columns.push(labels.price);
  if (includeStock) columns.push(labels.stock);

  const rows = products.map((product) => {
    const row: (string | number)[] = [
      product.sku || "—",
      product.name,
      product.brand || "—",
      product.category || "—",
      product.description?.trim() || labels.noDescription,
      product.features.length
        ? product.features.map((feature) => `${feature.label}: ${feature.value}`).join(" · ")
        : labels.noFeatures,
      product.imageUrl || "—",
    ];
    if (includePrice) row.push(product.price || "—");
    if (includeStock) row.push(product.stock ?? 0);
    return row;
  });

  exportExcel({
    filename,
    sheets: [
      {
        name: "Catálogo",
        title,
        subtitle,
        columns,
        rows,
        wrapColumns: [4, 5, 6],
        hyperlinkColumns: [6],
      },
    ],
  });
};
