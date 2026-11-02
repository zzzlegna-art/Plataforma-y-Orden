import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, Boxes, ChevronDown,
  ChevronUp, Fingerprint, History, LockKeyhole, MapPin, RefreshCw, Search, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CUSTODY_FILTERS,CUSTODY_LABEL,fetchImeiDirectory,
  type CustodyFilter,type ImeiDirectoryResponse,type ImeiDirectoryRow,
} from "@/lib/nexora-imei-directory";

const fmt=(n:number)=>new Intl.NumberFormat("es-CO").format(n);
const cop=(n:number)=>new Intl.NumberFormat("es-CO",{
  style:"currency",currency:"COP",maximumFractionDigits:0,
}).format(n);
const stateColor:Record<string,string>={
  sin_conciliar:"bg-amber-100 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200",
  en_sede:"bg-emerald-100 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-200",
  en_transito:"bg-sky-100 text-sky-900 dark:bg-sky-400/10 dark:text-sky-200",
  retorno_pendiente:"bg-rose-100 text-rose-900 dark:bg-rose-400/10 dark:text-rose-200",
  vendido:"bg-muted text-muted-foreground",
};

export const ImeiSedesPanel=()=>{
  const [expanded,setExpanded]=useState(false);
  const [selected,setSelected]=useState<ImeiDirectoryRow|null>(null);
  const [data,setData]=useState<ImeiDirectoryResponse|null>(null);
  const [state,setState]=useState<CustodyFilter>("all");
  const [site,setSite]=useState("");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [loading,setLoading]=useState(false);
  const [revision,setRevision]=useState(0);
  const request=useRef(0);
  const currentQuery=search.trim();
  const load=useCallback(async()=>{
    const id=++request.current;
    setLoading(true);
    try{
      const result=await fetchImeiDirectory({
        filter:state,siteId:site||null,query:currentQuery,page,pageSize:25,
      });
      if(id===request.current)setData(result);
    }catch(error){
      if(id===request.current){
        setData(null);
        toast.error(error instanceof Error?error.message:"No fue posible consultar los IMEI.");
      }
    }finally{if(id===request.current)setLoading(false);}
  },[state,site,currentQuery,page,revision]);

  useEffect(()=>{
    if(!expanded)return;
    const timer=window.setTimeout(()=>{void load();},currentQuery?280:0);
    return()=>{window.clearTimeout(timer);request.current++;};
  },[expanded,load,currentQuery]);

  const updateFilter=(next:CustodyFilter)=>{setState(next);setPage(1);};
  const updateSite=(next:string)=>{setSite(next);setPage(1);};
  const updateSearch=(next:string)=>{setSearch(next);setPage(1);};
  const totalPages=data?Math.max(1,Math.ceil(data.matched/data.pageSize)):1;

  return <section aria-label="Inventario individual por IMEI y sede"
    className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
    <div className="relative overflow-hidden bg-gradient-to-r from-sky-50 via-white to-indigo-50 p-5 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-2xl items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-400/10 dark:text-sky-200">
            <Fingerprint className="h-5 w-5"/>
          </span>
          <div>
            <h2 className="font-bold tracking-tight sm:text-lg">Inventario individual · IMEI y sedes</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Consulta seriales, costos reales y custodia física por local o ciudad.
              Los equipos sin acta de conciliación siguen sin sede asignada.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm"
          aria-expanded={expanded} aria-controls="nexora-imei-directory"
          onClick={()=>setExpanded(value=>!value)}
          className="border-slate-300 bg-white/80 text-slate-900 hover:bg-white dark:border-slate-600 dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
          {expanded?"Ocultar detalle":"Ver IMEI por sede"}
          {expanded?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}
        </Button>
      </div>
    </div>
    {expanded?<div id="nexora-imei-directory" className="space-y-4 border-t p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          {label:"Sin conciliar",value:data?.summary.sinConciliar??0,tone:"text-amber-700 dark:text-amber-300"},
          {label:"En sede",value:data?.summary.enSede??0,tone:"text-emerald-700 dark:text-emerald-300"},
          {label:"En tránsito",value:data?.summary.enTransito??0,tone:"text-sky-700 dark:text-sky-300"},
          {label:"Retorno pendiente",value:data?.summary.retornoPendiente??0,tone:"text-rose-700 dark:text-rose-300"},
          {label:"Vendidos",value:data?.summary.vendidos??0,tone:"text-muted-foreground"},
          {label:"Activos sin costo",value:data?.summary.sinCosto??0,tone:"text-amber-700 dark:text-amber-300"},
        ].map(k=><div key={k.label} className="rounded-xl border bg-muted/15 p-3">
          <p className={`text-xl font-bold tabular-nums ${k.tone}`}>{data?fmt(k.value):"—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{k.label}</p>
        </div>)}
      </div>
      {data&&!data.initialApproved?
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/[0.08] dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
          Todavía no se ha aprobado el inventario inicial. Los estados históricos no prueban
          por sí solos la ubicación física de ningún IMEI.
        </p>:null}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <label className="space-y-1.5 text-xs font-semibold">
          <span>Buscar IMEI, referencia o SKU</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
            <Input value={search} onChange={e=>updateSearch(e.target.value)} maxLength={100}
              placeholder="Ej. iPhone 13, 356..." className="pl-9" />
          </div>
        </label>
        <label className="space-y-1.5 text-xs font-semibold">
          <span>Custodia física</span>
          <select className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            value={state} onChange={e=>updateFilter(e.target.value as CustodyFilter)}>
            {CUSTODY_FILTERS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-semibold">
          <span>Sede / ciudad</span>
          <select className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            value={site} onChange={e=>updateSite(e.target.value)}>
            <option value="">Todas las sedes</option>
            {data?.sites.map(s=><option key={s.id} value={s.id}>{s.city} · {s.name}</option>)}
          </select>
        </label>
        <Button variant="outline" disabled={loading} onClick={()=>setRevision(n=>n+1)}
          className="w-full md:w-auto">
          <RefreshCw className="h-4 w-4"/> Actualizar
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/30 text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Referencia / IMEI</th>
              <th className="px-4 py-3 text-left">Sede verificada</th>
              <th className="px-4 py-3 text-right">Costo individual</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-left">Disponibilidad</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map(item=><tr key={item.unitId} className="border-t transition-colors hover:bg-muted/20">
              <td className="px-4 py-3">
                <p className="font-semibold">{item.productName}</p>
                <button type="button"
                  aria-label={`Abrir ficha del IMEI ${item.serial}`}
                  onClick={()=>setSelected(item)}
                  className="mt-1 rounded-sm font-mono text-xs font-semibold text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {item.serial}
                </button>
                <p className="mt-1 text-[11px] text-muted-foreground">{item.sku}</p>
              </td>
              <td className="px-4 py-3">
                {item.siteName?<p className="flex items-center gap-1 font-medium"><MapPin className="h-3.5 w-3.5"/>{item.siteName}</p>:
                  <span className="font-medium text-amber-800 dark:text-amber-300">Sin sede verificada</span>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.cityName??(item.historicalLocation
                    ?`Histórico: ${item.historicalLocation} (no verificado)`:"Pendiente de conciliación")}
                </p>
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">
                {item.cost===null?
                  <span className="text-amber-800 dark:text-amber-300">Sin costo registrado</span>:
                  cop(item.cost)}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${stateColor[item.custodyState]}`}>
                  {CUSTODY_LABEL[item.custodyState]}
                </span>
              </td>
              <td className="px-4 py-3">
                {item.commercialCandidate?
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <BadgeCheck className="h-3.5 w-3.5"/> Candidato, no venta autorizada
                  </span>:
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <LockKeyhole className="h-3.5 w-3.5"/> Restringido
                  </span>}
                {item.committedOrder?<p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Comprometido en pedido</p>:null}
                {item.committedTransfer?<p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Comprometido en traslado</p>:null}
              </td>
            </tr>)}
          </tbody>
        </table>
        {!loading&&data?.items.length===0?<p className="border-t p-6 text-center text-sm text-muted-foreground">
          No se encontraron IMEI con esos filtros.
        </p>:null}
        {loading?<p role="status" className="border-t p-4 text-sm text-muted-foreground">
          Verificando seriales en Supabase...
        </p>:null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{data?fmt(data.matched):"—"} coincidencias · {data?.pageSize??25} por página</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={loading||page===1} onClick={()=>setPage(x=>Math.max(1,x-1))}>
            <ArrowLeft className="h-4 w-4"/> Anterior
          </Button>
          <span className="font-semibold tabular-nums text-foreground">{page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={loading||page>=totalPages} onClick={()=>setPage(x=>x+1)}>
            Siguiente <ArrowRight className="h-4 w-4"/>
          </Button>
        </div>
      </div>
      <p className="flex items-start gap-2 rounded-xl border bg-muted/10 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
        Solo lectura. El costo no registrado nunca se convierte en cero. Una sede debe aprobarse
        mediante conciliación física; esta vista no reserva, traslada ni vende equipos.
      </p>
    </div>:null}
    <Dialog open={selected!==null} onOpenChange={open=>{if(!open)setSelected(null);}}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <History className="h-4 w-4" aria-hidden="true"/>
            Ficha de inventario multisede
          </div>
          <DialogTitle className="break-all font-mono text-xl">{selected?.serial??""}</DialogTitle>
          <DialogDescription>{selected?.productName??""} · {selected?.sku??""}</DialogDescription>
        </DialogHeader>
        {selected?<div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">Custodia física</p>
              <p className="mt-1 font-semibold">{CUSTODY_LABEL[selected.custodyState]}</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">Sede verificada</p>
              <p className="mt-1 font-semibold">{selected.siteName??"Sin sede verificada"}</p>
              {selected.cityName?<p className="text-xs text-muted-foreground">{selected.cityName}</p>:null}
            </div>
            <div className="rounded-xl border bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">Costo individual registrado</p>
              <p className="mt-1 font-semibold tabular-nums">
                {selected.cost===null?"Sin costo registrado":cop(selected.cost)}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">Estado comercial</p>
              <p className="mt-1 font-semibold">
                {selected.commercialCandidate?"Candidato sujeto a validación":"Operación restringida"}
              </p>
            </div>
          </div>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-500/25 dark:bg-amber-400/[0.07] dark:text-amber-100">
            Esta ficha no confirma una venta ni una ubicación no conciliada.
            La hoja de vida conserva los movimientos heredados y muestra
            los eventos multisede confirmados cuando existan. La exportación
            unificada y otros flujos de auditoría siguen pendientes.
          </p>
          <Button variant="outline" className="w-full sm:w-auto" asChild>
            <Link to={`/seriales?serial=${encodeURIComponent(selected.serial)}`}
              onClick={()=>setSelected(null)}>
              <History className="h-4 w-4"/> Abrir hoja de vida del IMEI
            </Link>
          </Button>
        </div>:null}
      </DialogContent>
    </Dialog>
  </section>;
};
