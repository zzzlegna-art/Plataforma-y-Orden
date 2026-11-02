/** Auditoría de caja por jornada y local, exclusivamente en modo lectura. */
import { validateRetailDateRange,validIsoDate } from "./nexora-retail-site-finance";
export interface CashClosureAuditRow {
  sessionId:string;siteId:string;siteName:string;cityName:string;
  businessDate:string;state:"open"|"closed";
  openedAt:string;closedAt:string|null;
  openingCash:number;cashSales:number;transferSales:number;
  authorizedExpenses:number;expectedCashCalculated:number;
  recordedExpectedCash:number|null;countedCash:number|null;
  recordedDifference:number|null;differenceCalculated:number|null;
  reopenCount:number;eventCount:number;
  hasCashDifference:boolean;hasIntegrityMismatch:boolean;
}
export interface CashClosureAuditReport {
  scope:"admin_cash_session_audit";timezone:"America/Bogota";
  from:string;to:string;siteId:string|null;
  page:number;pageSize:number;total:number;
  items:CashClosureAuditRow[];
}
const record=(value:unknown):Record<string,unknown>=>{
  if(!value||typeof value!=="object"||Array.isArray(value))
    throw new Error("Auditoría de caja con respuesta inválida.");
  return value as Record<string,unknown>;
};
const str=(value:unknown)=>{
  if(typeof value!=="string"||!value.trim()||value.length>250)
    throw new Error("Dato de caja ausente o inválido.");
  return value;
};
const optional=(value:unknown)=>value===null?null:str(value);
const money=(value:unknown)=>{
  if(typeof value!=="number"||!Number.isFinite(value)||Math.abs(value)>1e15)
    throw new Error("Saldo de caja inválido.");
  return value;
};
const nullableMoney=(value:unknown)=>value===null?null:money(value);
const count=(value:unknown)=>{
  if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0)
    throw new Error("Conteo de caja inválido.");
  return value;
};
const date=(value:unknown)=>{
  const iso=str(value);
  if(Number.isNaN(Date.parse(iso)))throw new Error("Marca de tiempo inválida.");
  return iso;
};
/** En caja, una diferencia real de un centavo ya es relevante. */
const near=(a:number,b:number)=>Math.round(a*100)===Math.round(b*100);

export const parseCashClosureAudit=(raw:unknown):CashClosureAuditReport=>{
  const r=record(raw);
  if(r.scope!=="admin_cash_session_audit"||r.timezone!=="America/Bogota"
    ||typeof r.from!=="string"||typeof r.to!=="string"
    ||validateRetailDateRange(r.from,r.to)
    ||!Array.isArray(r.items))throw new Error("Período o alcance de auditoría inválido.");
  const page=count(r.page),pageSize=count(r.pageSize),total=count(r.total);
  if(page<1||page>10000||pageSize<1||pageSize>50
     ||r.items.length>pageSize||r.items.length>total)
    throw new Error("Paginación de auditoría inválida.");
  const ids=new Set<string>();
  const items=r.items.map((raw:unknown):CashClosureAuditRow=>{
    const v=record(raw);
    const sessionId=str(v.sessionId);
    if(ids.has(sessionId))throw new Error("Jornada de caja duplicada.");
    ids.add(sessionId);
    const state=v.state;
    if(state!=="open"&&state!=="closed")
      throw new Error("Estado de jornada inválido.");
    if(typeof v.hasCashDifference!=="boolean"||typeof v.hasIntegrityMismatch!=="boolean")
      throw new Error("Faltan señales de auditoría.");
    const item:CashClosureAuditRow={
      sessionId,siteId:str(v.siteId),siteName:str(v.siteName),
      cityName:str(v.cityName),businessDate:str(v.businessDate),
      state,openedAt:date(v.openedAt),closedAt:optional(v.closedAt),
      openingCash:money(v.openingCash),cashSales:money(v.cashSales),
      transferSales:money(v.transferSales),authorizedExpenses:money(v.authorizedExpenses),
      expectedCashCalculated:money(v.expectedCashCalculated),
      recordedExpectedCash:nullableMoney(v.recordedExpectedCash),
      countedCash:nullableMoney(v.countedCash),
      recordedDifference:nullableMoney(v.recordedDifference),
      differenceCalculated:nullableMoney(v.differenceCalculated),
      reopenCount:count(v.reopenCount),eventCount:count(v.eventCount),
      hasCashDifference:v.hasCashDifference,hasIntegrityMismatch:v.hasIntegrityMismatch,
    };
    const expected=item.openingCash+item.cashSales-item.authorizedExpenses;
    if(!validIsoDate(item.businessDate)
      ||!near(item.expectedCashCalculated,expected)
      ||[item.openingCash,item.cashSales,item.transferSales,item.authorizedExpenses].some(x=>x<0)
      ||item.eventCount<item.reopenCount)throw new Error("Importes o fechas de caja incompatibles.");
    if(state==="open"){
      if(item.closedAt!==null||item.recordedExpectedCash!==null
        ||item.countedCash!==null||item.recordedDifference!==null
        ||item.differenceCalculated!==null||item.hasCashDifference||item.hasIntegrityMismatch)
        throw new Error("Una caja abierta no puede tener cierre confirmado.");
    }else{
      if(item.closedAt===null||item.recordedExpectedCash===null||
        item.countedCash===null||item.recordedDifference===null||
        item.differenceCalculated===null)throw new Error("Faltan datos del arqueo cerrado.");
      const calculated=item.countedCash-item.expectedCashCalculated;
      if(!near(item.differenceCalculated,calculated))
        throw new Error("Diferencia de caja calculada inconsistentemente.");
      if(item.hasCashDifference!==(item.recordedDifference!==0))
        throw new Error("Bandera de diferencia de caja inconsistente.");
      const mismatch=!near(item.recordedExpectedCash,item.expectedCashCalculated)
        ||!near(item.recordedDifference,item.differenceCalculated);
      if(item.hasIntegrityMismatch!==mismatch)
        throw new Error("Bandera de conciliación incompatible.");
    }
    return item;
  });
  if(items.some((item,index)=>index>0&&
      (items[index-1].businessDate<item.businessDate)))
    throw new Error("Sesiones fuera de orden.");
  return {scope:"admin_cash_session_audit",timezone:"America/Bogota",
    from:r.from,to:r.to,siteId:r.siteId===null?null:str(r.siteId),
    page,pageSize,total,items};
};
export const fetchCashClosureAudit=async (
  from:string,to:string,siteId:string|null,page:number,
):Promise<CashClosureAuditReport>=>{
  const invalid=validateRetailDateRange(from,to);
  if(invalid)throw new Error(invalid);
  if(!Number.isSafeInteger(page)||page<1||page>10000)throw new Error("Página inválida.");
  const {supabase}=await import("@/integrations/supabase/client");
  const response=await (supabase as unknown as {
    rpc:(name:string,args:Record<string,unknown>)=>Promise<{
      data:unknown;error:{message:string}|null;
    }>;
  }).rpc("nexora_cash_closure_audit",{
    p_from:from,p_to:to,p_site_id:siteId,p_page:page,p_page_size:25,
  });
  if(response.error)throw new Error(response.error.message);
  const report=parseCashClosureAudit(response.data);
  if(report.from!==from||report.to!==to||report.siteId!==siteId||report.page!==page)
    throw new Error("La auditoría recibida no corresponde a la consulta solicitada.");
  return report;
};
