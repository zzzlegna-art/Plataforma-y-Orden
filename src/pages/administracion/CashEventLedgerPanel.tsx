import { useEffect,useRef,useState } from "react";
import { ArrowLeft,ArrowRight,Banknote,ChevronDown,ChevronUp,ClipboardList,Download,LockKeyhole,RefreshCw,ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayIso } from "@/lib/format";
import { validateRetailDateRange } from "@/lib/nexora-retail-site-finance";
import { fetchCashEventLedger,type CashEventLedger,type CashLedgerAction } from "@/lib/nexora-cash-event-ledger";
import { buildCashLedgerCsv,collectCashLedgerForExport } from "@/lib/nexora-cash-event-ledger-csv";

const labels:Record<CashLedgerAction,string>={
  open:"Apertura de caja",expense:"Gasto autorizado",
  close:"Cierre de jornada",reopen:"Reapertura excepcional",
};
const colors:Record<CashLedgerAction,string>={
  open:"border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200",
  expense:"border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
  close:"border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200",
  reopen:"border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200",
};
const cop=(value:number)=>new Intl.NumberFormat("es-CO",{
  style:"currency",currency:"COP",maximumFractionDigits:2,
}).format(value);
const dateBefore=(day:string,days:number)=>{
  const d=new Date(day+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-days);
  return d.toISOString().slice(0,10);
};
const localDate=(value:string)=>new Date(value).toLocaleString("es-CO",{
  timeZone:"America/Bogota",dateStyle:"medium",timeStyle:"short",
});

