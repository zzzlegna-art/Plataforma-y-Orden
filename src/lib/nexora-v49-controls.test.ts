import { describe, expect, it } from "vitest";
import {
  parseCashLimits, parseLocalInitialStatus, validateCashLimits,
} from "./nexora-v49-controls";

describe("Nexora V4.9 - aprobación inicial por cada local",()=>{
  it("interpreta aprobación administrativa sin afirmar que el POS se activó",()=>{
    const [row]=parseLocalInitialStatus([{
      siteId:"site1",siteName:"iPhone America",initialCount:0,
      globalApproved:false,approved:false,approvedAt:null,approvedCount:null,
    }]);
    expect(row.approved).toBe(false);
    expect(row.initialCount).toBe(0);
    expect(row.globalApproved).toBe(false);
  });
  it("rechaza cantidades negativas y datos corruptos",()=>{
    const base={siteId:"1",siteName:"Local",initialCount:0,globalApproved:true,
      approved:false,approvedAt:null,approvedCount:null};
    expect(()=>parseLocalInitialStatus([{...base,initialCount:-1}])).toThrow();
    expect(()=>parseLocalInitialStatus([{...base,globalApproved:"yes"}])).toThrow();
    expect(()=>parseLocalInitialStatus(null)).toThrow();
  });
});
describe("Nexora V4.9 - límites configurables por Administrador",()=>{
  it("el local sin topes aparece no configurado",()=>{
    expect(parseCashLimits([{
      siteId:"1",siteName:"Local",configured:false,maxPerExpense:null,
      maxPerDay:null,updatedAt:null,
    }])[0].configured).toBe(false);
  });
  it("admite cero para bloquear gastos y topes monetarios válidos",()=>{
    expect(validateCashLimits(0,0)).toBeNull();
    expect(validateCashLimits(50000,200000)).toBeNull();
  });
  it("bloquea montos no finitos, negativos y decimales de más de dos cifras",()=>{
    expect(validateCashLimits(-1,100)).not.toBeNull();
    expect(validateCashLimits(100,Number.POSITIVE_INFINITY)).not.toBeNull();
    expect(validateCashLimits(10.123,100)).not.toBeNull();
  });
  it("rechaza configuraciones incompletas sin inventar valores",()=>{
    expect(()=>parseCashLimits([{
      siteId:"1",siteName:"Local",configured:true,maxPerExpense:null,
      maxPerDay:200,updatedAt:null,
    }])).toThrow();
  });
});
