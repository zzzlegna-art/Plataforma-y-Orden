import {useEffect,useRef,useState} from "react";
import {Search,RefreshCw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {fetchReferenceStock,type ReferenceStockResult} from "@/lib/nexora-reference-stock";
import {fetchImeiDirectory,type ImeiDirectoryResponse} from "@/lib/nexora-imei-directory";
const money=(v:number|null)=>v===null?"Sin costo registrado":new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(v);
export const WorkerGlobalInventory=({serials=false}:{serials?:boolean})=>{
  const [kind,setKind]=useState<"imei"|"ref">(serials?"imei":"ref");
  const [query,setQuery]=useState("");
  const [page,setPage]=useState(1);
  const [reload,setReload]=useState(0);
  const [reference,setReference]=useState<ReferenceStockResult|null>(null);
  const [imei,setImei]=useState<ImeiDirectoryResponse|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const seq=useRef(0);
  useEffect(()=>{setKind(serials?"imei":"ref");setPage(1);},[serials]);
  useEffect(()=>{
    let current=++seq.current;setLoading(true);setError("");
    const task=kind==="imei"
      ?fetchImeiDirectory({query,page,pageSize:25})
      :fetchReferenceStock({query,page,pageSize:20});
    void task.then(value=>{
      if(current!==seq.current)return;
      if(kind==="imei")setImei(value as ImeiDirectoryResponse);
      else setReference(value as ReferenceStockResult);
    }).catch(e=>{if(current===seq.current)setError(e instanceof Error?e.message:"No fue posible consultar inventario.");})
      .finally(()=>{if(current===seq.current)setLoading(false);});
    return()=>{current=++seq.current;};
  },[kind,query,page,reload]);
  const total=kind==="imei"?imei?.matched??0:reference?.matched??0;
  const per=kind==="imei"?25:20, pages=Math.max(1,Math.ceil(total/per));
  return <main className="space-y-4">
    <h1 className="text-2xl font-bold">Inventario global</h1>
    <div className="flex flex-wrap gap-2">
      <Button variant={kind==="ref"?"default":"outline"} onClick={()=>{setKind("ref");setPage(1);}}>Referencias</Button>
      <Button variant={kind==="imei"?"default":"outline"} onClick={()=>{setKind("imei");setPage(1);}}>Seriales / IMEI</Button>
    </div>
    <div className="flex gap-2">
      <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"/>
        <Input aria-label="Buscar referencia, IMEI o sede" className="pl-9" value={query}
          maxLength={100} placeholder="Buscar referencia, IMEI o sede"
          onChange={e=>{setQuery(e.target.value);setPage(1);}}/></div>
      <Button variant="outline" onClick={()=>setReload(n=>n+1)} disabled={loading}><RefreshCw className="size-4"/>Actualizar</Button>
    </div>
    {error?<p role="alert" className="rounded-lg border border-destructive p-3 text-sm">{error}</p>:null}
    {loading?<p role="status" className="text-sm text-muted-foreground">Consultando...</p>:null}
    <div className="overflow-x-auto rounded-xl border bg-card">
      {kind==="imei"?<table className="w-full min-w-[690px] text-sm">
        <thead><tr className="bg-muted/30 text-left"><th className="p-3">Equipo / IMEI</th><th className="p-3">Ubicación</th><th className="p-3">Estado</th><th className="p-3 text-right">Costo individual</th></tr></thead>
        <tbody>{imei?.items.map(row=><tr className="border-t" key={row.unitId}>
          <td className="p-3">{row.productName}<span className="block font-mono text-xs text-muted-foreground">{row.serial}</span></td>
          <td className="p-3">{row.siteName??"Sin sede"}{row.cityName?" · "+row.cityName:""}</td>
          <td className="p-3">{row.custodyState==="en_sede"?"En sede":row.custodyState.replaceAll("_"," ")}</td>
          <td className="p-3 text-right">{money(row.cost)}</td>
        </tr>)}</tbody>
      </table>:<table className="w-full min-w-[590px] text-sm">
        <thead><tr className="bg-muted/30 text-left"><th className="p-3">Referencia / SKU</th><th className="p-3">Sede</th><th className="p-3 text-right">Registrados</th><th className="p-3 text-right">Disponibles</th></tr></thead>
        <tbody>{reference?.items.flatMap(r=>r.sites.map((site,i)=><tr key={r.productId+":"+i} className="border-t">
          <td className="p-3">{r.name}<span className="block font-mono text-xs text-muted-foreground">{r.sku}</span></td>
          <td className="p-3">{site.siteName}{site.cityName?" · "+site.cityName:""}</td>
          <td className="p-3 text-right">{site.total}</td>
          <td className="p-3 text-right">{site.available}</td>
        </tr>))}</tbody>
      </table>}
      {!loading&&total===0?<p className="p-4 text-sm text-muted-foreground">Sin resultados.</p>:null}
    </div>
    <div className="flex items-center justify-between text-sm"><span>{total} resultados · página {page} de {pages}</span>
      <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page<=1||loading} onClick={()=>setPage(n=>n-1)}>Anterior</Button>
        <Button size="sm" variant="outline" disabled={page>=pages||loading} onClick={()=>setPage(n=>n+1)}>Siguiente</Button></div>
    </div>
  </main>;
};
