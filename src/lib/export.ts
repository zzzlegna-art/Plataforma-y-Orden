/**
 * Exportación a PDF (jsPDF + autotable) y Excel (SheetJS) con el estilo
 * Bodega 6A: encabezado naranja, tabla con filas alternas crema y datos
 * legibles en ambos formatos.
 */

import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import XLSX from "xlsx-js-style";

import { formatDateTime } from "./format";

const ORANGE: [number, number, number] = [216, 108, 15];
const CREAM: [number, number, number] = [253, 250, 240];
const ORANGE_TEXT = "D86C0F";
const CREAM_FILL = "F3E8D6";
const DARK_TEXT = "2B2215";

// --- Piezas comunes de los PDF: encabezado con franja, pie con número de página ---
const ORANGE_DARK: [number, number, number] = [176, 84, 8];
const HEADER_H = 60;
/** Espacio reservado abajo para el pie de página. */
const FOOTER_SPACE = 40;
/** Donde empieza el contenido en cada página, justo debajo del encabezado. */
const CONTENT_TOP = HEADER_H + 18;

/** Encabezado naranja con franja oscura, título grande y subtítulo claro. */
const dibujarEncabezado = (doc: jsPDF, title: string, subtitle: string, margin = 24) => {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2]);
  doc.rect(0, 0, pageW, HEADER_H, "F");
  doc.setFillColor(ORANGE_DARK[0], ORANGE_DARK[1], ORANGE_DARK[2]);
  doc.rect(0, HEADER_H, pageW, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  const titulo = (doc.splitTextToSize(title, pageW - margin * 2) as string[])[0] ?? title;
  doc.text(titulo, margin, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(255, 236, 214);
  doc.text(subtitle, margin, 46);
};

/** Pie de cada página: línea fina, título del reporte y "Página X de Y". */
const dibujarPies = (doc: jsPDF, title: string, margin = 24) => {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  const izquierda = (doc.splitTextToSize(title, pageW / 2) as string[])[0] ?? title;
  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina);
    doc.setDrawColor(231, 214, 191);
    doc.setLineWidth(0.6);
    doc.line(margin, pageH - 30, pageW - margin, pageH - 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 128, 112);
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
  /** Columnas cuyo texto se pinta en naranja y negrita (p. ej. el código). */
  highlightColumns?: number[];
}

