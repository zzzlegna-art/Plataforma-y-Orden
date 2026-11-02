import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, BarChart3, ChevronDown, ChevronUp, Coins, Download, LockKeyhole, RefreshCw, ShieldCheck, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayIso } from "@/lib/format";
import { buildRetailSiteFinancialCsv } from "@/lib/nexora-retail-site-finance-csv";
import {
  calculateRetailReportTotals,fetchRetailSiteFinancialReport,
  validateRetailDateRange,type RetailSiteFinancialReport,
} from "@/lib/nexora-retail-site-finance";

const currency=(n:number)=>new Intl.NumberFormat("es-CO",{
  style:"currency",currency:"COP",maximumFractionDigits:0,
}).format(n);
const format=(n:number)=>new Intl.NumberFormat("es-CO").format(n);
const daysBefore=(day:string,delta:number)=>{
  const date=new Date(day+"T00:00:00Z");
  date.setUTCDate(date.getUTCDate()-delta);
  return date.toISOString().slice(0,10);
};

/** Informe administrativo: solo retail real; sin nuevas facultades sobre caja/POS. */
export const RetailSiteFinancePanel=()=>{
  const [expanded,setExpanded]=useState(false);
  const [to,setTo]=useState(todayIso);
  const [from,setFrom]=useState(()=>daysBefore(todayIso(),29));
  const [report,setReport]=useState<RetailSiteFinancialReport|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [revision,setRevision]=useState(0);
  const request=useRef(0);
  const invalid=validateRetailDateRange(from,to);

  useEffect(()=>{
    if(!expanded){request.current++;return;}
    if(invalid){request.current++;setReport(null);setBusy(false);setError(invalid);return;}
    const current=++request.current;
    setBusy(true);
    setError(null);
    setReport(null);
    void fetchRetailSiteFinancialReport(from,to).then(result=>{
      if(current===request.current)setReport(result);
    }).catch((reason:unknown)=>{
      if(current===request.current){
        setReport(null);
        setError(reason instanceof Error?reason.message:"No fue posible consultar el informe minorista.");
      }
    }).finally(()=>{if(current===request.current)setBusy(false);});
    return()=>{request.current++;};
  },[expanded,from,to,revision,invalid]);

  const handleExport=()=>{
    if(!report||busy||invalid||error)return;
    try{
      const csv=buildRetailSiteFinancialCsv(report);
      const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      try{
        const link=document.createElement("a");
        link.href=url;
        link.download=`nexora-finanzas-retail-${report.from}-${report.to}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }finally{URL.revokeObjectURL(url);}
    }catch(reason:unknown){
      setError(reason instanceof Error?reason.message:"No se pudo generar el CSV validado.");
    }
  };
  const totals=calculateRetailReportTotals(report?.stores??[]);
  return <section aria-label="Reporte histórico minorista por sede"
    className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-5 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 sm:p-6">
      <div className="flex max-w-2xl items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-900 dark:bg-violet-400/10 dark:text-violet-200">
          <BarChart3 className="size-5" aria-hidden="true"/>
        </span>
        <div>
          <h3 className="text-base font-bold tracking-tight sm:text-lg">Informe financiero por local</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Historial de ventas minoristas confirmadas, costo real de cada IMEI,
            margen bruto, gastos y arqueos por sede.
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" aria-expanded={expanded}
        aria-controls="nexora-financial-site-report"
        onClick={()=>setExpanded(v=>!v)}
        className="border-slate-300 bg-white/80 text-slate-900 hover:bg-white dark:border-slate-600 dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
        {expanded?"Ocultar informe":"Ver informe histórico"}
        {expanded?<ChevronUp className="size-4"/>:<ChevronDown className="size-4"/>}
      </Button>
    </div>
    {expanded?<div id="nexora-financial-site-report" className="space-y-4 border-t p-4 sm:p-6">
      <p className="flex items-start gap-2 rounded-xl border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0"/>
        Solo consulta para Administrador. Cifras provenientes de ventas minoristas y cajas
        registradas en Supabase; no incluyen ventas mayoristas, impuestos, costos financieros
        ni traslados contables entre sedes. «Margen menos gastos» no es utilidad neta.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1.5 text-xs font-semibold">
          <span>Desde</span>
          <Input aria-label="Desde" type="date" value={from}
            onChange={e=>setFrom(e.target.value)} className="w-full min-w-[150px]"/>
        </label>
        <label className="space-y-1.5 text-xs font-semibold">
          <span>Hasta</span>
          <Input aria-label="Hasta" type="date" value={to}
            onChange={e=>setTo(e.target.value)} className="w-full min-w-[150px]"/>
        </label>
        <Button size="sm" variant="outline" disabled={busy||Boolean(invalid)}
          onClick={()=>setRevision(v=>v+1)}>
          <RefreshCw className="size-4"/> Actualizar informe
        </Button>
        <Button size="sm" variant="outline" disabled={busy||Boolean(invalid)||!report||Boolean(error)}
          onClick={handleExport}>
          <Download className="size-4"/> Descargar CSV de sedes
        </Button>
      </div>
      {error?<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
        {error}
      </p>:null}
      {busy?<p role="status" className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
        Verificando ventas y arqueos del período en Supabase…
      </p>:null}
      {report?<div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {name:"Ingresos retail",value:totals.revenue,icon:Coins},
            {name:"Margen bruto",value:totals.grossProfit,icon:BarChart3},
            {name:"Gastos autorizados",value:totals.authorizedExpenses,icon:ArrowRightLeft},
            {name:"Margen menos gastos*",value:totals.grossAfterExpenses,icon:Store},
          ].map(item=><div key={item.name} className="rounded-xl border bg-muted/10 p-3 sm:p-4">
            <item.icon className="mb-2 size-4 text-violet-700 dark:text-violet-300"/>
            <p className="text-lg font-bold tabular-nums sm:text-xl">{currency(item.value)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.name}</p>
          </div>)}
        </div>
        <p className="text-xs text-muted-foreground">
          {format(totals.unitsSold)} IMEI vendidos · {format(totals.sessions)} jornadas de caja ·
          {" "}{format(totals.openSessions)} abiertas ·
          Efectivo {currency(totals.cashRevenue)} · Transferencias {currency(totals.transferRevenue)}
        </p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[930px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left">Ciudad / local</th>
                <th className="px-3 py-3 text-right">IMEI vendidos</th>
                <th className="px-3 py-3 text-right">Ventas</th>
                <th className="px-3 py-3 text-right">Costo IMEI</th>
                <th className="px-3 py-3 text-right">Margen bruto</th>
                <th className="px-3 py-3 text-right">Gastos</th>
                <th className="px-3 py-3 text-right">Margen - gastos*</th>
                <th className="px-3 py-3 text-right">Diferencia arqueo</th>
              </tr>
            </thead>
            <tbody>
              {report.stores.map(site=><tr key={site.siteId} className="border-t hover:bg-muted/20">
                <th scope="row" className="px-3 py-3 text-left font-medium">
                  <span className="block">{site.siteName}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {site.cityName}{!site.active?" · Sede inactiva":""}
                  </span>
                </th>
                <td className="px-3 py-3 text-right tabular-nums">{format(site.unitsSold)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{currency(site.revenue)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{currency(site.unitCost)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{currency(site.grossProfit)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{currency(site.authorizedExpenses)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{currency(site.grossAfterExpenses)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{currency(site.closingDifference)}</td>
              </tr>)}
            </tbody>
          </table>
          {report.stores.length===0?<p className="border-t p-6 text-center text-sm text-muted-foreground">
            Aún no hay locales comerciales registrados. Los valores permanecen en cero;
            no se inventan ventas ni costos.
          </p>:null}
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-4 shrink-0"/>
          *Margen bruto menos gastos autorizados en caja. No es utilidad neta ni
          contempla retenciones, impuestos o movimientos de dinero entre sedes.
        </p>
      </div>:null}
    </div>:null}
  </section>;
};
