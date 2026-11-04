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
 it("detecta facturas con cantidad al principio sin confundir el modelo",()=>{
  const r=parseInvoiceText("PROVEEDOR: Tech Global\nFACTURA FE-81234\n04/11/2026\n"+
   "2 iPhone 13 128GB 1.250.000 2.500.000",[
   {id:"p13",sku:"IP13-128",name:"iPhone 13 128GB"},
  ]);
  expect(r.lines).toHaveLength(1);
  expect(r.lines[0]).toMatchObject({quantity:2,unitCost:1250000,total:2500000,productId:"p13"});
 });
 it("no asigna automáticamente un producto cuando el SKU es ambiguo",()=>{
  const r=parseInvoiceText("FACTURA FE-777\n2 IP13 100.000 200.000",[
   {id:"a",sku:"IP13",name:"iPhone 13 A"},
   {id:"b",sku:"IP13",name:"iPhone 13 B"},
  ]);
  expect(r.lines[0].productId).toBeNull();
  expect(r.lines[0].warning).toMatch(/ambigua/);
 });
 it("advierte una línea con subtotal diferente, sin corregirla silenciosamente",()=>{
  const r=parseInvoiceText("FACTURA FE-123\n2 IP14 900.000 1.500.000",
   [{id:"p14",sku:"IP14",name:"iPhone 14"}]);
  expect(r.lines[0].warning).toMatch(/no coincide/);
 });
 it("no inventa cantidades ni productos cuando no detecta líneas",()=>{
  const r=parseInvoiceText("FACTURA 1234\nTOTAL 8000",[]);
  expect(r.lines).toHaveLength(0);
  expect(r.warnings.join(" ")).toMatch(/manualmente/);
 });
});
