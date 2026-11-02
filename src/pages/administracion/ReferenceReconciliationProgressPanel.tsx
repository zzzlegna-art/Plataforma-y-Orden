import { useMemo,useRef,useState } from "react";
import {
  AlertTriangle,BarChart3,ClipboardCheck,Download,LockKeyhole,
  PackageSearch,RefreshCw,ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchInitialCountWorklist,type InitialCountWorklist,
} from "@/lib/nexora-initial-count-worklist";
import {
  buildInitialCountReferenceCsv,summarizeInitialCountByReference,
  type ReferenceProgressReport,
} from "@/lib/nexora-reference-count-progress";

const fmt=(value:number)=>new Intl.NumberFormat("es-CO").format(value);
type Filter="all"|"pending"|"stale";
export const ReferenceReconciliationProgressPanel=()=>{
  const [snapshot,setSnapshot]=useState<InitialCountWorklist|null>(null);
  const [report,setReport]=useState<ReferenceProgressReport|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [filter,setFilter]=useState<Filter>("all");
  const [query,setQuery]=useState("");
  const [expanded,setExpanded]=useState(false);
  const generation=useRef(0);
  const refresh=async()=>{
    if(busy)return;
    const id=++generation.current;
    setBusy(true);setError(null);setSnapshot(null);setReport(null);
    try{
      const result=await fetchInitialCountWorklist();
      const grouped=summarizeInitialCountByReference(result);
      if(generation.current===id){setSnapshot(result);setReport(grouped);}
    }catch(e:unknown){
      if(generation.current===id)
        setError(e instanceof Error?e.message:"No se pudo comprobar el avance por referencia.");
    }finally{if(generation.current===id)setBusy(false);}
  };
  const filtered=useMemo(()=>{
    if(!report)return [];
    const word=query.trim().toLocaleLowerCase("es");
    return report.references.filter(row=>
      (filter==="all"||filter==="pending"&&row.pending>0||
        filter==="stale"&&row.stale>0) &&
      (!word||row.sku.toLocaleLowerCase("es").includes(word)||
        row.productName.toLocaleLowerCase("es").includes(word)));
  },[report,filter,query]);
  const listed=expanded?filtered:filtered.slice(0,15);
  const exportCsv=()=>{
    if(!snapshot||!report||busy)return;
    try{
      const csv=buildInitialCountReferenceCsv(snapshot);
      const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
      try{
        const a=document.createElement("a");
        a.href=url;
        a.download=`nexora-avance-fisico-por-referencia-${report.snapshotAt.slice(0,10)}.csv`;
        document.body.appendChild(a);a.click();a.remove();
      }finally{URL.revokeObjectURL(url);}
      setError(null);
    }catch(e:unknown){
      setError(e instanceof Error?e.message:"No fue posible generar el CSV verificado.");
    }
  };
  const percentage=report&&report.eligible>0?Math.round(report.verified/report.eligible*100):0;
  return <section className="overflow-hidden rounded-2xl border bg-card shadow-sm"
    aria-label="Avance de conciliación por referencia">
    <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-sky-50 via-white to-indigo-50 p-5 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 sm:p-6">
      <div className="flex max-w-2xl items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-900 dark:bg-sky-400/10 dark:text-sky-200">
          <BarChart3 className="size-5"/>
        </span>
        <div>
          <h3 className="text-base font-bold tracking-tight sm:text-lg">
            Avance del conteo físico por referencia
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Identifica referencias pendientes, cotejos provisionales y observaciones
            desactualizadas por IMEI. Todo se calcula desde el inventario real.
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" disabled={busy}
        className="border-sky-300 bg-white text-sky-950 hover:bg-sky-50 dark:border-sky-400/30 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
        onClick={()=>{void refresh();}}>
        <RefreshCw className="size-4"/>
        {busy?"Verificando…":report?"Actualizar avance":"Consultar avance"}
      </Button>
    </div>
    <div className="space-y-4 border-t p-4 sm:p-6">
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <LockKeyhole className="mt-0.5 size-4 shrink-0"/>
        Consulta exclusiva de Administrador. **Pendiente** significa sin lectura física,
        NO es un faltante comprobado. **Cotejado** es evidencia provisional,
        NO inventario aprobado ni mercancía vendible.
      </p>
      {busy?<p role="status" className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
        Verificando todas las unidades elegibles y sus cotejos directamente en Supabase…
      </p>:null}
      {error?<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
        {error} No se mostrarán datos parciales.
      </p>:null}
      {!busy&&!report&&!error?<p className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <PackageSearch className="size-4"/> Consulta el estado real del inventario cuando vayas a iniciar o revisar el conteo.
      </p>:null}
      {report?<div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            {label:"IMEI por cotejar",value:report.pending},
            {label:"Cotejados provisionalmente",value:report.verified},
            {label:"Cotejos por revisar",value:report.stale},
            {label:"Sin costo individual",value:report.withoutValidCost},
          ].map(row=><div key={row.label} className="rounded-xl border bg-muted/20 p-3">
            <p className="text-2xl font-bold tabular-nums">{fmt(row.value)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{row.label}</p>
          </div>)}
        </div>
        <div className="rounded-xl border bg-muted/10 p-3">
          <div className="mb-2 flex justify-between gap-3 text-xs">
            <span className="font-medium">Avance del cotejo físico provisional</span>
            <span className="font-semibold tabular-nums">{percentage}%</span>
          </div>
          <div role="progressbar" aria-label="Porcentaje de IMEI cotejados provisionalmente"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}
            className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-sky-700 transition-all dark:bg-sky-400"
              style={{width:`${percentage}%`}}/>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {fmt(report.eligible)} elegibles en {fmt(report.references.length)} referencias.
            {fmt(report.excludedHistorical)} históricos no elegibles excluidos.
          </p>
        </div>
        {report.stale>0?<p role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0"/>
          {fmt(report.stale)} observaciones ya no coinciden con el estado,
          el serial o la sede activa. Revisa y anula cada cotejo incorrecto
          con motivo antes de continuar. El CSV incluye sus IMEI.
        </p>:null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Buscar referencia del conteo" value={query}
              onChange={event=>{setQuery(event.target.value);setExpanded(false);}}
              placeholder="Buscar referencia o SKU" className="w-52"/>
            <select aria-label="Filtrar avance de referencias" value={filter}
              onChange={event=>{setFilter(event.target.value as Filter);setExpanded(false);}}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
              <option value="all">Todas</option>
              <option value="pending">Con IMEI pendientes</option>
              <option value="stale">Con cotejos por revisar</option>
            </select>
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={exportCsv}>
            <Download className="size-4"/> Exportar avance CSV
          </Button>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Avance provisional de conciliación física por referencia</caption>
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th scope="col" className="px-3 py-3 text-left">Referencia / SKU</th>
                <th scope="col" className="px-3 py-3 text-right">Elegibles</th>
                <th scope="col" className="px-3 py-3 text-right">Pendientes</th>
                <th scope="col" className="px-3 py-3 text-right">Cotejados</th>
                <th scope="col" className="px-3 py-3 text-right">Revisar</th>
                <th scope="col" className="px-3 py-3 text-right">Sin costo</th>
              </tr>
            </thead>
            <tbody>
              {listed.map(row=><tr key={JSON.stringify([row.sku,row.productName])}
                className="border-t hover:bg-muted/20">
                <td className="px-3 py-3">
                  <span className="block font-medium">{row.productName}</span>
                  <span className="block text-xs text-muted-foreground">{row.sku}</span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{fmt(row.eligible)}</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{fmt(row.pending)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{fmt(row.verified)}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {row.stale>0?<span className="font-semibold text-amber-700 dark:text-amber-300">{fmt(row.stale)}</span>:fmt(0)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{fmt(row.withoutValidCost)}</td>
              </tr>)}
            </tbody>
          </table>
          {filtered.length===0?<p className="border-t p-4 text-sm text-muted-foreground">
            No hay referencias que coincidan con ese filtro.
          </p>:null}
        </div>
        {filtered.length>15?<Button size="sm" variant="outline"
          onClick={()=>setExpanded(v=>!v)}>
          <ClipboardCheck className="size-4"/>
          {expanded?"Mostrar solo primeras 15":`Ver las ${fmt(filtered.length)} referencias`}
        </Button>:null}
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0"/>
          Corte verificado: {new Date(report.snapshotAt).toLocaleString("es-CO",{timeZone:"America/Bogota"})}.
          Solo datos de lectura. El archivo conserva todas las referencias aunque se filtre la tabla.
        </p>
      </div>:null}
    </div>
  </section>;
};
