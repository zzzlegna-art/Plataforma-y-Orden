/** Nexora Multisede: bitácora verificable de eventos de caja, solo Administrador. */
import { validateRetailDateRange,validIsoDate } from "./nexora-retail-site-finance";
export type CashLedgerAction="open"|"expense"|"close"|"reopen";
export interface CashLedgerEntry {
  eventId:string;sessionId:string;siteId:string;siteName:string;cityName:string;
  businessDate:string;action:CashLedgerAction;occurredAt:string;
  actorName:string|null;actorEmail:string;note:string|null;
  currentSessionState:"open"|"closed";
  amount:number|null;expected:number|null;counted:number|null;
  priorClosingDifference:number|null;
}
export interface CashEventLedger {
  scope:"cash_events_admin_only";timezone:"America/Bogota";
  from:string;to:string;siteId:string|null;
  page:number;pageSize:number;total:number;items:CashLedgerEntry[];
}
const record=(input:unknown):Record<string,unknown>=>{
  if(!input||typeof input!=="object"||Array.isArray(input))
    throw new Error("Bitácora de caja: respuesta inválida.");
  return input as Record<string,unknown>;
};
const text=(input:unknown,max=250):string=>{
  if(typeof input!=="string"||!input.trim()||input.length>max)
    throw new Error("Bitácora de caja: dato requerido inválido.");
  return input;
};
const optionalText=(input:unknown,max=500):string|null=>
  input===null?null:text(input,max);
const money=(input:unknown):number=>{
  if(typeof input!=="number"||!Number.isFinite(input)||Math.abs(input)>1e15)
    throw new Error("Bitácora de caja: importe inválido.");
  return input;
};
const optionalMoney=(input:unknown):number|null=>input===null?null:money(input);
const integer=(input:unknown):number=>{
  if(typeof input!=="number"||!Number.isSafeInteger(input)||input<0)
    throw new Error("Bitácora de caja: conteo inválido.");
  return input;
};
const actions=new Set<CashLedgerAction>(["open","expense","close","reopen"]);
export const parseCashEventLedger=(raw:unknown):CashEventLedger=>{
  const r=record(raw);
  if(r.scope!=="cash_events_admin_only"||r.timezone!=="America/Bogota"
    ||typeof r.from!=="string"||typeof r.to!=="string"
    ||validateRetailDateRange(r.from,r.to)||!Array.isArray(r.items))
    throw new Error("Bitácora de caja: alcance o fechas inválidas.");
  const page=integer(r.page),pageSize=integer(r.pageSize),total=integer(r.total);
  if(page===0||page>10000||pageSize===0||pageSize>50
    ||r.items.length>pageSize||r.items.length>total)
    throw new Error("Bitácora de caja: paginación inválida.");
  const ids=new Set<string>();
  const items=r.items.map((raw:unknown):CashLedgerEntry=>{
    const x=record(raw), eventId=text(x.eventId);
    if(!/^\d{1,19}$/.test(eventId)||ids.has(eventId)||!actions.has(x.action as CashLedgerAction))
      throw new Error("Bitácora de caja: evento repetido o desconocido.");
    ids.add(eventId);
    if(!validIsoDate(text(x.businessDate))||typeof x.occurredAt!=="string"
      ||Number.isNaN(Date.parse(x.occurredAt))||
      (x.currentSessionState!=="open"&&x.currentSessionState!=="closed"))
      throw new Error("Bitácora de caja: fecha o sesión inválida.");
    const item:CashLedgerEntry={
      eventId,sessionId:text(x.sessionId),siteId:text(x.siteId),
      siteName:text(x.siteName),cityName:text(x.cityName),
      businessDate:x.businessDate as string,action:x.action as CashLedgerAction,
      occurredAt:x.occurredAt,actorName:optionalText(x.actorName),
      actorEmail:text(x.actorEmail),note:optionalText(x.note),
      currentSessionState:x.currentSessionState,
      amount:optionalMoney(x.amount),expected:optionalMoney(x.expected),
      counted:optionalMoney(x.counted),
      priorClosingDifference:optionalMoney(x.priorClosingDifference),
    };
    if((item.action==="open"||item.action==="expense")&&
       (item.amount===null||item.amount<0))throw new Error("Bitácora de caja: importe faltante.");
    if(item.action==="close"&&
      (item.expected===null||item.counted===null||item.expected<0||item.counted<0))
      throw new Error("Bitácora de caja: arqueo sin montos.");
    return item;
  });
  if(items.some((item,i)=>i>0 && (
    Date.parse(items[i-1].occurredAt)<Date.parse(item.occurredAt) ||
    (items[i-1].occurredAt===item.occurredAt&&
      BigInt(items[i-1].eventId)<BigInt(item.eventId)))))
    throw new Error("Bitácora de caja: eventos fuera de orden.");
  return {scope:"cash_events_admin_only",timezone:"America/Bogota",
    from:r.from,to:r.to,siteId:r.siteId===null?null:text(r.siteId),
    page,pageSize,total,items};
};
export const fetchCashEventLedger=async (
  from:string,to:string,page:number,siteId:string|null=null,
):Promise<CashEventLedger>=>{
  const invalid=validateRetailDateRange(from,to);
  if(invalid)throw new Error(invalid);
  if(!Number.isSafeInteger(page)||page<1||page>10000)
    throw new Error("Página solicitada inválida.");
  const {supabase}=await import("@/integrations/supabase/client");
  const {data,error}=await (supabase as unknown as {
    rpc:(name:string,args:Record<string,unknown>)=>Promise<{
      data:unknown;error:{message:string}|null;
    }>;
  }).rpc("nexora_cash_event_ledger",{
    p_from:from,p_to:to,p_site_id:siteId,p_page:page,p_page_size:25,
  });
  if(error)throw new Error(error.message);
  const ledger=parseCashEventLedger(data);
  if(ledger.from!==from||ledger.to!==to||ledger.siteId!==siteId||ledger.page!==page)
    throw new Error("Bitácora de caja: la respuesta pertenece a otra consulta.");
  return ledger;
};
