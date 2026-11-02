import { describe,expect,it } from "vitest";
import { parseCashClosureAudit } from "./nexora-cash-closure-audit";
const session=()=>({
  sessionId:"s1",siteId:"local-1",siteName:"Local Centro",cityName:"Barranquilla",
  businessDate:"2026-11-02",state:"closed",
  openedAt:"2026-11-02T09:00:00Z",closedAt:"2026-11-02T17:00:00Z",
  openingCash:100000,cashSales:200000,transferSales:50000,
  authorizedExpenses:10000,expectedCashCalculated:290000,
  recordedExpectedCash:290000,countedCash:285000,
  recordedDifference:-5000,differenceCalculated:-5000,
  reopenCount:1,eventCount:4,hasCashDifference:true,hasIntegrityMismatch:false,
});
const response=()=>({
  scope:"admin_cash_session_audit",timezone:"America/Bogota",
  from:"2026-11-01",to:"2026-11-02",siteId:null,
  page:1,pageSize:25,total:1,items:[session()],
});
describe("Nexora · auditoría por jornada de caja",()=>{
  it("distingue diferencia documentada de inconsistencia de integridad",()=>{
    const data=parseCashClosureAudit(response());
    expect(data.items[0].recordedDifference).toBe(-5000);
    expect(data.items[0].hasCashDifference).toBe(true);
    expect(data.items[0].hasIntegrityMismatch).toBe(false);
    expect(data.items[0].reopenCount).toBe(1);
  });
  it("acepta jornadas abiertas solo si no existe cierre físico registrado",()=>{
    const s={...session(),state:"open",closedAt:null,recordedExpectedCash:null,
      countedCash:null,recordedDifference:null,differenceCalculated:null,
      hasCashDifference:false,hasIntegrityMismatch:false};
    expect(parseCashClosureAudit({...response(),items:[s]}).items[0].state).toBe("open");
    expect(()=>parseCashClosureAudit({...response(),items:[{...s,hasCashDifference:true}]})).toThrow();
  });
  it("detecta discrepancias de registros aunque el efectivo contado sea correcto",()=>{
    const v={...session(),recordedExpectedCash:280000,hasIntegrityMismatch:true};
    expect(parseCashClosureAudit({...response(),items:[v]}).items[0].hasIntegrityMismatch).toBe(true);
    expect(()=>parseCashClosureAudit({...response(),items:[{...v,hasIntegrityMismatch:false}]})).toThrow();
  });
  it("rechaza respuesta externa, conteos inconsistentes y fecha alterada",()=>{
    expect(()=>parseCashClosureAudit({...response(),scope:"retail_only_confirmed"})).toThrow();
    expect(()=>parseCashClosureAudit({...response(),total:0})).toThrow();
    expect(()=>parseCashClosureAudit({...response(),from:"2022-01-01"})).toThrow();
    expect(()=>parseCashClosureAudit({...response(),items:[{...session(),businessDate:"2026-99-99"}]})).toThrow();
  });
  it("no inventa arqueos si la base no tiene sesiones",()=>{
    const a=parseCashClosureAudit({...response(),total:0,items:[]});
    expect(a.items).toHaveLength(0);
  });
});
