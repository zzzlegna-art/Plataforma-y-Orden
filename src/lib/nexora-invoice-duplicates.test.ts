import { describe, expect, it } from "vitest";
import { canonicalInvoiceNumber, detectInvoiceDuplicate, duplicateMessage, type StoredInvoiceIdentity } from "./nexora-invoice-duplicates";

const draft: StoredInvoiceIdentity = {
  id: "old", source_sha256: "abc123", supplier_id: "provider-1",
  invoice_no: "FE-00091573", original_filename: "factura_original.pdf",
  supplier_name: "Proveedor", status: "reviewed",
};

describe("duplicados de facturas de proveedor", () => {
  it.each(["FE-00091573", "FE 00091573", "fe.00091573", "FE/00091573"])(
    "normaliza distintas escrituras del número %s",
    (value) => expect(canonicalInvoiceNumber(value)).toBe("FE00091573"),
  );
  it("detecta primero el mismo documento por su huella criptográfica", () => {
    const found = detectInvoiceDuplicate([draft], { sha256: "abc123", supplierId: "provider-2", invoiceNo: "OTRO" });
    expect(found?.kind).toBe("identical_file");
    expect(duplicateMessage(found!)).toMatch(/archivo/);
  });
  it("detecta el mismo emisor y número aun con PDF distinto", () => {
    const found = detectInvoiceDuplicate([draft], {
      sha256: "differenthash", supplierId: "provider-1", invoiceNo: "fe 00091573",
    });
    expect(found?.kind).toBe("same_supplier_number");
  });
  it("no bloquea facturas de proveedores diferentes con el mismo número", () => {
    expect(detectInvoiceDuplicate([draft], { supplierId: "provider-2", invoiceNo: "FE-00091573" })).toBeNull();
  });
  it("excluye el mismo borrador al editarlo y requiere proveedor identificado", () => {
    expect(detectInvoiceDuplicate([draft], { supplierId: "provider-1", invoiceNo: "FE00091573", excludeId: "old" })).toBeNull();
    expect(detectInvoiceDuplicate([draft], { invoiceNo: "FE00091573" })).toBeNull();
  });
  it("conserva diferencias de dígitos y prefijos", () => {
    expect(detectInvoiceDuplicate([draft], { supplierId: "provider-1", invoiceNo: "FE-00091574" })).toBeNull();
    expect(detectInvoiceDuplicate([draft], { supplierId: "provider-1", invoiceNo: "FV-00091573" })).toBeNull();
  });
});
