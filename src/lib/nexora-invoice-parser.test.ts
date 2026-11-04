import {describe,expect,it} from "vitest";
import {parseInvoiceText,readMoney} from "./nexora-invoice-parser";
describe("facturas: capturar sin inventar costos",()=>{
 it("lee montos de distintos formatos",()=>{
  expect(readMoney("$2.500.000")).toBe(2500000);
  expect(readMoney("1,234.56")).toBe(1234.56);
  expect(readMoney("1.234,56")).toBe(1234.56);
  expect(readMoney("-5")).toBeNull();
 });
 it("reconoce referencia exacta y detecta totales distintos",()=>{
  const r=parseInvoiceText("Proveedor: Tecnocentro\nFACTURA FE-91573\n2026-11-04\n"+
   "iPhone 15 Pro 256GB 2 2.500.000 5.000.000\n"+
   "iPhone 14 Pro 1 900000 950000",[{id:"p1",sku:"IP15P-256",name:"iPhone 15 Pro 256GB"}]);
  expect(r.invoiceNo).toBe("FE-91573");
  expect(r.supplierName).toBe("Tecnocentro");
  expect(r.invoiceDate).toBe("2026-11-04");
  expect(r.lines[0].productId).toBe("p1");
  expect(r.lines[0].unitCost).toBe(2500000);
  expect(r.lines[1].productId).toBeNull();
  expect(r.lines[1].warning).toMatch(/no coincide/);
 });
 it("no inventa cantidades ni productos cuando no detecta líneas",()=>{
  const r=parseInvoiceText("FACTURA 1234\nTOTAL 8000",[]);
  expect(r.lines).toHaveLength(0);
  expect(r.warnings.join(" ")).toMatch(/manualmente/);
 });
});
