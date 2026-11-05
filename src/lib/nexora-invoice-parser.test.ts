import {describe,expect,it} from "vitest";
import {parseInvoiceText,readMoney,validateInvoiceApproval} from "./nexora-invoice-parser";
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
 it("impide aprobar una factura con subtotal distinto al costo",()=>{
   const errors=validateInvoiceApproval([
     {description:"iPhone 13",quantity:2,unitCost:1200000,total:2000000,productId:"p13",sku:"IP13"},
   ],"supplier","FE-123");
   expect(errors.join(" ")).toMatch(/no coincide/);
   expect(validateInvoiceApproval([
     {description:"iPhone 13",quantity:2,unitCost:1200000,total:2400000,productId:"p13",sku:"IP13"},
   ],"supplier","FE-123")).toEqual([]);
 });
 it("no inventa cantidades ni productos cuando no detecta líneas",()=>{
  const r=parseInvoiceText("FACTURA 1234\nTOTAL 8000",[]);
  expect(r.lines).toHaveLength(0);
  expect(r.warnings.join(" ")).toMatch(/manualmente/);
 });
 it("interpreta factura electrónica colombiana con fecha escrita y tabla con separadores",()=>{
  const r=parseInvoiceText([
   "RAZÓN SOCIAL DEL EMISOR: Tecnología Oriente SAS",
   "FACTURA ELECTRÓNICA DE VENTA No. FE-002481",
   "Fecha de emisión: 05 de noviembre de 2026",
   "Moneda: COP",
   "DESCRIPCIÓN | CANTIDAD | VALOR UNITARIO | SUBTOTAL",
   "iPhone 15 Pro 256GB | 2 | $2.500.000,00 | $5.000.000,00",
   "IVA 19% 950.000",
   "TOTAL A PAGAR 5.950.000",
  ].join("\n"),[{id:"p15",sku:"IP15P-256",name:"iPhone 15 Pro 256GB"}]);
  expect(r.supplierName).toBe("Tecnología Oriente SAS");
  expect(r.invoiceNo).toBe("FE-002481");
  expect(r.invoiceDate).toBe("2026-11-05");
  expect(r.lines).toHaveLength(1);
  expect(r.lines[0]).toMatchObject({productId:"p15",quantity:2,unitCost:2500000,total:5000000});
 });
 it("lee factura internacional en USD con prefijo INV y valores decimales",()=>{
  const r=parseInvoiceText([
   "Supplier: North Coast Devices",
   "INVOICE #: INV-2026-00421",
   "Date: 2026-10-31",
   "Currency USD",
   "Qty | Description | Unit price | Amount",
   "1 | iPhone 15 Pro 256GB | 1,199.50 | 1,199.50",
   "Total USD 1,199.50",
  ].join("\n"),[{id:"p15",sku:"IP15P-256",name:"iPhone 15 Pro 256GB"}]);
  expect(r.invoiceNo).toBe("INV-2026-00421");
  expect(r.currency).toBe("USD");
  expect(r.lines).toHaveLength(1);
  expect(r.lines[0]).toMatchObject({productId:"p15",quantity:1,unitCost:1199.5,total:1199.5});
 });
 it("soporta columna de renglón antes de cantidad y evita sumar impuestos",()=>{
  const r=parseInvoiceText([
   "PROVEEDOR: Almacén Mayorista", "FACTURA FV-4567", "05/11/2026",
   "01 2 iPhone 14 Pro 256GB 1.300.000 2.600.000",
   "02 1 iPhone 15 Pro 256GB 2.000.000 2.000.000",
   "SUBTOTAL 4.600.000", "IVA 874.000", "TOTAL 5.474.000",
  ].join("\n"),[
    {id:"p14",sku:"IP14P",name:"iPhone 14 Pro 256GB"},
    {id:"p15",sku:"IP15P",name:"iPhone 15 Pro 256GB"},
  ]);
  expect(r.lines).toHaveLength(2);
  expect(r.lines.map(l=>l.quantity)).toEqual([2,1]);
  expect(r.lines.reduce((sum,l)=>sum+(l.total??0),0)).toBe(4600000);
 });
 it("una lectura parcial no inventa artículos ni costos desde el total",()=>{
   const r=parseInvoiceText("FACTURA FE-98765\nPROVEEDOR: Ejemplo\nTOTAL GENERAL 8.990.000",[]);
   expect(r.lines).toEqual([]);
   expect(r.warnings.join(" ")).toMatch(/manualmente/);
 });
 it("advierte cuando el archivo excede las páginas leídas",()=>{
   const r=parseInvoiceText("FACTURA FE-98765\n[Documento largo: revisar manualmente páginas adicionales]",[]);
   expect(r.warnings.join(" ")).toMatch(/páginas adicionales/);
 });

});
