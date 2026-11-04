import { useEffect,useRef,useState } from "react";
import { AlertCircle,BookOpenCheck,Download,FileSearch,LockKeyhole,RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/hooks/use-store";
import { buildMissingUnitCostsCsv } from "@/lib/nexora-unit-cost-template";
import {
  buildCostEvidenceCsv,fetchCostEvidenceReport,type CostEvidenceReport,
} from "@/lib/nexora-cost-evidence";
const fmt=(value:number)=>new Intl.NumberFormat("es-CO").format(value);
/** Lista de soportes: identifica recepciones prioritarias; no corrige costos automáticamente. */
export const CostEvidencePanel=()=>{
  const {db}=useStore();
  const [expanded,setExpanded]=useState(false);
  const [revision,setRevision]=useState(0);
  const [report,setReport]=useState<CostEvidenceReport|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const request=useRef(0);
  useEffect(()=>{
    if(!expanded){request.current++;return;}
    const id=++request.current;
    setBusy(true);setError(null);setReport(null);
    void fetchCostEvidenceReport().then(data=>{
      if(id===request.current)setReport(data);
    }).catch((e:unknown)=>{
      if(id===request.current)setError(e instanceof Error?e.message:"No se pudo verificar el diagnóstico de costos.");
    }).finally(()=>{if(id===request.current)setBusy(false);});
    return()=>{request.current++;};
  },[expanded,revision]);
  const download=()=>{
    if(!report||busy)return;
    try{
      const csv=buildCostEvidenceCsv(report);
      const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
      try{
        const a=document.createElement("a");a.href=url;
        a.download=`nexora-soportes-costos-${report.snapshotAt.slice(0,10)}.csv`;
        document.body.appendChild(a);a.click();a.remove();
      }finally{URL.revokeObjectURL(url);}
      setError(null);
    }catch(e:unknown){
      setError(e instanceof Error?e.message:"No se pudo preparar el CSV.");
    }
  };
  const downloadMissingUnitCsv=()=>{
    try{
      const csv=buildMissingUnitCostsCsv({
        units:db.units,products:db.products,receptions:db.receptions,
      });
      const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
      try{
        const a=document.createElement("a");
        a.href=url;
        a.download="nexora-costos-reales-pendientes-por-imei.csv";
        document.body.appendChild(a);a.click();a.remove();
      }finally{URL.revokeObjectURL(url);}
    }catch(error){
      setError(error instanceof Error?error.message:"No se pudo generar la planilla de IMEI.");
    }
  };
  return <section aria-label="Diagnóstico documental de costos"
    className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-amber-50 via-white to-sky-50 p-5 dark:from-amber-950/40 dark:via-slate-900 dark:to-sky-950/50 sm:p-6">
      <div className="flex max-w-2xl items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-900 dark:bg-amber-300/10 dark:text-amber-200">
          <FileSearch className="size-5" aria-hidden="true"/>
        </span>
        <div>
          <h3 className="text-base font-bold tracking-tight sm:text-lg">Recuperación documental de costos por recepción</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Localiza primero las recepciones que concentran equipos sin costo individual
            y reúne las facturas originales. Ningún costo se calcula ni se cambia automáticamente.
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={()=>setExpanded(v=>!v)}
        aria-expanded={expanded} aria-controls="nexora-evidence-receipts"
        className="border-slate-300 bg-white/80 text-slate-900 dark:border-slate-600 dark:bg-white/10 dark:text-white">
        <BookOpenCheck className="size-4"/>{expanded?"Ocultar diagnóstico":"Consultar recepciones"}
      </Button>
    </div>
    {expanded?<div id="nexora-evidence-receipts" className="space-y-4 border-t p-4 sm:p-6">
      <p className="flex items-start gap-2 rounded-xl border bg-muted/15 p-3 text-xs text-muted-foreground">
        <LockKeyhole className="mt-0.5 size-4 shrink-0"/>
        Acceso de Administrador, solo lectura. La recepción asociada es una pista
        para buscar documentos, no un soporte financiero validado ni prueba del costo de cada IMEI.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={()=>setRevision(x=>x+1)} disabled={busy}>
          <RefreshCw className="size-4"/> Actualizar diagnóstico
        </Button>
        <Button size="sm" variant="outline" disabled={busy||!report}
          onClick={download}>
          <Download className="size-4"/> Descargar planilla de facturas CSV
        </Button>
        <Button size="sm" variant="outline" disabled={busy}
          onClick={downloadMissingUnitCsv}>
          <Download className="size-4"/> Planilla por IMEI sin costo
        </Button>
      </div>
      {busy?<p role="status" className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
        Agrupando las unidades reales por recepción en Supabase…
      </p>:null}
      {error?<p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
        <AlertCircle className="mt-0.5 size-4 shrink-0"/>{error}
      </p>:null}
      {report?<div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            {label:"Unidades físicas",value:report.eligible},
            {label:"Sin costo válido",value:report.withoutCost},
            {label:"Con costo válido",value:report.withCost},
            {label:"Recepciones a revisar",value:report.receipts},
          ].map(row=><div key={row.label} className="rounded-xl border bg-muted/20 p-3">
            <p className="text-2xl font-bold tabular-nums">{fmt(row.value)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{row.label}</p>
          </div>)}
        </div>
        {report.items.length===0?<p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          No se encontraron unidades elegibles ni recepciones pendientes en este corte.
        </p>:
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[650px] text-sm">
            <caption className="sr-only">Recepciones priorizadas para recuperar facturas reales</caption>
            <thead className="bg-muted/50 text-left text-xs">
              <tr><th scope="col" className="px-3 py-3">Recepción</th>
                <th scope="col" className="px-3 py-3">Proveedor</th>
                <th scope="col" className="px-3 py-3">Fecha</th>
                <th scope="col" className="px-3 py-3 text-right">Sin costo</th>
                <th scope="col" className="px-3 py-3 text-right">Unidades</th>
                <th scope="col" className="px-3 py-3 text-right">Referencias</th>
              </tr>
            </thead>
            <tbody>{report.items.map((r,i)=><tr
              key={r.receptionId??"sin-recepcion"} className="border-t hover:bg-muted/20">
              <td className="px-3 py-3 font-semibold">
                <span className="block">{r.receptionCode}</span>
                {i===0&&r.withoutCost>0?<span className="text-xs font-normal text-amber-700 dark:text-amber-300">Prioridad documental</span>:null}
              </td>
              <td className="px-3 py-3 text-muted-foreground">{r.supplierName??"Sin proveedor identificado"}</td>
              <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                {r.receivedAt?new Date(r.receivedAt).toLocaleDateString("es-CO",{timeZone:"America/Bogota"}):"Sin fecha"}
              </td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums">{fmt(r.withoutCost)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{fmt(r.eligible)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{fmt(r.referencesCount)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <p className="text-xs text-muted-foreground">
          Corte {new Date(report.snapshotAt).toLocaleString("es-CO",{timeZone:"America/Bogota"})}.
          La planilla reserva espacios para ingresar número de factura, soporte encontrado y observaciones.
          No imputa montos ni modifica unidades.
        </p>
      </div>:null}
    </div>:null}
  </section>;
};
