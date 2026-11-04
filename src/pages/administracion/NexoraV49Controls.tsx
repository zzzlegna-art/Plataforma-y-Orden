import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, LockKeyhole, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  approveLocalInitial, getCashLimits, getLocalInitialStatus, saveCashLimits,
  validateCashLimits, type NexoraCashLimit, type NexoraLocalInitialStatus,
} from "@/lib/nexora-v49-controls";

const number = (n:number)=>new Intl.NumberFormat("es-CO").format(n);
type EditableLimit={expense:string;day:string};
const toEditable=(row:NexoraCashLimit):EditableLimit=>({
  expense:row.maxPerExpense===null?"":String(row.maxPerExpense),
  day:row.maxPerDay===null?"":String(row.maxPerDay),
});

/** Separado del acta central: cada local requiere firma real de Administrador. */
export const NexoraLocalInitialControls=()=>{
  const [rows,setRows]=useState<NexoraLocalInitialStatus[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);
  const [note,setNote]=useState("");
  const [word,setWord]=useState("");
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{setRows(await getLocalInitialStatus());}
    catch(e){toast.error(e instanceof Error?e.message:"No fue posible consultar locales.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const approve=async()=>{
    if(!selected||busy||word!=="APROBAR"||note.trim().length<10)return;
    setBusy(true);
    try{
      await approveLocalInitial(selected,note,word);
      toast.success("Acta inicial del local firmada por el Administrador.");
      setSelected(null);setNote("");setWord("");
      await refresh();
    }catch(e){toast.error(e instanceof Error?e.message:"No fue posible aprobar el local.");}
    finally{setBusy(false);}
  };
  return <section className="space-y-4 rounded-2xl border bg-card p-5" aria-label="Actas de activación inicial por local">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-primary"/> Aprobación inicial por local</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Solo el Administrador firma después del acta global. Un local sin unidades puede certificarse expresamente como vacío.
          Esta firma no mueve IMEI ni habilita por sí sola el POS.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={()=>void refresh()} disabled={loading||busy}>
        <RefreshCw className="h-4 w-4"/> Actualizar
      </Button>
    </header>
    {loading?<p role="status" className="text-sm text-muted-foreground">Consultando inventario local...</p>:null}
    {!loading&&rows.length===0?<p className="text-sm text-muted-foreground">No hay locales activos para aprobar.</p>:null}
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((row)=><article key={row.siteId} className="rounded-xl border p-4">
        <p className="font-medium">{row.siteName}</p>
        <p className="mt-1 text-sm text-muted-foreground">IMEI en foto inicial: <strong>{number(row.initialCount)}</strong></p>
        {row.approved?<p className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
          <BadgeCheck className="h-4 w-4"/> Acta firmada ({row.approvedCount??0} IMEI)
        </p>:<div className="mt-3">
          {!row.globalApproved?<p className="flex items-center gap-2 text-xs text-amber-700">
            <LockKeyhole className="h-4 w-4"/> Falta la aprobación global del inventario.
          </p>:<Button variant="outline" size="sm" disabled={busy}
            onClick={()=>{setSelected(row.siteId);setWord("");setNote("");}}>
            Revisar y firmar acta
          </Button>}
        </div>}
        {selected===row.siteId&&!row.approved?<div className="mt-4 space-y-3 rounded-lg border bg-muted/20 p-3">
          <p className="text-sm">Certifico el inventario inicial del local, con <strong>{number(row.initialCount)}</strong> IMEI en el acta global.</p>
          <div className="space-y-1">
            <Label htmlFor={`nexora-local-note-${row.siteId}`}>Observación de verificación (mínimo 10 caracteres)</Label>
            <Input id={`nexora-local-note-${row.siteId}`} value={note} maxLength={500}
              placeholder="Verifiqué la recepción física y sus diferencias" onChange={e=>setNote(e.target.value)}/>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`nexora-local-token-${row.siteId}`}>Escribe APROBAR</Label>
            <Input id={`nexora-local-token-${row.siteId}`} value={word} autoComplete="off"
              onChange={e=>setWord(e.target.value)} placeholder="APROBAR"/>
          </div>
          <div className="flex gap-2">
            <Button disabled={busy||word!=="APROBAR"||note.trim().length<10} onClick={()=>void approve()}>Firmar acta</Button>
            <Button variant="outline" disabled={busy} onClick={()=>setSelected(null)}>Cancelar</Button>
          </div>
        </div>:null}
      </article>)}
    </div>
  </section>;
};

