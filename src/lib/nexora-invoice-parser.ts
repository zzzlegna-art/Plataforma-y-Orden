/**
 * Lectura asistida de facturas: propuestas conservadoras que siempre requieren
 * validación humana. No aprueba costos ni crea movimientos de inventario.
 */
export interface InvoiceLineSuggestion {
  description: string; quantity: number; unitCost: number | null; total: number | null;
  productId: string | null; sku: string | null; warning?: string;
}
export interface InvoiceSuggestion {
  supplierName: string; invoiceNo: string; invoiceDate: string; currency: "COP" | "USD" | "EUR" | "OTRA";
  lines: InvoiceLineSuggestion[]; warnings: string[]; rawText: string;
}
export interface CatalogMatch { id: string; sku: string; name: string }
const normalized = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");

/** Admite decimales CO/EU/US, puntos o comas de miles y símbolos monetarios. */
export const readMoney = (input: string): number | null => {
  let value = input.replace(/[^\d.,-]/g, "").trim();
  if (!value || !/\d/.test(value) || value.startsWith("-")) return null;
  const comma = value.lastIndexOf(","), dot = value.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    value = value.replaceAll(thousands, "").replace(decimal, ".");
  } else {
    const separatorAt = Math.max(comma, dot);
    if (separatorAt >= 0) {
      const separator = value[separatorAt];
      const trailingDigits = value.length - separatorAt - 1;
      value = trailingDigits === 3 || value.split(separator).length > 2
        ? value.replaceAll(separator, "") : value.replace(separator, ".");
    }
  }
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount < 1e12 ? amount : null;
};
const dateFromParts = (year: number, month: number, day: number): string => {
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const test = new Date(Date.UTC(year, month - 1, day));
  return test.getUTCFullYear() === year && test.getUTCMonth() === month - 1 && test.getUTCDate() === day
    ? year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0") : "";
};
const months: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10,
  NOVIEMBRE: 11, DICIEMBRE: 12,
};
const dateValue = (text: string): string => {
  const iso = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  if (iso) return dateFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const local = /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/.exec(text);
  if (local) return dateFromParts(Number(local[3]), Number(local[2]), Number(local[1]));
  const written = /\b(\d{1,2})\s+(?:DE\s+)?([A-ZÁÉÍÓÚ]+)\s+(?:DE\s+)?(20\d{2})\b/i.exec(text);
  if (written) {
    const month = months[normalized(written[2])];
    if (month) return dateFromParts(Number(written[3]), month, Number(written[1]));
  }
  return "";
};

