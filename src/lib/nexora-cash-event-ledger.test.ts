import { describe,expect,it } from "vitest";
import { parseCashEventLedger } from "./nexora-cash-event-ledger";
const record=(index=9)=>({
  eventId:String(index),sessionId:"123e4567-e89b-12d3-a456-426614174000",
  siteId:"223e4567-e89b-12d3-a456-426614174000",
  siteName:"Local Centro",cityName:"Barranquilla",
  businessDate:"2026-11-02",action:"close",occurredAt:"2026-11-02T17:00:00Z",
  actorName:null,actorEmail:"admin@example.com",note:null,
  currentSessionState:"closed",
  amount:null,expected:100000,counted:99000,priorClosingDifference:null,
});
const payload=()=>({scope:"cash_events_admin_only",timezone:"America/Bogota",
  from:"2026-11-01",to:"2026-11-02",siteId:null,
  page:1,pageSize:25,total:1,items:[record()],
});
describe("Nexora · bitácora real de eventos de caja",()=>{
  it("conserva fecha, actor, cierre y efectivo contado",()=>{
    const r=parseCashEventLedger(payload());
    expect(r.items[0].actorEmail).toBe("admin@example.com");
    expect(r.items[0].counted).toBe(99000);
    expect(r.items[0].expected).toBe(100000);
    expect(r.items[0].actorName).toBeNull();
  });
  it("registra las acciones de apertura, gasto y reapertura sin exigir el estado final",()=>{
    const p=payload();
    expect(parseCashEventLedger({...p,items:[{
      ...record(),action:"expense",amount:10000,expected:null,counted:null,
      note:"Compra aprobada",currentSessionState:"open",
    }]}).items[0].action).toBe("expense");
    expect(parseCashEventLedger({...p,items:[{
      ...record(),action:"reopen",expected:null,counted:null,
      priorClosingDifference:-2500,
    }]}).items[0].priorClosingDifference).toBe(-2500);
  });
  it("rechaza un actor anónimo, montos faltantes y fechas irreales",()=>{
    const p=payload();
    expect(()=>parseCashEventLedger({...p,items:[{...record(),actorEmail:""}]})).toThrow();
    expect(()=>parseCashEventLedger({...p,items:[{
      ...record(),action:"close",counted:null,
    }]})).toThrow();
    expect(()=>parseCashEventLedger({...p,items:[{...record(),businessDate:"2026-02-30"}]})).toThrow();
  });
  it("rechaza identidad de evento repetida, paginación y orden inválidos",()=>{
    const p=payload();
    expect(()=>parseCashEventLedger({...p,total:2,items:[record(),record()]})).toThrow();
    expect(()=>parseCashEventLedger({...p,page:0})).toThrow();
    expect(()=>parseCashEventLedger({...p,total:2,items:[
      {...record(8),occurredAt:"2026-11-01T17:00:00Z"},record(9),
    ]})).toThrow();
  });
  it("muestra bitácora vacía real y no inventa ingresos",()=>{
    const r=parseCashEventLedger({...payload(),total:0,items:[]});
    expect(r.items).toEqual([]);
  });
});
