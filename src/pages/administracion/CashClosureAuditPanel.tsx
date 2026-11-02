import { useEffect,useRef,useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronDown, ChevronUp, ClipboardList, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayIso } from "@/lib/format";
import { validateRetailDateRange } from "@/lib/nexora-retail-site-finance";
import { fetchCashClosureAudit,type CashClosureAuditReport } from "@/lib/nexora-cash-closure-audit";

const cop=(n:number)=>new Intl.NumberFormat("es-CO",{
  style:"currency",currency:"COP",maximumFractionDigits:0,
}).format(n);
const dateBefore=(day:string,days:number)=>{
  const d=new Date(day+"T00:00:00Z");
  d.setUTCDate(d.getUTCDate()-days);
  return d.toISOString().slice(0,10);
};
const dateTime=(value:string|null)=>value?
  new Date(value).toLocaleString("es-CO",{timeZone:"America/Bogota",dateStyle:"short",timeStyle:"short"}):"—";

/** Registro de arqueos históricos para Administrador, sin botones operativos. */
export const CashClosureAuditPanel=()=>{
  const [expanded,setExpanded]=useState(false);
  const [to,setTo]=useState(todayIso);
  const [from,setFrom]=useState(()=>dateBefore(todayIso(),29));
  const [page,setPage]=useState(1);
  const [revision,setRevision]=useState(0);
  const [report,setReport]=useState<CashClosureAuditReport|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const request=useRef(0);
  const invalid=validateRetailDateRange(from,to);
  useEffect(()=>{
    if(!expanded){request.current++;return;}
    if(invalid){request.current++;setReport(null);setBusy(false);setError(invalid);return;}
    const token=++request.current;
    setBusy(true);setReport(null);setError(null);
    void fetchCashClosureAudit(from,to,null,page).then(result=>{
      if(token===request.current)setReport(result);
    }).catch((e:unknown)=>{
      if(token===request.current){setReport(null);setError(e instanceof Error?e.message:"No fue posible consultar los cierres.");}
    }).finally(()=>{if(token===request.current)setBusy(false);});
    return()=>{request.current++;};
  },[expanded,from,to,page,revision,invalid]);
  const pages=report?Math.max(1,Math.ceil(report.total/report.pageSize)):1;
  const differences=report?.items.filter(item=>item.hasCashDifference).length??0;
  const integrity=report?.items.filter(item=>item.hasIntegrityMismatch).length??0;
  return <section aria-label="Auditoría histórica de jornadas de caja"
    className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-amber-50 via-white to-sky-50 p-5 dark:from-slate-950 dark:via-slate-900 dark:to-amber-950 sm:p-6">
      <div className="flex max-w-2xl items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
          <ClipboardList className="size-5" aria-hidden="true"/>
        </span>
        <div>
          <h3 className="text-base font-bold tracking-tight sm:text-lg">Auditoría de arqueos y cierres</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Revisa el efectivo esperado frente al contado, diferencias registradas y
            reaperturas extraordinarias de cada jornada y local.
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" aria-expanded={expanded}
        aria-controls="nexora-cash-closure-audit" onClick={()=>setExpanded(x=>!x)}
        className="border-slate-300 bg-white/80 text-slate-900 hover:bg-white dark:border-slate-600 dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
        {expanded?"Ocultar auditoría":"Ver auditoría"}
        {expanded?<ChevronUp className="size-4"/>:<ChevronDown className="size-4"/>}
      </Button>
    </div>
    {expanded?<div id="nexora-cash-closure-audit" className="space-y-4 border-t p-4 sm:p-6">
      <p className="flex items-start gap-2 rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0"/>
        Acceso exclusivo de Administrador. Las discrepancias de efectivo no equivalen
        necesariamente a errores de integridad: se revisan por separado. Esta vista
        no modifica cajas ni registra movimientos.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1.5 text-xs font-semibold">
          <span>Desde</span><Input type="date" aria-label="Desde auditoría" value={from}
            onChange={e=>{setFrom(e.target.value);setPage(1);}} className="min-w-[150px]"/>
        </label>
        <label className="space-y-1.5 text-xs font-semibold">
          <span>Hasta</span><Input type="date" aria-label="Hasta auditoría" value={to}
            onChange={e=>{setTo(e.target.value);setPage(1);}} className="min-w-[150px]"/>
        </label>
        <Button size="sm" variant="outline" disabled={busy||Boolean(invalid)}
          onClick={()=>setRevision(v=>v+1)}>
          <RefreshCw className="size-4"/> Actualizar cierres
        </Button>
      </div>
      {error?<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
        {error}
      </p>:null}
      {busy?<p role="status" className="rounded-xl border bg-muted/10 p-4 text-sm text-muted-foreground">
        Verificando jornadas y arqueos en Supabase…
      </p>:null}
      {report?<div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {report.total} jornadas en el período · en esta página:
          {" "}{differences} con diferencias de efectivo · {integrity} con inconsistencias de conciliación
        </p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left">Jornada / local</th>
                <th className="px-3 py-3 text-left">Estado</th>
                <th className="px-3 py-3 text-right">Apertura</th>
                <th className="px-3 py-3 text-right">Ventas efectivo</th>
                <th className="px-3 py-3 text-right">Gastos</th>
                <th className="px-3 py-3 text-right">Esperado</th>
                <th className="px-3 py-3 text-right">Contado</th>
                <th className="px-3 py-3 text-right">Diferencia</th>
                <th className="px-3 py-3 text-right">Reaperturas</th>
                <th className="px-3 py-3 text-left">Conciliación</th>
              </tr>
            </thead>
            <tbody>{report.items.map(item=><tr key={item.sessionId} className="border-t hover:bg-muted/20">
              <td className="px-3 py-3">
                <p className="font-semibold">{item.businessDate}</p>
                <p className="text-xs">{item.siteName}</p>
                <p className="text-xs text-muted-foreground">{item.cityName}</p>
              </td>
              <td className="px-3 py-3 text-xs">
                <span className="font-semibold">{item.state==="closed"?"Cerrada":"Abierta"}</span>
                <p className="mt-1 text-muted-foreground">Apertura {dateTime(item.openedAt)}</p>
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{cop(item.openingCash)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{cop(item.cashSales)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{cop(item.authorizedExpenses)}</td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums">{cop(item.expectedCashCalculated)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{item.countedCash===null?"—":cop(item.countedCash)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{item.recordedDifference===null?"—":cop(item.recordedDifference)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{item.reopenCount}</td>
              <td className="px-3 py-3">
                {item.hasIntegrityMismatch?
                  <span className="inline-flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-300">
                    <AlertTriangle className="size-4"/> Inconsistente
                  </span>:
                  item.state==="open"?<span className="text-xs text-muted-foreground">Pendiente de cierre</span>:
                  item.hasCashDifference?
                    <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="size-4"/> Diferencia documentada
                    </span>:<span className="font-semibold text-emerald-800 dark:text-emerald-300">Conciliada</span>}
              </td>
            </tr>)}</tbody>
          </table>
          {report.items.length===0?<p className="border-t p-5 text-center text-sm text-muted-foreground">
            No existen jornadas de caja reales en este período. No se generan datos simulados.
          </p>:null}
        </div>
        {report.total>report.pageSize?<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
          <span>Página {page} de {pages}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={busy||page===1}
              onClick={()=>setPage(p=>Math.max(1,p-1))}>
              <ArrowLeft className="size-4"/>Anterior
            </Button>
            <Button size="sm" variant="outline" disabled={busy||page>=pages}
              onClick={()=>setPage(p=>p+1)}>
              Siguiente<ArrowRight className="size-4"/>
            </Button>
          </div>
        </div>:null}
      </div>:null}
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <LockKeyhole className="mt-0.5 size-4 shrink-0"/>
        Una diferencia de arqueo puede estar correctamente registrada. Una inconsistencia
        significa que el cierre almacenado no coincide con el cálculo de ventas y gastos.
      </p>
    </div>:null}
  </section>;
};
