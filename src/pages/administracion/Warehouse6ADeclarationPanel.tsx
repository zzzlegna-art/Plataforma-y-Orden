import { useEffect,useRef,useState } from "react";
import {
  AlertTriangle,Building2,ClipboardCheck,FileSignature,
  LockKeyhole,RefreshCw,ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  canCertifyWarehouse6A,certifyWarehouse6A,fetchWarehouse6APreflight,
  WAREHOUSE_6A_CONFIRMATION,WAREHOUSE_6A_DECLARATION,
  type Warehouse6APreflight,
} from "@/lib/nexora-warehouse-6a-opening";

const fmt=(n:number)=>new Intl.NumberFormat("es-CO").format(n);
export const Warehouse6ADeclarationPanel=({
  alreadyApproved,onApproved,
}:{alreadyApproved:boolean;onApproved:()=>void})=>{
  const [opened,setOpened]=useState(false);
  const [preflight,setPreflight]=useState<Warehouse6APreflight|null>(null);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [checkedLocation,setCheckedLocation]=useState(false);
  const [checkedRecords,setCheckedRecords]=useState(false);
  const [supportNote,setSupportNote]=useState("");
  const [word,setWord]=useState("");
  const generation=useRef(0);
  const savingLock=useRef(false);
  const load=async()=>{
    if(savingLock.current)return;
    const id=++generation.current;
    setPreflight(null);setError(null);setLoading(true);
    setCheckedLocation(false);setCheckedRecords(false);setSupportNote("");setWord("");
    try{
      const p=await fetchWarehouse6APreflight();
      if(id===generation.current)setPreflight(p);
    }catch(e:unknown){
      if(id===generation.current)setError(e instanceof Error?e.message:"No se pudo verificar la Bodega 6A.");
    }finally{if(id===generation.current)setLoading(false);}
  };
  useEffect(()=>()=>{generation.current++;},[]);
  const openPanel=()=>{
    setOpened(v=>{
      if(!v&&!alreadyApproved)void load();
      return !v;
    });
  };
  const canSign=canCertifyWarehouse6A(preflight,checkedRecords,
    checkedLocation,supportNote,word);
  const sign=async()=>{
    if(!preflight||!canSign||savingLock.current)return;
    savingLock.current=true;setSaving(true);setError(null);
    try{
      // Server compara la huella y conteos una segunda vez bajo locks de DB.
      const receipt=await certifyWarehouse6A(preflight,supportNote,word);
      toast.success(`Acta administrativa firmada: ${fmt(receipt.approvedCount)} IMEI en Bodega 6A. Sin escaneos ficticios.`);
      setOpened(false);setPreflight(null);setWord("");setSupportNote("");
      onApproved();
    }catch(e:unknown){
      setError(e instanceof Error?e.message:"No fue posible completar el acta.");
      // Un rechazo por cambio del inventario exige nuevo corte y reconfirmación.
      setPreflight(null);setCheckedLocation(false);setCheckedRecords(false);setWord("");
    }finally{savingLock.current=false;setSaving(false);}
  };
  if(alreadyApproved)return null;
  return <section aria-label="Apertura excepcional de Bodega 6A"
    className="overflow-hidden rounded-2xl border bg-card shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-indigo-50 via-white to-sky-50 p-5 dark:from-indigo-950/40 dark:via-slate-900 dark:to-sky-950/40 sm:p-6">
      <div className="flex max-w-2xl items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-900 dark:bg-indigo-300/10 dark:text-indigo-200">
          <Building2 className="size-5"/>
        </span>
        <div>
          <h3 className="text-base font-bold tracking-tight sm:text-lg">
            Apertura excepcional por declaración · Bodega 6A
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Alternativa administrativa al escaneo individual de un inventario recién
            cargado de forma controlada. El Administrador declara su presencia física,
            revisa la huella y firma un acta irreversible y diferenciada.
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={openPanel} disabled={saving}
        aria-expanded={opened} aria-controls="nexora-warehouse-6a-opening"
        className="border-indigo-200 bg-white/90 text-indigo-950 dark:border-indigo-400/30 dark:bg-white/10 dark:text-white">
        <FileSignature className="size-4"/>
        {opened?"Cerrar revisión":"Revisar apertura excepcional"}
      </Button>
    </div>
    {opened?<div id="nexora-warehouse-6a-opening" className="space-y-4 border-t p-4 sm:p-6">
      <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 size-4 shrink-0"/>
        Esta vía NO constituye escaneo de IMEI ni inspección física independiente.
        Úsala solo si puedes asumir expresamente la responsabilidad por la existencia
        actual de TODAS las unidades elegibles en Bodega 6A. Si alguna unidad está
        en otro local, faltante o pendiente de ubicar, utiliza la conciliación individual.
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={loading||saving}
          onClick={()=>{void load();}}>
          <RefreshCw className="size-4"/>{loading?"Verificando…":"Actualizar corte"}
        </Button>
        <span className="text-xs text-muted-foreground">
          <LockKeyhole className="mr-1 inline size-3"/>Solo Administrador
        </span>
      </div>
      {loading?<p role="status" className="rounded-xl border bg-muted/15 p-3 text-sm">
        Comprobando Bodega 6A, IMEI y bloqueos en Supabase…
      </p>:null}
      {error?<p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        {error} Actualiza el corte antes de reintentar.
      </p>:null}
      {preflight?<div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            {label:"IMEI elegibles",value:preflight.eligible},
            {label:"Vendidos históricos",value:preflight.soldHistorical},
            {label:"Sin costo individual",value:preflight.withoutValidCost},
            {label:"Cotejos individuales",value:preflight.activeImeiScans},
          ].map(x=><div key={x.label} className="rounded-xl border bg-muted/15 p-3">
            <p className="text-2xl font-bold tabular-nums">{fmt(x.value)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{x.label}</p>
          </div>)}
        </div>
        <div className="space-y-1 rounded-xl border bg-muted/10 p-3 text-xs text-muted-foreground">
          <p><strong className="text-foreground">Sede destino:</strong> {preflight.siteName??"No validada"} (Barranquilla)</p>
          <p><strong className="text-foreground">Huella del corte:</strong> <code className="break-all">{preflight.inventoryFingerprint}</code></p>
          <p><strong className="text-foreground">Corte:</strong> {new Date(preflight.snapshotAt).toLocaleString("es-CO",{timeZone:"America/Bogota"})}</p>
          <p>El servidor compara nuevamente esta huella justo antes de firmar. El costo no se sustituye ni estima.</p>
        </div>
        {!preflight.canCertify?<p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
          Certificación bloqueada: confirma que existe una única Bodega 6A activa en Barranquilla,
          que todas las unidades elegibles están registradas «en_bodega», que no hay
          aprobaciones ni cotejos previos y que no existen traslados o custodias en curso.
          Incidencias: {fmt(preflight.otherHistorical)} estados históricos distintos,
          {fmt(preflight.mappedUnits)} unidades ya asignadas,
          {fmt(preflight.priorApprovals)} actas, {fmt(preflight.custodyRows)} custodias,
          {fmt(preflight.inFlightTransferLines)} líneas en tránsito.
        </p>:<div className="space-y-4 rounded-xl border p-4">
          <p className="flex items-start gap-2 text-sm leading-relaxed">
            <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary"/>
            {WAREHOUSE_6A_DECLARATION}
          </p>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 size-4" checked={checkedRecords}
              disabled={saving} onChange={e=>setCheckedRecords(e.target.checked)}/>
            <span>Confirmo que revisé los registros y que todos los IMEI elegibles forman parte de las existencias actuales declaradas de Bodega 6A.</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 size-4" checked={checkedLocation}
              disabled={saving} onChange={e=>setCheckedLocation(e.target.checked)}/>
            <span>Confirmo bajo mi responsabilidad que ninguna unidad elegible está físicamente faltante o en otra sede, y que los {fmt(preflight.soldHistorical)} vendidos históricos NO serán stock disponible.</span>
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="nexora-6a-support-note">Fundamento de la revisión administrativa (30 a 1.000 caracteres)</Label>
            <Textarea id="nexora-6a-support-note" rows={3} maxLength={1000}
              value={supportNote} onChange={e=>setSupportNote(e.target.value)} disabled={saving}
              placeholder="Explica cómo verificaste la correspondencia entre registros, pedidos e inventario físico."/>
            <p className="text-xs text-muted-foreground">Esta descripción queda conservada dentro del acta firmada.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nexora-6a-confirmation">Escribe {WAREHOUSE_6A_CONFIRMATION} para firmar</Label>
            <Input id="nexora-6a-confirmation" value={word} disabled={saving}
              onChange={e=>setWord(e.target.value)} autoComplete="off"
              placeholder={WAREHOUSE_6A_CONFIRMATION}/>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              La firma es única y definitiva. Preserva las existencias legacy,
              reconoce el método «declaración administrativa» y no habilita
              ventas sin costo válido ni activa nuevos usuarios.
            </p>
            <Button disabled={!canSign||saving||loading} onClick={()=>{void sign();}}>
              <ShieldCheck className="size-4"/>{saving?"Firmando acta…":"Firmar acta 6A"}
            </Button>
          </div>
        </div>}
      </div>:null}
    </div>:null}
  </section>;
};
