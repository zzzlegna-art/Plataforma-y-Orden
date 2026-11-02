import { useState } from "react";
import { ClipboardCheck,Download,FileSpreadsheet,LockKeyhole,ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildInitialCountWorklistCsv,fetchInitialCountWorklist,
  type InitialCountWorklist,
} from "@/lib/nexora-initial-count-worklist";

const fmt=(number:number)=>new Intl.NumberFormat("es-CO").format(number);

/** Solo lectura: exporta una foto verificable para inspección física, sin cambiar stock. */
export const InitialCountWorklistPanel=()=>{
  const [busy,setBusy]=useState(false);
  const [report,setReport]=useState<InitialCountWorklist|null>(null);
  const [error,setError]=useState<string|null>(null);
  const download=async()=>{
    if(busy)return;
    setBusy(true);setError(null);setReport(null);
    try{
      const data=await fetchInitialCountWorklist();
      const csv=buildInitialCountWorklistCsv(data);
      setReport(data);
      const filename=`nexora-planilla-conteo-fisico-${data.snapshotAt.slice(0,10)}.csv`;
      const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
      try{
        const a=document.createElement("a");
        a.href=url;a.download=filename;
        document.body.appendChild(a);a.click();a.remove();
      }finally{URL.revokeObjectURL(url);}
    }catch(e:unknown){
      setReport(null);
      setError(e instanceof Error?e.message:"No se pudo obtener la planilla de Supabase.");
    }finally{setBusy(false);}
  };
  return <section aria-label="Planilla de inspección física de inventario"
    className="overflow-hidden rounded-2xl border border-sky-200 bg-card shadow-sm dark:border-slate-700">
    <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-sky-50 via-white to-emerald-50 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950 sm:p-6">
      <div className="flex max-w-2xl items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-900 dark:bg-sky-400/10 dark:text-sky-200">
          <FileSpreadsheet className="size-5"/>
        </span>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-950 dark:text-white sm:text-lg">
            Planilla para conteo físico por IMEI
          </h3>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Descarga todos los equipos elegibles y anota dónde están realmente.
            Los vendidos o liberados quedan excluidos. Incluye costos faltantes
            y observaciones aún no aprobadas.
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" disabled={busy}
        onClick={()=>{void download();}}
        className="border-sky-300 bg-white text-sky-950 hover:bg-sky-50 dark:border-sky-400/30 dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
        <Download className="size-4"/>
        {busy?"Verificando inventario…":"Descargar planilla CSV"}
      </Button>
    </div>
    <div className="space-y-3 border-t p-4 sm:p-5">
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <LockKeyhole className="mt-0.5 size-4 shrink-0"/>
        Solo Administrador. Es un listado de verificación, NO una asignación de mercancía.
        La ubicación histórica es informativa y nunca acredita presencia física.
        Ningún equipo cambia de sede al descargar el archivo.
      </p>
      {busy?<p role="status" className="text-sm text-muted-foreground">
        Comprobando registros y cotejos directamente en Supabase…
      </p>:null}
      {error?<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
        {error}. No se descargó una planilla parcial.
      </p>:null}
      {report?<div className="space-y-3" aria-label="Resumen de planilla de conteo">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            {label:"Elegibles",value:report.eligible},
            {label:"Pendientes",value:report.pending},
            {label:"Por revisar",value:report.stale},
            {label:"Sin costo individual válido",value:report.withoutValidCost},
          ].map(row=><div key={row.label} className="rounded-xl border bg-muted/20 p-3">
            <p className="text-lg font-bold tabular-nums">{fmt(row.value)}</p>
            <p className="text-xs text-muted-foreground">{row.label}</p>
          </div>)}
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ClipboardCheck className="mt-0.5 size-4 shrink-0"/>
          {fmt(report.verified)} IMEI cotejados provisionalmente ·
          {fmt(report.excludedHistorical)} registros históricos no elegibles excluidos.
          Los costos faltantes deberán recuperarse de documentos reales; no se estiman.
        </p>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0"/>
          Archivo generado con un único corte verificado: {new Date(report.snapshotAt).toLocaleString("es-CO",{timeZone:"America/Bogota"})}.
        </p>
      </div>:null}
    </div>
  </section>;
};
