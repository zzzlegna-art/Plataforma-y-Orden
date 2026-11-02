import { describe, expect, it } from "vitest";
import {
  parseRetailReceipt, retailPaymentLabel, validateRetailSale,
  type RetailSaleInput,
} from "./nexora-retail-pos";

const base: RetailSaleInput = {
  requestId: "d7764378-e151-4d35-9675-b965083377be",
  siteId: "local-1",serial: "000012345678901",
  price: 1200000,paid: 1200000,paymentMethod:"transferencia",
};
describe("Nexora POS: venta minorista segura por IMEI", () => {
  it("acepta un solo equipo por solicitud y pago completo", () => {
    expect(validateRetailSale(base)).toBeNull();
    expect(retailPaymentLabel.transferencia).toBe("Transferencia bancaria");
    expect(retailPaymentLabel.efectivo).toBe("Efectivo");
  });
  it("rechaza venta a crédito, abonos parciales o cobro excesivo", () => {
    expect(validateRetailSale({...base,paid:1100000})).toMatch(/pago/);
    expect(validateRetailSale({...base,paid:1200001})).toMatch(/pago/);
    expect(validateRetailSale({...base,paid:0})).toMatch(/pago/);
  });
  it("rechaza identidades de solicitud inválidas, local vacío y serial ausente", () => {
    expect(validateRetailSale({...base,requestId:""})).toMatch(/identificador/);
    expect(validateRetailSale({...base,siteId:""})).toMatch(/local/);
    expect(validateRetailSale({...base,serial:"   "})).toMatch(/IMEI/);
  });
  it("rechaza importes no enteros de COP, no finitos o negativos", () => {
    expect(validateRetailSale({...base,price:0,paid:0})).toMatch(/precio/);
    expect(validateRetailSale({...base,price:1234.5,paid:1234.5})).toMatch(/precio/);
    expect(validateRetailSale({...base,price:NaN,paid:NaN})).toMatch(/precio/);
    expect(validateRetailSale({...base,price:Infinity,paid:Infinity})).toMatch(/precio/);
  });
  it("solo acepta efectivo o transferencia, nunca otro medio", () => {
    expect(validateRetailSale({...base,paymentMethod:"credito" as "efectivo"})).toMatch(/medio/);
  });
  it("interpreta un comprobante exacto e identifica reintentos idempotentes", () => {
    const receipt=parseRetailReceipt({
      saleId:"sale-1",serial:"000012345678901",price:1200000,
      paymentMethod:"transferencia",soldAt:"2026-11-02T12:00:00Z",replayed:true,
    });
    expect(receipt.replayed).toBe(true);
    expect(receipt.serial).toBe("000012345678901");
  });
  it("no inventa comprobantes con respuestas incompletas", () => {
    expect(()=>parseRetailReceipt(null)).toThrow();
    expect(()=>parseRetailReceipt({saleId:"x"})).toThrow();
    expect(()=>parseRetailReceipt({
      saleId:"x",serial:"001",price:100,paymentMethod:"credito",
      soldAt:"2026-11-02",replayed:false,
    })).toThrow();
  });
});
