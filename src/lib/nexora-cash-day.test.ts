import { describe, expect, it } from "vitest";
import {
  parseCashDayReport, validateCashOperation, type CashDayReport,
} from "./nexora-cash-day";

const report: CashDayReport = {
  businessDate: "2026-11-02", timezone: "America/Bogota",
  initialApproved: false, stores: [],
};

describe("Nexora Multisede · caja diaria sin ventas implícitas", () => {
  it("no atribuye ninguna caja a sedes inexistentes", () => {
    expect(parseCashDayReport(report)).toEqual(report);
  });
  it("muestra una sola jornada con efectivo y transferencias separados", () => {
    const day = parseCashDayReport({
      ...report,initialApproved:true,
      stores:[{
        siteId:"local-1",siteName:"Local Centro",sessionId:"cash-1",
        state:"closed",openingCash:100000,expenses:30000,
        salesCash:250000,salesTransfer:190000,expectedCash:320000,
        closingCountedCash:318000,closingDifference:-2000,
        openedAt:"2026-11-02T08:00:00Z",closedAt:"2026-11-02T22:00:00Z",
        managerEnabled:true,
      }],
    });
    expect(day.stores[0].expectedCash).toBe(320000);
    expect(day.stores[0].closingDifference).toBe(-2000);
    expect(day.stores[0].salesTransfer).toBe(190000);
  });
  it("no acepta pagos negativos o cantidades no finitas", () => {
    expect(validateCashOperation("open",-1,"")).toMatch(/no negativo/);
    expect(validateCashOperation("open",Infinity,"")).toMatch(/monto/);
    expect(validateCashOperation("close",Number.NaN,"")).toMatch(/monto/);
    expect(validateCashOperation("open",0,"")).toBeNull();
  });
  it("evita gastos cero, montos imprecisos y notas sin soporte", () => {
    expect(validateCashOperation("expense",0,"Almuerzo local")).toMatch(/mayor que cero/);
    expect(validateCashOperation("expense",1000.123,"Almuerzo local")).toMatch(/dos decimales/);
    expect(validateCashOperation("expense",1000,"x")).toMatch(/Describe/);
    expect(validateCashOperation("expense",1000,"Pago de mensajería")).toBeNull();
  });
  it("la reapertura excepcional exige un motivo explícito", () => {
    expect(validateCashOperation("reopen",null,"x")).toMatch(/motivo/);
    expect(validateCashOperation("reopen",null,"Corrección de arqueo")).toBeNull();
  });
  it("rechaza datos corruptos de caja sin inventar dinero", () => {
    expect(() => parseCashDayReport(null)).toThrow();
    expect(() => parseCashDayReport({...report,timezone:"UTC"})).toThrow();
    expect(() => parseCashDayReport({...report,stores:[{
      siteId:"s",siteName:"Local",sessionId:null,state:"not_opened",
      openingCash:0,expenses:0,salesCash:0,salesTransfer:0,
      expectedCash:"0",closingCountedCash:null,closingDifference:null,
      openedAt:null,closedAt:null,managerEnabled:false,
    }]})).toThrow();
  });
});
