import { describe,expect,it,vi } from "vitest";
import {
  buildCashLedgerCsv,collectCashLedgerForExport,MAX_CASH_LEDGER_EXPORT_EVENTS,
} from "./nexora-cash-event-ledger-csv";
import type { CashEventLedger,CashLedgerEntry } from "./nexora-cash-event-ledger";
const from="2026-11-01",to="2026-11-02";
const row=(i:number):CashLedgerEntry=>({
  eventId:String(200-i),
  sessionId:"123e4567-e89b-12d3-a456-426614174000",
  siteId:"223e4567-e89b-12d3-a456-426614174000",
  siteName:"Local Norte",cityName:"Barranquilla",
  businessDate:"2026-11-02",action:"close",
  occurredAt:new Date(Date.UTC(2026,10,2,17,0,0)-i*1000).toISOString(),
  actorName:"Administración",actorEmail:"admin@example.com",note:"Cierre verificado",
  currentSessionState:"closed",amount:null,expected:300000,counted:297500,
  priorClosingDifference:null,
});
const response=(page:number,total:number,items:CashLedgerEntry[]):CashEventLedger=>({
  scope:"cash_events_admin_only",timezone:"America/Bogota",from,to,siteId:null,
  page,pageSize:25,total,items,
});
describe("Nexora · exportación completa de eventos de caja",()=>{
  it("recorre todas las páginas y compara los identificadores de la sesión",async()=>{
    const first=Array.from({length:25},(_,i)=>row(i));
    const fetchPage=vi.fn(async(_from:string,_to:string,page:number,_site:string|null)=>
      page===1?response(1,26,first):response(2,26,[row(25)]));
    const result=await collectCashLedgerForExport(from,to,null,fetchPage);
    expect(result).toHaveLength(26);
    expect(result[25].eventId).toBe("175");
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenLastCalledWith(from,to,2,null);
  });
  it("rechaza identidad mezclada, conteos cambiantes y páginas repetidas",async()=>{
    const first=Array.from({length:25},(_,i)=>row(i));
    await expect(collectCashLedgerForExport(from,to,null,async()=>({...response(1,1,[row(0)]),siteId:"otra-sede"}))).rejects.toThrow();
    await expect(collectCashLedgerForExport(from,to,null,
      async(_a,_b,page)=>page===1?response(1,26,first):response(2,27,[row(25)]),
    )).rejects.toThrow();
    await expect(collectCashLedgerForExport(from,to,null,
      async(_a,_b,page)=>page===1?response(1,26,first):response(2,26,[row(24)]),
    )).rejects.toThrow();
  });
  it("no exporta registros incompletos ni demasiados eventos",async()=>{
    const first=Array.from({length:25},(_,i)=>row(i));
    await expect(collectCashLedgerForExport(from,to,null,
      async(_a,_b,page)=>page===1?response(1,26,first):response(2,26,[]),
    )).rejects.toThrow();
    await expect(collectCashLedgerForExport(from,to,null,
      async()=>response(1,MAX_CASH_LEDGER_EXPORT_EVENTS+1,[]),
    )).rejects.toThrow();
  });
  it("protege nombres y motivos contra fórmulas y conserva cifras negativas",()=>{
    const item={...row(0),cityName:"=IMPORTXML(A1)",siteName:"+Local Centro",
      note:"@HYPERLINK(url)",action:"reopen" as const,
      expected:null,counted:null,priorClosingDifference:-1250.25};
    const csv=buildCashLedgerCsv({from,to,siteId:null,items:[item]});
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"'=IMPORTXML(A1)"`);
    expect(csv).toContain(`"'+Local Centro"`);
    expect(csv).toContain(`"'@HYPERLINK(url)"`);
    expect(csv).toContain('"-1250.25"');
    expect(csv).toContain("Reapertura excepcional");
  });
  it("no inventa historial y valida fechas del reporte",()=>{
    const csv=buildCashLedgerCsv({from,to,siteId:null,items:[]});
    expect(csv).toContain("Bitácora de eventos de caja");
    expect(csv).not.toContain("Local Norte");
    expect(()=>buildCashLedgerCsv({from:"2026-11-03",to,siteId:null,items:[]})).toThrow();
    expect(()=>buildCashLedgerCsv({from,to,siteId:null,items:[row(0),row(0)]})).toThrow();
  });
});
