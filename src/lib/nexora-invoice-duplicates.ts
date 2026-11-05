import type { SupabaseClient } from "@supabase/supabase-js";

/** Clave comercial: el guion, los espacios y el símbolo Nº no cambian la factura. */
export const canonicalInvoiceNumber = (value: string): string =>
  value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]/g, "");

export interface StoredInvoiceIdentity {
  id: string;
  original_filename: string;
  source_sha256: string;
  supplier_id: string | null;
  supplier_name: string;
  invoice_no: string | null;
  status: string;
}

export type InvoiceDuplicateMatch = {
  kind: "identical_file" | "same_supplier_number";
  invoice: StoredInvoiceIdentity;
};

export const detectInvoiceDuplicate = (
  invoices: readonly StoredInvoiceIdentity[],
  query: { sha256?: string; supplierId?: string; invoiceNo?: string; excludeId?: string },
): InvoiceDuplicateMatch | null => {
  const candidates = invoices.filter((invoice) => invoice.id !== query.excludeId);
  if (query.sha256) {
    const sameFile = candidates.find((invoice) => invoice.source_sha256 === query.sha256);
    if (sameFile) return { kind: "identical_file", invoice: sameFile };
  }
  const number = canonicalInvoiceNumber(query.invoiceNo ?? "");
  if (!query.supplierId || !number) return null;
  const sameInvoice = candidates.find((invoice) =>
    invoice.supplier_id === query.supplierId
    && canonicalInvoiceNumber(invoice.invoice_no ?? "") === number);
  return sameInvoice ? { kind: "same_supplier_number", invoice: sameInvoice } : null;
};

const FIELDS = "id,original_filename,source_sha256,supplier_id,supplier_name,invoice_no,status";

/**
 * Consulta al servidor, no solo a los primeros 30 borradores de la interfaz.
 * Recorre las facturas del proveedor hasta agotar páginas. Si la comprobación
 * falla, la factura no debe guardarse ni aprobarse sin una nueva consulta.
 */
export const lookupInvoiceDuplicate = async (
  client: SupabaseClient,
  query: { sha256?: string; supplierId?: string; invoiceNo?: string; excludeId?: string },
): Promise<InvoiceDuplicateMatch | null> => {
  if (query.sha256) {
    const result = await client.from("nexora_invoice_drafts")
      .select(FIELDS).eq("source_sha256", query.sha256).limit(2);
    if (result.error) throw new Error("No se pudo verificar si el archivo ya existe: " + result.error.message);
    const match = detectInvoiceDuplicate(result.data as StoredInvoiceIdentity[], query);
    if (match) return match;
  }

  if (!query.supplierId || !canonicalInvoiceNumber(query.invoiceNo ?? "")) return null;
  const size = 250;
  for (let offset = 0; offset < 10000; offset += size) {
    const result = await client.from("nexora_invoice_drafts")
      .select(FIELDS)
      .eq("supplier_id", query.supplierId)
      .not("invoice_no", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + size - 1);
    if (result.error) throw new Error("No se pudo verificar el número de factura: " + result.error.message);
    const rows = (result.data ?? []) as StoredInvoiceIdentity[];
    const match = detectInvoiceDuplicate(rows, query);
    if (match) return match;
    if (rows.length < size) return null;
  }
  // No devolver "sin duplicados" cuando la búsqueda no fue exhaustiva.
  throw new Error("Este proveedor tiene demasiadas facturas para validar el duplicado. Solicita revisión administrativa.");
};

export const duplicateMessage = (match: InvoiceDuplicateMatch): string =>
  match.kind === "identical_file"
    ? "Este archivo ya fue registrado en Nexora."
    : "Este proveedor ya tiene una factura con el mismo número (aunque cambien guiones o espacios).";