/** Genera y descarga un PDF con encabezado naranja y tabla. */
export const exportPdf = ({
  title,
  subtitle,
  head,
  body,
  filename,
  highlightColumns = [],
}: PdfExportOptions) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
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
      textColor: [43, 34, 21],
      lineColor: [238, 230, 215],
      lineWidth: 0.4,
      valign: "middle",
    },
    headStyles: {
      fillColor: ORANGE,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: CREAM },
    columnStyles,
    // El encabezado se repite en cada página, no solo en la primera.
    didDrawPage: () => dibujarEncabezado(doc, title, subtitle, margin),
    didParseCell: (data) => {
      if (data.section === "head" && numericas[data.column.index]) {
        data.cell.styles.halign = "center";
      }
      if (data.section === "body" && highlightColumns.includes(data.column.index)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = [201, 90, 20];
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

const GREY: [number, number, number] = [110, 100, 88];
const CARD_BORDER: [number, number, number] = [223, 219, 212];
const GROUP_FILL: [number, number, number] = [250, 240, 229];
const GROUP_BORDER: [number, number, number] = [231, 214, 191];
const DARK: [number, number, number] = [43, 34, 21];

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
    doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2]);
    doc.roundedRect(margin, y, 5, 26, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(170, 96, 22);
    doc.text(group.title, margin + 14, y + 17);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(150, 118, 88);
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

    doc.setFillColor(250, 240, 229);
    doc.setDrawColor(231, 214, 191);
    doc.roundedRect(margin, y, width, 24, 4, 4, "FD");
    doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2]);
    doc.roundedRect(margin, y, 5, 24, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(170, 96, 22);
    doc.text(pedido.code, margin + 14, y + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(130, 104, 78);
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
      doc.setDrawColor(223, 219, 212);
      doc.roundedRect(margin, y, width, alto, 4, 4, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(43, 34, 21);
      doc.text(tituloLineas, margin + 11, y + 15);

      const colW = (width - 22) / COLUMNAS;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(90, 82, 70);
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

const HIST_CLIENTE_FILL = "FAF0E5";
const HIST_CLIENTE_BORDER = "E7D6BF";
const HIST_CLIENTE_TEXT = "AA6016";

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

  const titleCell = ws[address(0, 0)];
  if (titleCell) {
    titleCell.s = {
      font: { bold: true, sz: 16, color: { rgb: ORANGE_TEXT } },
      alignment: { vertical: "center" },
    };
  }
  const subCell = ws[address(1, 0)];
  if (subCell) subCell.s = { font: { sz: 9, italic: true, color: { rgb: "8C8070" } } };

  clienteRows.forEach((r) => {
    for (let c = 0; c < ncols; c += 1) {
      const style = {
        font: { bold: true, sz: 11, color: { rgb: HIST_CLIENTE_TEXT } },
        fill: { fgColor: { rgb: HIST_CLIENTE_FILL } },
        border: {
          top: { style: "medium", color: { rgb: ORANGE_TEXT } },
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
          font: { bold: true, sz: 9.5, color: { rgb: "4A3F30" } },
          fill: { fgColor: { rgb: CREAM_FILL } },
          alignment: { vertical: "center", horizontal: c === 1 ? "center" : "left" },
          border: { bottom: { style: "thin", color: { rgb: "D9CDB6" } } },
        };
      }
    }
  });

  // Filas de total: negrita, fondo crema y la cifra centrada bajo "Cantidad".
  totalRows.forEach((r, indice) => {
    const esGeneral = pedidos.length > 1 && indice === totalRows.length - 1;
    for (let c = 0; c < ncols; c += 1) {
      const style = {
        font: { bold: true, sz: esGeneral ? 11 : 10, color: { rgb: esGeneral ? "FFFFFF" : HIST_CLIENTE_TEXT } },
        fill: { fgColor: { rgb: esGeneral ? ORANGE_TEXT : CREAM_FILL } },
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
        font: { sz: 9.5, color: { rgb: DARK_TEXT } },
        alignment: {
          vertical: "center",
          horizontal: c === 1 ? "center" : "left",
          wrapText: c === 2,
        },
        border: { bottom: { style: "thin", color: { rgb: "EEE6D7" } } },
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

    const titleCell = ws[address(0, 0)];
    if (titleCell) {
      titleCell.s = {
        font: { bold: true, sz: 16, color: { rgb: ORANGE_TEXT } },
        alignment: { vertical: "center" },
      };
    }
    const subCell = ws[address(1, 0)];
    if (subCell) subCell.s = { font: { sz: 9, italic: true, color: { rgb: "8C8070" } } };

    // Encabezado de la tabla: fondo naranja con texto blanco.
    for (let c = 0; c < ncols; c += 1) {
      const cell = ws[address(headerRow, c)];
      if (cell) {
        cell.s = {
          font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: ORANGE_TEXT } },
          alignment: {
            vertical: "center",
            horizontal: c === 0 || numericas[c] ? "center" : "left",
          },
          border: { bottom: { style: "medium", color: { rgb: "B05408" } } },
        };
      }
    }

    // Filas alternas en crema para leer mejor de lado a lado.
    for (let r = headerRow + 1; r < rows.length; r += 1) {
      if (rows[r].length === 0) continue;
      const alterna = (r - headerRow) % 2 === 0;
      for (let c = 0; c < ncols; c += 1) {
        const cell = ws[address(r, c)];
        if (!cell) continue;
        cell.s = {
          font: { sz: 10, color: { rgb: DARK_TEXT } },
          ...(alterna ? { fill: { fgColor: { rgb: "FDFAF0" } } } : {}),
          alignment: {
            vertical: "center",
            horizontal: c === 0 || numericas[c] ? "center" : "left",
            wrapText: sheet.wrapColumns?.includes(c) ?? false,
          },
          border: { bottom: { style: "thin", color: { rgb: "EEE6D7" } } },
        };
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