const invoiceCode = /(?:[A-Z]{1,8}[\s-]?)?\d{3,14}(?:-\d{1,8})?/i;
const readInvoiceNumber = (rows: readonly string[]): string => {
  const head = rows.slice(0, 30);
  for (const line of head) {
    if (!/\b(?:FACTURA|INVOICE|N[ÚU]MERO|NRO|FOLIO)\b|(?:N[°º#]|NO\.?)[\s:#]/i.test(line)) continue;
    if (/^(?:NIT|CUFE|CUDE|DIRECCI|TEL[ÉE]FONO|CLIENTE)\b/i.test(line)) continue;
    const labeled = /(?:FACTURA(?:\s+ELECTR[OÓ]NICA)?(?:\s+DE\s+VENTA)?|INVOICE)\s*(?:N[UÚ]MERO|NUMBER|NO\.?|N[°º#.]?|#|:)?\s*[:#.-]?\s*/i.exec(line);
    const numbered = /(?:N[UÚ]MERO|NRO|FOLIO|NO\.?|N[°º#]|NUMBER)\s*[:#.-]?\s*/i.exec(line);
    const start = labeled ? labeled.index + labeled[0].length : numbered ? numbered.index + numbered[0].length : -1;
    if (start < 0) continue;
    const tail = line.slice(start).replace(/^(?:DE\s+VENTA|ELECTR[OÓ]NICA|N[UÚ]MERO|NO\.?|N[°º#]|NUMBER)\s*[:#.-]?\s*/i, "");
    const candidate = invoiceCode.exec(tail)?.[0]?.trim().replace(/\s+(?=\d)/g, "-") ?? "";
    if (candidate && !/^(?:CUFE|CUDE|NIT|IVA)$/i.test(candidate)) return candidate.toUpperCase();
  }
  const fallback = head.join(" ").match(/\b(?:FE|FV|INV|FAC|F)\s*-\s*\d{3,14}(?:-\d{1,8})?\b/i);
  return fallback ? fallback[0].replace(/\s+/g, "").toUpperCase() : "";
};
const readSupplier = (rows: readonly string[]): string => {
  const found = rows.slice(0, 35).find(line =>
    /^(?:PROVEEDOR|EMISOR|VENDEDOR|VENDOR|SUPPLIER|RAZ[ÓO]N SOCIAL(?:\s+DEL\s+EMISOR)?)\s*[:–-]/i.test(line));
  if (found) return found.replace(
    /^(?:PROVEEDOR|EMISOR|VENDEDOR|VENDOR|SUPPLIER|RAZ[ÓO]N SOCIAL(?:\s+DEL\s+EMISOR)?)\s*[:–-]\s*/i, "").trim();
  return rows.slice(0, 6).find(line =>
    /[A-Za-zÁÉÍÓÚÑ]/.test(line)
    && !/^(?:FACTURA|INVOICE|NIT|CUFE|CUDE|FECHA|DATE|CLIENTE|COMPRADOR|N[°º]|TEL|DIRECCI|TOTAL|ITEM)/i.test(line)
    && !/^\d/.test(line)) ?? "";
};
const isHeaderOrSummary = (row: string) =>
  /^(?:TOTAL(?:\s+A\s+PAGAR)?|SUBTOTAL|IVA|IMPUESTOS?|DESCUENTOS?|NIT|CUFE|CUDE|FACTURA|INVOICE|FECHA|DATE|TEL[ÉE]FONO|DIRECCI[OÓ]N|C[ÓO]DIGO|DESCRIPCI[OÓ]N|CANTIDAD|DETALLE|ITEM|ART[ÍI]CULO)\b/i.test(row);

/** Formatos: cantidad primero; descripción primero; Nº de fila + cantidad; pipes y tabulaciones. */
const readItemRow = (source: string): {
  description: string; quantity: number; cost: number | null; total: number | null;
} | null => {
  const row = source.replace(/[\t|;]+/g, " ").replace(/\s+/g, " ").trim();
  if (isHeaderOrSummary(row)) return null;
  const trailing = /\s+([$€£]?\s*\d[\d.,]*)\s+([$€£]?\s*\d[\d.,]*)\s*$/.exec(row);
  if (!trailing) return null;
  const prefix = row.slice(0, trailing.index).trim();
  if (!prefix || !/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(prefix)) return null;
  const patterns = [
    /^\d{1,3}\s+(\d{1,4})\s+(?:UNID(?:ADES?)?\.?|UND\.?|UN\.?|PCS\.?|EA\.?|X\s+)?(.{3,140})$/i,
    /^(\d{1,4})\s+(?:UNID(?:ADES?)?\.?|UND\.?|UN\.?|PCS\.?|EA\.?|X\s+)?(.{3,140})$/i,
    /^(.{3,140}?)\s+(\d{1,4})(?:\s*(?:UND\.?|UN\.?|PCS\.?|EA\.?))?$/i,
  ];
  let quantity = 0, description = "";
  for (const [index, pattern] of patterns.entries()) {
    const matched = pattern.exec(prefix);
    if (!matched) continue;
    quantity = Number(index === 2 ? matched[2] : matched[1]);
    description = (index === 2 ? matched[1] : matched[2]).trim();
    if (Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 10000
      && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(description)) break;
    quantity = 0;
  }
  if (!quantity || !description) return null;
  return { description, quantity, cost: readMoney(trailing[1]), total: readMoney(trailing[2]) };
};

export const parseInvoiceText = (input: string, products: readonly CatalogMatch[]): InvoiceSuggestion => {
  const rawText = input.slice(0, 35000);
  const rows = rawText.split(/\r?\n/).map(s => s.replace(/[ \u00a0]+/g, " ").trim()).filter(Boolean);
  const head = rows.slice(0, 30);
  const number = readInvoiceNumber(head);
  const invoiceDate = dateValue(
    head.filter(row => /\b(?:FECHA|DATE|EMISI[OÓ]N|ISSUED)\b/i.test(row)).join(" ")
  ) || dateValue(head.join(" "));
  const currency = /\bUSD\b|D[OÓ]LARES|US\$/i.test(rawText) ? "USD"
    : /\bEUR\b|EUROS|€/i.test(rawText) ? "EUR" : "COP";
  const supplierName = readSupplier(rows);
  const lines: InvoiceLineSuggestion[] = [], warnings: string[] = [];
  for (const row of rows) {
    if (lines.length >= 250) break;
    const item = readItemRow(row);
    if (!item) continue;
    const { description, quantity, cost, total } = item;
    const key = normalized(description);
    const hits = products.filter(product => {
      const sku = normalized(product.sku);
      return normalized(product.name) === key || Boolean(sku && (" " + key + " ").includes(" " + sku + " "));
    }).slice(0, 2);
    const match = hits.length === 1 ? hits[0] : null;
    const problems: string[] = [];
    if (!match) problems.push(hits.length > 1 ? "Coincidencia ambigua" : "Referencia sin coincidencia exacta");
    if (cost === null) problems.push("Costo ilegible");
    if (total === null) problems.push("Subtotal ilegible; verificar factura");
    if (cost !== null && total !== null && Math.abs(quantity * cost - total) > Math.max(2, total * .02))
      problems.push("Cantidad × costo no coincide con total");
    lines.push({
      description, quantity, unitCost: cost, total,
      productId: match?.id ?? null, sku: match?.sku ?? null,
      warning: problems.join("; ") || undefined,
    });
  }
  if (!number) warnings.push("Revisar número de factura");
  if (!invoiceDate) warnings.push("Revisar fecha");
  if (!supplierName) warnings.push("Revisar proveedor");
  if (!lines.length) warnings.push("No se identificaron líneas completas: ingrésalas manualmente");
  if (lines.some(line => line.warning)) warnings.push("Hay referencias o importes pendientes de validación");
  if (rows.some(row => /Documento largo: revisar manualmente/i.test(row)))
    warnings.push("El PDF tiene páginas adicionales que deben revisarse manualmente");
  return { supplierName, invoiceNo: number, invoiceDate, currency, lines, warnings, rawText };
};

/** La firma del administrador también es verificada por Supabase. */
export const validateInvoiceApproval = (
  lines: readonly InvoiceLineSuggestion[], supplierId: string, invoiceNo: string,
): string[] => {
  const errors: string[] = [];
  if (!supplierId) errors.push("Selecciona un proveedor del catálogo.");
  if (!invoiceNo.trim()) errors.push("Escribe el número de la factura.");
  if (!lines.length) errors.push("Incluye las referencias facturadas.");
  for (const [index, line] of lines.entries()) {
    const label = "Línea " + (index + 1);
    if (!line.productId) errors.push(label + ": selecciona una referencia.");
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 10000)
      errors.push(label + ": cantidad inválida.");
    if (line.unitCost === null || !Number.isFinite(line.unitCost) || line.unitCost <= 0)
      errors.push(label + ": falta costo válido.");
    if (line.total !== null && (!Number.isFinite(line.total) || line.total <= 0))
      errors.push(label + ": subtotal inválido.");
    if (line.total !== null && line.unitCost !== null && Number.isFinite(line.unitCost)
      && Math.abs(line.quantity * line.unitCost - line.total) > Math.max(2, line.total * .02))
      errors.push(label + ": la cantidad por costo no coincide con el subtotal; corrige antes de aprobar.");
  }
  return errors;
};
