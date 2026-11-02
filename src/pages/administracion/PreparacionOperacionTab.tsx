import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowRight, BadgeCheck, Building2, CircleDashed, ClipboardCheck,
  Fingerprint, LockKeyhole, MapPin, RefreshCw, ShieldCheck, Store, Users, Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  PREPARATION_STEPS,getLaunchReadiness,
  type LaunchReadiness,type PreparationStep,
} from "@/lib/nexora-launch-readiness";

const fmt=(value:number)=>new Intl.NumberFormat("es-CO").format(value);
const metricIcons=[MapPin,Building2,Warehouse,Store,Users,ClipboardCheck,Fingerprint,LockKeyhole];

export const PreparacionOperacionTab=()=>{
  const [data,setData]=useState<LaunchReadiness|null>(null);
  const [loading,setLoading]=useState(true);
  const [,setParams]=useSearchParams();
  const generation=useRef(0);
  const refresh=useCallback(async()=>{
    const current=++generation.current;
    setLoading(true);
    try{
      const result=await getLaunchReadiness();
      if(current===generation.current)setData(result);
    }catch(e){
      if(current===generation.current){
        setData(null);
        toast.error(e instanceof Error?e.message:"No fue posible verificar la preparación.");
      }
    }finally{if(current===generation.current)setLoading(false);}
  },[]);
  useEffect(()=>{
    void refresh();
    return()=>{generation.current++;};
  },[refresh]);

  const openTab=(tab:string)=>{
    setParams(previous=>{
      const next=new URLSearchParams(previous);
      next.set("tab",tab);
      return next;
    });
  };
  const verified=data?.steps.filter(s=>s.ready).length??0;
  const steps=new Map(data?.steps.map(s=>[s.key,s])??[]);
  const percent=Math.round(verified/PREPARATION_STEPS.length*100);

  return <section className="space-y-5" aria-label="Centro de preparación de Nexora Multisede">
    <div className="relative overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-br from-white via-sky-50 to-indigo-100 px-5 py-6 text-slate-900 shadow-lg shadow-sky-950/5 dark:border-slate-700 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 dark:text-slate-50 dark:shadow-black/20 sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-sky-400/15 blur-3xl dark:bg-indigo-400/10"/>
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-widest text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200">
            <ShieldCheck className="h-3.5 w-3.5"/> Control de lanzamiento
          </span>
          <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Preparar la operación multisede</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Configura sedes, vincula empleados, concilia los IMEI y completa las autorizaciones.
            Cada avance se comprueba directamente en Supabase, sin simular existencias ni activar ventas.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={loading} onClick={()=>void refresh()}
          className="border-slate-300 bg-white/80 text-slate-800 hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20">
          <RefreshCw className="h-4 w-4"/> Volver a verificar
        </Button>
      </div>
      <div className="relative mt-6 rounded-2xl border border-slate-200 bg-white/75 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-300">Preparación verificada</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{verified} <span className="text-base font-medium text-slate-500 dark:text-slate-400">de {PREPARATION_STEPS.length} pasos</span></p>
          </div>
          <span className="text-2xl font-bold tabular-nums text-sky-800 dark:text-sky-200">{percent}%</span>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
          role="progressbar" aria-label="Progreso de preparación"
          aria-valuenow={verified} aria-valuemin={0} aria-valuemax={PREPARATION_STEPS.length}>
          <div className="h-full rounded-full bg-gradient-to-r from-sky-600 to-cyan-500 transition-all dark:from-cyan-400 dark:to-emerald-300"
            style={{width:`${percent}%`}} />
        </div>
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
          {data?"Permisos de Encargado y Vendedor: aún no habilitados. Caja y POS permanecen protegidos."
            :"Consultando el estado real de Nexora..."}
        </p>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        {label:"Locales activos",value:data?.stores??0,icon:Store},
        {label:"Personal vinculado",value:data?.activeAssignments??0,icon:Users},
        {label:"IMEI por ubicar",value:data?.unmappedUnits??0,icon:Fingerprint},
        {label:"Perfiles preparados",value:data?.plannedRoles??0,icon:ShieldCheck},
      ].map(({label,value,icon:Icon})=>(
        <div key={label} className="rounded-2xl border bg-card p-4 text-card-foreground shadow-sm">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4"/></span>
          <p className="mt-3 text-2xl font-bold tabular-nums">{fmt(value)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>

    <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
      <div className="border-b bg-muted/15 p-5 sm:px-6">
        <h3 className="font-bold">Pasos para habilitar la operación</h3>
        <p className="mt-1 text-sm text-muted-foreground">En orden recomendado. Pulsa una acción para ir directamente a configurarla.</p>
      </div>
      <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2">
        {PREPARATION_STEPS.map((meta,index)=>{
          const step:PreparationStep|undefined=steps.get(meta.key);
          const Icon=metricIcons[index];
          const ready=step?.ready??false;
          return <article key={meta.key} className={`flex flex-col gap-3 rounded-2xl border p-4 transition-colors sm:p-5 ${ready?"border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/25 dark:bg-emerald-500/[0.07]":"border-border bg-background/50 hover:bg-muted/20"}`}>
            <div className="flex items-start gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${ready?"bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300":"bg-primary/10 text-primary"}`}>
                {ready?<BadgeCheck className="h-5 w-5"/>:<Icon className="h-5 w-5"/>}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">Paso {index+1}</p>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold ${ready?"text-emerald-800 dark:text-emerald-300":"text-muted-foreground"}`}>
                    {ready?<BadgeCheck className="h-3.5 w-3.5"/>:<CircleDashed className="h-3.5 w-3.5"/>}
                    {ready?"Completado":"Pendiente"}
                  </span>
                </div>
                <h4 className="mt-1 font-semibold">{meta.title}</h4>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{meta.detail}</p>
                {step?.total!==undefined?<p className="mt-2 text-xs font-semibold tabular-nums">{fmt(step.current)} de {fmt(step.total)} IMEI conciliados</p>:null}
              </div>
            </div>
            <Button variant="outline" size="sm" disabled={loading} onClick={()=>openTab(meta.tab)}
              className="mt-auto w-full justify-between bg-card text-foreground hover:bg-muted dark:bg-background/40">
              {meta.action}<ArrowRight className="h-4 w-4"/>
            </Button>
          </article>;
        })}
      </div>
    </div>

    <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5 sm:p-6">
        <div>
          <h3 className="font-bold">Preparación de cada local</h3>
          <p className="mt-1 text-sm text-muted-foreground">Personal asignado y Encargado previsto por establecimiento.</p>
        </div>
        <Button variant="outline" size="sm" onClick={()=>openTab("sites")}><Store className="h-4 w-4"/> Ir a sedes</Button>
      </div>
      {!data||data.storeDetails.length===0?<p className="p-6 text-sm text-muted-foreground">
        {loading?"Consultando locales...":"Todavía no hay locales activos. Crea el primer local desde Ciudades y sedes."}
      </p>:<div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        {data.storeDetails.map(s=><article key={s.siteId} className="rounded-xl border bg-muted/10 p-4">
          <h4 className="font-semibold">{s.name}</h4>
          <p className="mt-2 text-sm text-muted-foreground">{fmt(s.assignedStaff)} empleados asignados</p>
          <p className="mt-2 flex items-center gap-2 text-xs">
            {s.managerPlanned?<BadgeCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400"/>:<LockKeyhole className="h-4 w-4 text-amber-700 dark:text-amber-400"/>}
            {s.managerPlanned?"Encargado planificado":"Falta preparar Encargado"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {s.managerEnabled?"Encargado habilitado":"Permiso operativo aún desactivado"}
          </p>
        </article>)}
      </div>}
    </div>
    <p className="flex items-start gap-2 rounded-xl border bg-muted/10 p-4 text-xs text-muted-foreground">
      <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0"/>
      Este panel es informativo y no sustituye una autorización de inventario, caja o venta. Los perfiles
      comerciales no pueden heredar los permisos anteriores de Bodeguero al activarse.
    </p>
  </section>;
};
export default PreparacionOperacionTab;
