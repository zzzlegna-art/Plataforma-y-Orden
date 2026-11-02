import { describe,expect,it } from "vitest";
import { parseMoneyTransfers,validateMoneyTransfer } from "./nexora-money-transfers";
const valid={originSiteId:"origen",destinationSiteId:"destino",originAccount:"Cuenta A",
  destinationAccount:"Cuenta B",amount:250000,proofReference:"COM-12345"};
describe("tesorería multisede V4",()=>{
  it("impide transferir dinero entre la misma sede",()=>{
    expect(validateMoneyTransfer({...valid,destinationSiteId:"origen"})).not.toBeNull();
  });
  it("rechaza importes inválidos y comprobantes vacíos",()=>{
    expect(validateMoneyTransfer({...valid,amount:-1})).not.toBeNull();
    expect(validateMoneyTransfer({...valid,amount:0})).not.toBeNull();
    expect(validateMoneyTransfer({...valid,amount:0.001})).not.toBeNull();
    expect(validateMoneyTransfer({...valid,amount:Infinity})).not.toBeNull();
    expect(validateMoneyTransfer({...valid,proofReference:"x"})).not.toBeNull();
  });
  it("acepta transferencia documentada válida",()=>{
    expect(validateMoneyTransfer(valid)).toBeNull();
  });
  it("rechaza respuesta corrupta en vez de mostrar datos falsos",()=>{
    expect(()=>parseMoneyTransfers([{id:"x",amount:-5}])).toThrow();
    expect(()=>parseMoneyTransfers({rows:[]})).toThrow();
  });
  it("conserva estados explícitos sin imputar ingresos",()=>{
    expect(parseMoneyTransfers([{id:"1",originSiteId:"o",destinationSiteId:"d",
      originAccount:"A",destinationAccount:"B",amount:100,currency:"COP",
      proofReference:"COM-1",status:"sent",sentAt:"2026-11-02T10:00:00Z",
      receivedAt:null,reconciledAt:null}])[0].status).toBe("sent");
  });
});
