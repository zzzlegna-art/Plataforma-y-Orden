/** Exportación auditada de eventos de caja sin datos falsos o páginas parciales. */
import { safeCsvCell } from "./nexora-imei-unified-csv";
import {
  fetchCashEventLedger,
  type CashLedgerEntry,
  type CashEventLedger,
  type CashLedgerAction,
} from "./nexora-cash-event-ledger";
import { validateRetailDateRange } from "./nexora-retail-site-finance";

export const MAX_CASH_LEDGER_EXPORT_EVENTS=2000;
type FetchLedgerPage=(from:string,to:string,page:number,siteId:string|null)=>Promise<CashEventLedger>;
const labels:Record<CashLedgerAction,string>={
  open:"Apertura de caja",
  expense:"Gasto autorizado",
  close:"Cierre de jornada",
  reopen:"Reapertura excepcional",
};

const ordered=(a:CashLedgerEntry,b:CashLedgerEntry):boolean=>{
  const left=Date.parse(a.occurredAt),right=Date.parse(b.occurredAt);
  return left>right || (left===right&&BigInt(a.eventId)>BigInt(b.eventId));
};

/** Verifica alcance, integridad, conteos y orden de cada página antes de crear el CSV. */
export const collectCashLedgerForExport=async(
  from:string,to:string,siteId:string|null=null,
  fetchPage:FetchLedgerPage=fetchCashEventLedger,
):Promise<CashLedgerEntry[]>=>{
  const invalid=validateRetailDateRange(from,to);
  if(invalid)throw new Error(invalid);
  const first=await fetchPage(from,to,1,siteId);
  if(first.scope!=="cash_events_admin_only"||first.timezone!=="America/Bogota"
    ||first.from!==from||first.to!==to||first.siteId!==siteId
    ||first.page!==1||first.pageSize!==25
    ||first.total>MAX_CASH_LEDGER_EXPORT_EVENTS)
    throw new Error("Bitácora incompatible o con más de 2.000 eventos. Usa un rango menor.");
  const collected=[...first.items];
  const ids=new Set(collected.map(e=>e.eventId));
  if(ids.size!==collected.length)throw new Error("La bitácora contiene eventos duplicados.");
  for(let i=1;i<collected.length;i++){
    if(!ordered(collected[i-1],collected[i]))
      throw new Error("La bitácora contiene eventos fuera de orden.");
  }
  const pages=Math.max(1,Math.ceil(first.total/first.pageSize));
  for(let page=2;page<=pages;page++){
    const next=await fetchPage(from,to,page,siteId);
    if(next.scope!==first.scope||next.timezone!==first.timezone||
       next.from!==from||next.to!==to||next.siteId!==siteId||
       next.page!==page||next.pageSize!==first.pageSize||
       next.total!==first.total||next.items.length===0)
      throw new Error("La bitácora cambió durante la exportación. Vuelve a intentarlo.");
    for(const item of next.items){
      const prev=collected[collected.length-1];
      if(ids.has(item.eventId)||prev&&!ordered(prev,item))
        throw new Error("La bitácora tiene eventos repetidos o fuera de orden.");
      ids.add(item.eventId);
      collected.push(item);
    }
  }
  if(collected.length!==first.total)
    throw new Error("La bitácora está incompleta. No se generó un CSV parcial.");
  return collected;
};

const amount=(n:number|null):string=>
  n===null?"":n.toFixed(2);
/** Cantidad segura y numérica, incluso cuando es negativa. */
const moneyCell=(value:number|null):string=>{
  if(value===null)return '""';
  if(!Number.isFinite(value)||Math.abs(value)>1e15)
    throw new Error("La bitácora contiene un monto no representable.");
  return '"'+amount(value)+'"';
};
type CsvCell={text:string}|{number:number|null};
const cell=(value:CsvCell):string=>
  "text" in value?safeCsvCell(value.text):moneyCell(value.number);
const text=(input:string):CsvCell=>({text:input});
const num=(input:number|null):CsvCell=>({number:input});

export const buildCashLedgerCsv=(params:{
  from:string;to:string;siteId:string|null;items:readonly CashLedgerEntry[];
}):string=>{
  const {from,to,siteId,items}=params;
  if(validateRetailDateRange(from,to)||items.length>MAX_CASH_LEDGER_EXPORT_EVENTS)
    throw new Error("El período o el tamaño de la bitácora no son exportables.");
  const rows:CsvCell[][]=[
    [text("Nexora Multisede · Bitácora de eventos de caja")],
    [text("Desde"),text(from),text("Hasta"),text(to)],
    [text("Zona horaria"),text("America/Bogota")],
    [text("Alcance"),text("Solo eventos de caja confirmados; no representa contabilidad neta ni ventas mayoristas")],
    [text("Sede"),text(siteId??"Todas las sedes")],
    [],
    ["Evento","Jornada","Fecha de evento","Acción","Ciudad","Local","Responsable","Correo",
      "Motivo","Apertura/gasto COP","Esperado COP","Contado COP",
      "Diferencia cierre previo COP","Estado actual de sesión"].map(text),
  ];
  const seen=new Set<string>();
  for(const event of items){
    if(seen.has(event.eventId))
      throw new Error("No puede exportarse un evento duplicado.");
    seen.add(event.eventId);
    rows.push([
      text(event.eventId),text(event.businessDate),text(event.occurredAt),
      text(labels[event.action]),text(event.cityName),text(event.siteName),
      text(event.actorName??""),text(event.actorEmail),text(event.note??""),
      num(event.amount),num(event.expected),num(event.counted),
      num(event.priorClosingDifference),text(event.currentSessionState==="closed"?"Cerrada":"Abierta"),
    ]);
  }
  return "\uFEFF"+rows.map(row=>row.map(cell).join(";")).join("\r\n")+"\r\n";
};