/** Anexo a la auditoría heredada, sin reemplazarla ni habilitar operaciones. */
export const CashEventLedgerPanel=()=>{
  const [expanded,setExpanded]=useState(false);
  const [to,setTo]=useState(todayIso);
  const [from,setFrom]=useState(()=>dateBefore(todayIso(),29));
  const [page,setPage]=useState(1);
  const [revision,setRevision]=useState(0);
  const [data,setData]=useState<CashEventLedger|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [exportError,setExportError]=useState<string|null>(null);
  const [exporting,setExporting]=useState(false);
  const request=useRef(0);
  const invalid=validateRetailDateRange(from,to);
  useEffect(()=>{
    if(!expanded){request.current++;return;}
    if(invalid){request.current++;setData(null);setBusy(false);setError(invalid);return;}
    const id=++request.current;
    setBusy(true);setError(null);setData(null);
    void fetchCashEventLedger(from,to,page).then(result=>{
      if(id===request.current)setData(result);
    }).catch((e:unknown)=>{
      if(id===request.current){setData(null);setError(e instanceof Error?e.message:"No se pudo consultar la bitácora de caja.");}
    }).finally(()=>{if(id===request.current)setBusy(false);});
    return()=>{request.current++;};
  },[expanded,from,to,page,revision,invalid]);
  const pages=data?Math.max(1,Math.ceil(data.total/data.pageSize)):1;
  const exportLedger=async()=>{
    if(!data||busy||error||exporting||invalid)return;
    setExporting(true);setExportError(null);
    try{
      const items=await collectCashLedgerForExport(from,to,null);
      const csv=buildCashLedgerCsv({from,to,siteId:null,items});
      const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
      try{
        const link=document.createElement("a");
        link.href=url;
        link.download=`nexora-auditoria-caja-${from}-${to}.csv`;
        document.body.appendChild(link);
        link.click();link.remove();
      }finally{URL.revokeObjectURL(url);}
    }catch(reason:unknown){
      setExportError(reason instanceof Error?reason.message:"No fue posible verificar todas las páginas de la bitácora.");
    }finally{setExporting(false);}
  };
  return <section aria-label="Bitácora de eventos de caja multisede"
    className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-sky-50 via-white to-violet-50 p-5 dark:from-slate-950 dark:via-slate-900 dark:to-sky-950 sm:p-6">
      <div className="flex max-w-2xl items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-400/10 dark:text-sky-200">
          <ClipboardList className="size-5" aria-hidden="true"/>
        </span>
        <div>
          <h3 className="text-base font-bold tracking-tight sm:text-lg">Bitácora de caja por responsable</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Acciones registradas en Supabase: quién abrió, autorizó un gasto,
            cerró o reabrió cada jornada comercial.
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" aria-controls="nexora-cash-ledger"
        aria-expanded={expanded} disabled={exporting} onClick={()=>setExpanded(x=>!x)}
        className="border-slate-300 bg-white/80 text-slate-900 dark:border-slate-600 dark:bg-white/10 dark:text-white">
        {expanded?"Ocultar bitácora":"Ver bitácora de caja"}
        {expanded?<ChevronUp className="size-4"/>:<ChevronDown className="size-4"/>}
      </Button>
    </div>
    {expanded?<div id="nexora-cash-ledger" className="space-y-4 border-t p-4 sm:p-6">
      <p className="flex items-start gap-2 rounded-xl border bg-muted/15 p-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0"/>
        Solo Administrador. El actor y la fecha pertenecen al evento original; el estado
        actual de la sesión puede haber cambiado posteriormente. Solo consulta, sin editar caja.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1.5 text-xs font-semibold">
          <span>Desde</span><Input type="date" aria-label="Desde eventos de caja" value={from} disabled={exporting}
            onChange={e=>{setFrom(e.target.value);setPage(1);}} className="min-w-[150px]"/>
        </label>
        <label className="space-y-1.5 text-xs font-semibold">
          <span>Hasta</span><Input type="date" aria-label="Hasta eventos de caja" value={to} disabled={exporting}
            onChange={e=>{setTo(e.target.value);setPage(1);}} className="min-w-[150px]"/>
        </label>
        <Button size="sm" variant="outline" disabled={busy||exporting||Boolean(invalid)}
          onClick={()=>setRevision(x=>x+1)}>
          <RefreshCw className="size-4"/> Actualizar eventos
        </Button>
        <Button size="sm" variant="outline"
          disabled={busy||exporting||!data||Boolean(error)||Boolean(invalid)}
          onClick={()=>{void exportLedger();}}>
          <Download className="size-4"/>
          {exporting?"Verificando CSV…":"Descargar bitácora CSV"}
        </Button>
      </div>
      {exportError?<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
        {exportError} No se descargó ningún archivo incompleto.
      </p>:null}
      {busy?<p role="status" className="rounded-xl border bg-muted/15 p-4 text-sm text-muted-foreground">
        Verificando eventos y responsables en Supabase…
      </p>:null}
      {error?<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
        <LockKeyhole className="mr-2 inline size-4"/>{error}
      </p>:null}
      {data?<div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {data.total} eventos confirmados · página {page} de {pages}
        </p>
        {data.items.length===0?<p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          No hay eventos reales de caja en este período. El historial anterior de la plataforma no se modifica.
        </p>:
          <ol className="space-y-3" aria-label="Cronología de acciones de caja">
            {data.items.map(event=><li key={event.eventId}
              className="rounded-xl border bg-muted/10 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${colors[event.action]}`}>
                  {labels[event.action]}
                </span>
                <time dateTime={event.occurredAt} className="text-xs text-muted-foreground">
                  {localDate(event.occurredAt)}
                </time>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <p><strong>Local:</strong> {event.siteName} · {event.cityName}</p>
                <p><strong>Responsable:</strong> {event.actorName??event.actorEmail}
                  <span className="ml-1 text-xs text-muted-foreground">({event.actorEmail})</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Jornada {event.businessDate} · Estado actual: {event.currentSessionState==="closed"?"cerrada":"abierta"}
                </p>
                <p className="text-xs text-muted-foreground">Evento #{event.eventId}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                {event.amount!==null?<span className="flex items-center gap-1">
                  <Banknote className="size-3.5"/> Monto: <strong>{cop(event.amount)}</strong>
                </span>:null}
                {event.expected!==null?<span>Efectivo esperado: <strong>{cop(event.expected)}</strong></span>:null}
                {event.counted!==null?<span>Efectivo contado: <strong>{cop(event.counted)}</strong></span>:null}
                {event.priorClosingDifference!==null?<span>Anterior diferencia de cierre: <strong>{cop(event.priorClosingDifference)}</strong></span>:null}
              </div>
              {event.note?<p className="mt-2 rounded-lg bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                Motivo registrado: {event.note}
              </p>:null}
            </li>)}
          </ol>}
        {data.total>data.pageSize?<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs">
          <span>Página {page} de {pages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy||exporting||page===1}
              onClick={()=>setPage(p=>Math.max(1,p-1))}><ArrowLeft className="size-4"/>Anterior</Button>
            <Button size="sm" variant="outline" disabled={busy||exporting||page>=pages}
              onClick={()=>setPage(p=>p+1)}>Siguiente<ArrowRight className="size-4"/></Button>
          </div>
        </div>:null}
      </div>:null}
    </div>:null}
  </section>;
};
