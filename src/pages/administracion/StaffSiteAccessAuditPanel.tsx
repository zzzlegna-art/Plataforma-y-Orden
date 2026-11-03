import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, LockKeyhole, MapPin, RefreshCw, ShieldAlert, ShieldCheck, Store, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ACCESS_REASONS,getStaffSiteAudit,summarizeStoreRoleReadiness,
  type StaffSiteAudit,type StoreRoleReadiness,
} from "@/lib/nexora-staff-access-audit";
import { listNexoraNetwork } from "@/lib/nexora-sites";

const AccessStatus=({allowed}:{allowed:boolean})=>allowed
  ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><BadgeCheck className="h-4 w-4"/> Permitido</span>
  : <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300"><LockKeyhole className="h-4 w-4"/> Bloqueado</span>;

export const StaffSiteAccessAuditPanel=()=>{
  const [data,setData]=useState<StaffSiteAudit|null>(null);
  const [stores,setStores]=useState<StoreRoleReadiness[]|null>(null);
  const [loading,setLoading]=useState(true);
  const ref=useRef(0);
  const refresh=useCallback(async()=>{
    const id=++ref.current;
    setLoading(true);
    try{
      const [result,network]=await Promise.all([getStaffSiteAudit(),listNexoraNetwork()]);
      const readiness=summarizeStoreRoleReadiness(network.sites,result);
      if(ref.current===id){setData(result);setStores(readiness);}
    }catch(e){
      if(ref.current===id){
        setData(null);setStores(null);
        toast.error(e instanceof Error?e.message:"No fue posible verificar los permisos.");
      }
    }finally{if(ref.current===id)setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();return()=>{ref.current++;};},[refresh]);
  const people=new Set(data?.staff.map(s=>s.userId)??[]).size;
  const assigned=data?.staff.filter(s=>s.siteId&&s.assignmentActive&&s.siteActive).length??0;
  return <section className="space-y-4" aria-label="Auditoría de accesos por sede">
    <div className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-white via-indigo-50 to-sky-100 p-5 text-slate-900 shadow-md shadow-indigo-950/5 dark:border-slate-700 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 dark:text-white dark:shadow-black/20 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-900 dark:border-indigo-400/25 dark:bg-indigo-400/10 dark:text-indigo-200"><ShieldCheck className="h-3.5 w-3.5"/> Seguridad de roles</span>
          <h3 className="mt-3 text-xl font-bold">Auditoría por empleado y sede</h3>
          <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-300">
            Comprueba los accesos según el perfil histórico, el futuro rol y la sede asignada.
            Las decisiones se consultan al servidor y no habilitan operaciones.
          </p>
        </div>
        <Button variant="outline" disabled={loading} onClick={()=>void refresh()}
          className="border-indigo-200 bg-white/80 text-slate-900 hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20">
          <RefreshCw className="h-4 w-4"/> Verificar permisos
        </Button>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {[
          {label:"Usuarios",value:people,icon:Users},
          {label:"Vínculos activos",value:assigned,icon:MapPin},
          {label:"Accesos comerciales habilitados",value:data?.staff.filter(s=>s.canOperateStore).length??0,icon:Store},
        ].map(({label,value,icon:Icon})=><div key={label} className="rounded-xl border border-indigo-100 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.06]">
          <Icon className="h-4 w-4 text-indigo-700 dark:text-indigo-300"/>
          <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{label}</p>
        </div>)}
      </div>
    </div>

    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/[0.08] dark:text-amber-100">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0"/>
      Los permisos comerciales están pendientes de activación global. La lectura de este diagnóstico
      nunca concede privilegios, abre caja ni permite ventas.
    </div>

    {stores!==null&&data?<section className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm"
      aria-label="Bloqueos de roles por local">
      <div className="border-b p-4 sm:p-5">
        <h4 className="font-semibold">Preparación de personal por local</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Incluye locales sin personal, y separa perfiles planificados de permisos reales.
          Ninguna tarjeta habilita usuarios, ventas ni cajas.
        </p>
      </div>
      {stores.length===0?<p className="p-5 text-sm text-muted-foreground">No hay locales activos configurados.</p>:
        <div className="grid gap-3 p-4 md:grid-cols-2 sm:p-5">
          {stores.map(store=><article key={store.siteId} className="rounded-xl border bg-muted/10 p-4">
            <div className="flex items-start justify-between gap-2">
              <h5 className="font-semibold">{store.siteName}</h5>
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Sin activación comercial</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              {[
                {label:"Personal activo",value:store.assignedStaff},
                {label:"Encargados preparados",value:store.plannedManagers},
                {label:"Vendedores preparados",value:store.plannedSellers},
              ].map(item=><div key={item.label} className="rounded-lg border bg-background/70 p-2">
                <p className="text-lg font-bold tabular-nums">{item.value}</p>
                <p className="mt-1 text-muted-foreground">{item.label}</p>
              </div>)}
            </div>
            <p className="mt-3 text-xs font-medium">Pendientes para este local</p>
            <ul className="mt-1 space-y-1 pl-4 text-xs text-muted-foreground list-disc">
              {store.blockers.map(text=><li key={text}>{text}</li>)}
            </ul>
          </article>)}
        </div>}
    </section>:null}

    <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
      <div className="border-b p-4 sm:p-5">
        <h4 className="font-semibold">Matriz real de accesos</h4>
        <p className="mt-1 text-xs text-muted-foreground">Un registro por empleado y sede. Si aún no está asignado, aparece sin local.</p>
      </div>
      {loading&&!data?<p className="p-6 text-sm text-muted-foreground" role="status">Comprobando permisos...</p>:
        !data||data.staff.length===0?<p className="p-6 text-sm text-muted-foreground">No hay empleados para evaluar.</p>:
        <div className="overflow-x-auto">
          <table className="w-full min-w-[830px] text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Empleado / perfil</th>
                <th className="px-4 py-3 text-left">Sede</th>
                <th className="px-4 py-3 text-left">Bodega antigua</th>
                <th className="px-4 py-3 text-left">Operar local</th>
                <th className="px-4 py-3 text-left">Caja / ventas</th>
                <th className="px-4 py-3 text-left">Diagnóstico</th>
              </tr>
            </thead>
            <tbody>
              {data.staff.map((r,i)=><tr key={`${r.userId}-${r.siteId??"none"}-${i}`} className="border-t align-top">
                <td className="px-4 py-3">
                  <p className="font-semibold">{r.fullName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Actual: {r.legacyRole} · Previsto: {r.plannedRole??"Sin definir"}</p>
                </td>
                <td className="px-4 py-3 text-xs">{r.siteName??"Sin sede"}{r.siteId&&!r.assignmentActive?<p className="text-amber-700 dark:text-amber-300">Asignación inactiva</p>:null}</td>
                <td className="px-4 py-3"><AccessStatus allowed={r.canReadWarehouseLegacy}/></td>
                <td className="px-4 py-3"><AccessStatus allowed={r.canOperateStore}/></td>
                <td className="px-4 py-3"><p><AccessStatus allowed={r.canOperateCash}/></p><p className="mt-1"><AccessStatus allowed={r.canSellRetail}/></p></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{ACCESS_REASONS[r.reason]}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
    </div>
  </section>;
};
