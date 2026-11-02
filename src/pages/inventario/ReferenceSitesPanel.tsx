import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Boxes, ChevronDown, ChevronUp,
  LockKeyhole, MapPin, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchReferenceStock, type ReferenceStockResult } from "@/lib/nexora-reference-stock";

const format=(value:number)=>new Intl.NumberFormat("es-CO").format(value);

/** Consulta consolidada de IMEI por referencia/ubicación. No incluye repuestos por cantidad. */
export const ReferenceSitesPanel=()=>{
  const [expanded,setExpanded]=useState(false);
  const [data,setData]=useState<ReferenceStockResult|null>(null);
  const [query,setQuery]=useState("");
  const [page,setPage]=useState(1);
  const [revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(false);
  const request=useRef(0);
  const search=query.trim();

  const load=useCallback(async()=>{
    const id=++request.current;
    setLoading(true);
    try{
      const result=await fetchReferenceStock({query:search,page,pageSize:20});
      if(id===request.current)setData(result);
    }catch(error){
      if(id===request.current){
        setData(null);
        toast.error(error instanceof Error?error.message:"No fue posible consultar el inventario por referencia.");
      }
    }finally{
      if(id===request.current)setLoading(false);
    }
  },[search,page,revision]);

  useEffect(()=>{
    if(!expanded){request.current++;setLoading(false);return;}
    const timer=window.setTimeout(()=>{void load();},search?250:0);
    return()=>{window.clearTimeout(timer);request.current++;};
  },[expanded,search,load]);
  const pages=data?Math.max(1,Math.ceil(data.matched/data.pageSize)):1;

  return <section aria-label="Inventario consolidado por referencia y sede"
    className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
    <div className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-5 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950 sm:p-6">
      <div className="flex max-w-2xl items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200">
          <Boxes className="size-5" aria-hidden="true"/>
        </span>
        <div>
          <h2 className="text-base font-bold tracking-tight sm:text-lg">Existencias por referencia y sede</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Consulta cuántos IMEI tiene cada referencia en la red, sin confundir ubicación histórica con stock físico.
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" aria-expanded={expanded}
        aria-controls="nexora-reference-directory"
        onClick={()=>setExpanded(value=>!value)}
        className="border-slate-300 bg-white/80 text-slate-900 hover:bg-white dark:border-slate-600 dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
        {expanded?"Ocultar referencias":"Ver referencias por sede"}
        {expanded?<ChevronUp className="size-4"/>:<ChevronDown className="size-4"/>}
      </Button>
    </div>
    {expanded?<div id="nexora-reference-directory" className="space-y-4 border-t p-4 sm:p-6">
      <p className="flex items-start gap-2 rounded-xl border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0"/>
        Conteo de unidades con IMEI únicamente. Los repuestos controlados por cantidad aún
        no se incluyen. «Disponible» requiere sede física aprobada, costo válido y ausencia
        de pedidos o traslados comprometidos. Esta consulta no autoriza ventas.
      </p>
      {data&&!data.initialApproved?
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/25 dark:bg-amber-400/[0.08] dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0"/>
          Inventario inicial todavía sin aprobación. Ningún registro histórico constituye una
          ubicación física verificada ni habilita existencias comerciales.
        </p>:null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[220px] flex-1 space-y-1.5 text-xs font-semibold">
          <span>Buscar referencia o SKU</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
            <Input value={query} maxLength={100} placeholder="Ej. iPhone 13 o IP13"
              onChange={event=>{setQuery(event.target.value);setPage(1);}} className="pl-9"/>
          </div>
        </label>
        <Button variant="outline" disabled={loading} onClick={()=>setRevision(value=>value+1)}>
          <RefreshCw className="size-4"/> Actualizar
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Referencia / ubicación física</th>
              <th className="px-4 py-3 text-right">IMEI registrados</th>
              <th className="px-4 py-3 text-right">En sede verificada</th>
              <th className="px-4 py-3 text-right">Disponibles*</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map(item=><Fragment key={item.productId}>
              <tr key={item.productId} className="border-t bg-muted/15 font-semibold">
                <th scope="row" className="px-4 py-3 text-left">
                  {item.name}
                  <span className="mt-0.5 block font-mono text-xs font-normal text-muted-foreground">{item.sku}</span>
                </th>
                <td className="px-4 py-3 text-right tabular-nums">{format(item.total)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{format(item.physicallyVerified)}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{format(item.available)}</td>
              </tr>
              {item.sites.map(site=><tr key={`${item.productId}:${site.siteId??"unverified"}`} className="border-t text-muted-foreground hover:bg-muted/20">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2 pl-3">
                    {site.siteId?<MapPin className="size-3.5 shrink-0"/>:<LockKeyhole className="size-3.5 shrink-0"/>}
                    <span>
                      {site.siteName}
                      {site.cityName?<span className="ml-1 text-xs">· {site.cityName}</span>:null}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{format(site.total)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{format(site.physicallyVerified)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{format(site.available)}</td>
              </tr>)}
              {item.total>0?<tr key={`${item.productId}:notes`} className="border-t text-[11px] text-muted-foreground">
                <td colSpan={4} className="px-4 py-2">
                  {format(item.unverified)} sin conciliar · {format(item.inTransit)} en tránsito ·
                  {" "}{format(item.pendingReturn)} pendientes de retorno · {format(item.sold)} vendidos
                </td>
              </tr>:null}
            </Fragment>)}
          </tbody>
        </table>
        {!loading&&data?.items.length===0?
          <p className="border-t p-6 text-center text-sm text-muted-foreground">
            No hay referencias para esta búsqueda.
          </p>:null}
        {loading?<p role="status" className="border-t p-4 text-sm text-muted-foreground">
          Consultando existencias verificadas en Supabase...
        </p>:null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{data?format(data.matched):"—"} referencias · 20 por página · *candidatos, no ventas autorizadas</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={loading||page===1}
            onClick={()=>setPage(current=>Math.max(1,current-1))}>
            <ArrowLeft className="size-4"/> Anterior
          </Button>
          <span className="font-semibold tabular-nums text-foreground">{page} / {pages}</span>
          <Button size="sm" variant="outline" disabled={loading||page>=pages}
            onClick={()=>setPage(current=>current+1)}>
            Siguiente <ArrowRight className="size-4"/>
          </Button>
        </div>
      </div>
    </div>:null}
  </section>;
};