/** Configuración explícita de topes: si no hay cifra, el servidor bloquea gastos. */
export const NexoraCashLimitControls=()=>{
  const [rows,setRows]=useState<NexoraCashLimit[]>([]);
  const [values,setValues]=useState<Record<string,EditableLimit>>({});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const data=await getCashLimits();
      setRows(data);
      setValues(Object.fromEntries(data.map(x=>[x.siteId,toEditable(x)])));
    }catch(e){toast.error(e instanceof Error?e.message:"No fue posible consultar los topes.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const save=async(siteId:string)=>{
    if(busy)return;
    const v=values[siteId];
    if(!v||!v.expense.trim()||!v.day.trim())return toast.error("Configura ambos topes en pesos colombianos.");
    const perExpense=Number(v.expense),perDay=Number(v.day);
    const issue=validateCashLimits(perExpense,perDay);
    if(issue)return toast.error(issue);
    setBusy(siteId);
    try{
      await saveCashLimits(siteId,perExpense,perDay);
      toast.success("Topes de caja actualizados con auditoría.");
      await refresh();
    }catch(e){toast.error(e instanceof Error?e.message:"No se guardaron los topes.");}
    finally{setBusy(null);}
  };
  return <section className="space-y-4 rounded-2xl border bg-card p-5" aria-label="Límites de gastos por local">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="flex items-center gap-2 font-semibold"><Wallet className="h-5 w-5 text-primary"/> Límites de gastos configurables</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Solo el Administrador configura. Dos topes en COP: máximo por gasto y máximo diario acumulado.
          Sin configuración, el servidor rechaza gastos; 0 significa bloquearlos.
        </p>
      </div>
      <Button size="sm" variant="outline" disabled={loading||Boolean(busy)} onClick={()=>void refresh()}>
        <RefreshCw className="h-4 w-4"/> Actualizar
      </Button>
    </header>
    {loading?<p role="status" className="text-sm text-muted-foreground">Consultando topes...</p>:null}
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(row=>{
        const value=values[row.siteId]??{expense:"",day:""};
        return <article key={row.siteId} className="space-y-3 rounded-xl border p-4">
          <p className="font-semibold">{row.siteName}</p>
          <p className="text-xs text-muted-foreground">
            {row.configured?"Topes registrados; todo cambio quedará auditado.":"Sin topes: ningún gasto del Encargado está habilitado."}
          </p>
          <div className="space-y-1">
            <Label htmlFor={`nexora-expense-${row.siteId}`}>Máximo por gasto (COP)</Label>
            <Input id={`nexora-expense-${row.siteId}`} type="number" step="0.01" min="0"
              value={value.expense} onChange={e=>setValues(prev=>({...prev,[row.siteId]:{...value,expense:e.target.value}}))}/>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`nexora-day-${row.siteId}`}>Máximo total por día (COP)</Label>
            <Input id={`nexora-day-${row.siteId}`} type="number" step="0.01" min="0"
              value={value.day} onChange={e=>setValues(prev=>({...prev,[row.siteId]:{...value,day:e.target.value}}))}/>
          </div>
          <Button size="sm" onClick={()=>void save(row.siteId)} disabled={loading||Boolean(busy)}>
            {busy===row.siteId?"Guardando...":"Guardar topes"}
          </Button>
        </article>;
      })}
    </div>
  </section>;
};
