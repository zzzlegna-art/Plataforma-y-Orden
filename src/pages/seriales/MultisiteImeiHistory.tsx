import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Download, History, LockKeyhole, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { UnitTimelineItem } from "@/lib/selectors";
import { buildUnifiedImeiCsv, collectMultisiteEventsForExport } from "@/lib/nexora-imei-unified-csv";
import {
  fetchMultisiteImeiTimeline,
  type MultisiteImeiEvent,type MultisiteImeiTimeline,
  type MultisiteEventType,
} from "@/lib/nexora-imei-timeline";

const eventLabels:Record<MultisiteEventType,string>={
  initial_approved:"Inventario físico aprobado",
  transfer_prepared:"Manifiesto creado",
  transfer_dispatched:"Equipo despachado",
  transfer_received:"Recepción confirmada",
  transfer_return_pending:"Devolución pendiente",
  transfer_returned:"Retorno físico confirmado",
  transfer_cancelled:"Traslado cancelado",
  retail_sale:"Venta en tienda",
};
const color:Record<MultisiteEventType,string>={
  initial_approved:"border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200",
  transfer_prepared:"border-border bg-muted/40 text-muted-foreground",
  transfer_dispatched:"border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200",
  transfer_received:"border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200",
  transfer_return_pending:"border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200",
  transfer_returned:"border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200",
  transfer_cancelled:"border-border bg-muted/40 text-muted-foreground",
  retail_sale:"border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-400/25 dark:bg-indigo-400/10 dark:text-indigo-200",
};

const EventRow=({event}:{event:MultisiteImeiEvent})=>(
  <li className="relative border-l border-border pl-5">
    <span className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-primary"/>
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${color[event.eventType]}`}>
        {eventLabels[event.eventType]}
      </span>
      <time dateTime={event.eventAt} className="text-xs text-muted-foreground">
        {formatDateTime(event.eventAt)}
      </time>
    </div>
    <p className="mt-1.5 text-sm text-foreground">{event.description}</p>
    {(event.originSite||event.destinationSite)?
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="size-3.5" aria-hidden="true"/>
        {event.originSite??"—"} {event.originSite&&event.destinationSite?"→":""} {event.destinationSite??""}
      </p>:null}
    {event.reference?<p className="mt-1 text-xs font-medium text-muted-foreground">
      {event.reference}
    </p>:null}
  </li>
);

/** Complemento de solo lectura: no duplica el historial de bodega ni permite operaciones. */
export const MultisiteImeiHistory=({unitId,serial,receivedAt,legacyTimeline}:{
  unitId:string;serial:string;receivedAt:string;legacyTimeline:readonly UnitTimelineItem[];
})=>{
  const [page,setPage]=useState(1);
  const [revision,setRevision]=useState(0);
  const [timeline,setTimeline]=useState<MultisiteImeiTimeline|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [exportError,setExportError]=useState<string|null>(null);
  const [exporting,setExporting]=useState(false);
  const request=useRef(0);

  useEffect(()=>{
    const id=++request.current;
    setLoading(true);
    setError(null);
    setTimeline(null);
    void fetchMultisiteImeiTimeline(unitId,page).then(result=>{
      if(id===request.current)setTimeline(result);
    }).catch((reason:unknown)=>{
      if(id===request.current){
        setTimeline(null);
        setError(reason instanceof Error?reason.message:"No se pudo verificar el historial multisede.");
      }
    }).finally(()=>{if(id===request.current)setLoading(false);});
    return()=>{request.current++;};
  },[unitId,page,revision]);

  const pages=timeline?Math.max(1,Math.ceil(timeline.total/timeline.pageSize)):1;

  const handleExport=async()=>{
    if(exporting||loading||error)return;
    setExporting(true);
    setExportError(null);
    try{
      const multisite=await collectMultisiteEventsForExport(unitId,serial);
      const csv=buildUnifiedImeiCsv({serial,receivedAt,legacy:legacyTimeline,multisite});
      const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      try{
        const anchor=document.createElement("a");
        anchor.href=url;
        anchor.download=`hoja-de-vida-${serial.replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80)||"imei"}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }finally{URL.revokeObjectURL(url);}
    }catch(reason:unknown){
      setExportError(reason instanceof Error?reason.message:"No fue posible verificar la hoja de vida completa.");
    }finally{setExporting(false);}
  };
  return <section aria-label="Movimientos multisede del IMEI"
    className="overflow-hidden rounded-2xl border border-border/80 bg-card text-card-foreground shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-200">
          <History className="size-5" aria-hidden="true"/>
        </span>
        <div>
          <h3 className="text-sm font-bold sm:text-base">Hoja de vida · movimientos multisede</h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            Conciliación inicial, traslados, entregas, devoluciones y ventas confirmadas.
            El historial de bodega y garantías se conserva en su sección original.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline"
          disabled={loading||exporting||Boolean(error)}
          onClick={()=>{void handleExport();}}
          className="bg-background/80 dark:border-slate-700">
          <Download className="size-4"/>
          {exporting?"Preparando CSV…":"Exportar hoja de vida completa"}
        </Button>
        <Button size="sm" variant="outline" disabled={loading||exporting}
          onClick={()=>setRevision(value=>value+1)}
          className="bg-background/80 dark:border-slate-700">
          <RefreshCw className="size-4"/> Actualizar
        </Button>
      </div>
    </div>
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0"/>
        Solo se muestran movimientos respaldados por registros verificables de Supabase.
        La ausencia de movimientos multisede no significa que el equipo no tenga historial legacy.
      </div>
      {exportError?<p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
        {exportError} No se descargó ningún archivo incompleto.
      </p>:null}
      {loading?<p role="status" className="text-sm text-muted-foreground">
        Verificando los movimientos multisede del IMEI…
      </p>:null}
      {error?<div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
        <LockKeyhole className="mt-0.5 size-4 shrink-0"/>
        <span>No fue posible verificar los movimientos multisede. {error}</span>
      </div>:null}
      {!loading&&!error&&timeline?.total===0?
        <p className="rounded-lg border border-dashed bg-muted/15 p-4 text-sm text-muted-foreground">
          Sin movimientos multisede registrados para este equipo. Su historia anterior sigue disponible abajo.
        </p>:null}
      {!loading&&!error&&timeline&&timeline.items.length>0?
        <ol className="space-y-4" aria-label="Cronología de operaciones multisede">
          {timeline.items.map(event=><EventRow event={event} key={event.eventId}/>)}
        </ol>:null}
      {timeline&&timeline.total>timeline.pageSize?
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span>{timeline.total} eventos · página {page} de {pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={loading||page===1}
              onClick={()=>setPage(p=>Math.max(1,p-1))}>
              <ArrowLeft className="size-4"/>Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={loading||page>=pages}
              onClick={()=>setPage(p=>p+1)}>
              Siguiente<ArrowRight className="size-4"/>
            </Button>
          </div>
        </div>:null}
    </div>
  </section>;
};
