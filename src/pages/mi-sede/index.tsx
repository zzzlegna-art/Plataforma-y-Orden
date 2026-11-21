import { useCallback,useEffect,useRef,useState } from "react";
import { Building2,LockKeyhole,RefreshCw,Wallet } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/hooks/use-app";
import { getWorkerSnapshot,type WorkerSnapshot } from "@/lib/nexora-worker";
import { runCashOperation,validateCashOperation,type CashOperation } from "@/lib/nexora-cash-day";

const cop=(n:number)=>new Intl.NumberFormat("es-CO",{
  style:"currency",currency:"COP",maximumFractionDigits:0,
}).format(n);

/** Portal restringido: ningún usuario de local descarga todo el inventario legacy. */
export const MiSede=()=>{
  const {user,role}=useApp();
  const [snapshot,setSnapshot]=useState<WorkerSnapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [cashAction,setCashAction]=useState<CashOperation>("open");
  const [cashAmount,setCashAmount]=useState("");
  const [cashNote,setCashNote]=useState("");
  const saving=useRef(false);
  const mounted=useRef(true);
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const next=await getWorkerSnapshot();
      if(mounted.current)setSnapshot(next);
    }catch(error){
      if(mounted.current){
        setSnapshot(null);
        toast.error(error instanceof Error?error.message:"La sesión de tu sede ya no está disponible.");
      }
    }finally{if(mounted.current)setLoading(false);}
  },[]);
  useEffect(()=>{
    mounted.current=true;
    void refresh();
    return()=>{mounted.current=false;};
  },[refresh]);
  const executeCash=async()=>{
    if(!snapshot||role!=="encargado"||saving.current)return;
    const amount=Number(cashAmount);
    const issue=validateCashOperation(cashAction,amount,cashNote);
    if(issue){toast.error(issue);return;}
    saving.current=true;setBusy(true);
    try{
      await runCashOperation(cashAction,snapshot.siteId,amount,cashNote);
      toast.success("Movimiento de caja registrado y auditado.");
      setCashAmount("");setCashNote("");
      await refresh();
    }catch(error){
      toast.error(error instanceof Error?error.message:"No se pudo registrar el movimiento.");
    }finally{saving.current=false;setBusy(false);}
  };
  return <section className="mx-auto max-w-4xl space-y-5" aria-label="Operaciones de mi sede">
    <header className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Building2 className="size-6 text-primary"/>
        <div>
          <h1 className="text-2xl font-bold">Mi sede</h1>
          <p className="text-sm text-muted-foreground">
            {user?.fullName} · {role==="encargado"?"Encargado":"Vendedor"}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Operación del local asignado: {snapshot?.siteName??"Mi local"}.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline"><Link to="/inventario">Inventario global</Link></Button>
        <Button size="sm" variant="outline" disabled={busy||loading}
          onClick={()=>void refresh()}><RefreshCw className="size-4"/> Actualizar</Button>
      </div>
    </header>
    {loading?<p role="status">Verificando permisos e inventario del local...</p>:null}
    {!loading&&!snapshot?<div role="alert" className="rounded-xl border p-4 text-sm">
      <LockKeyhole className="mr-2 inline size-4"/> El servidor no confirmó tu sede operativa.
      Comunícate con el Administrador.
    </div>:null}
    {snapshot&&<>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Local autorizado</p>
          <p className="mt-1 font-semibold">{snapshot.siteName}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Equipos en local</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{snapshot.assignedUnits}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Equipos con costo real</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{snapshot.unitsWithRealCost}</p></div>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <p className="font-semibold">Caja de hoy · {snapshot.businessDate}</p>
        <p className="mt-1 text-sm text-muted-foreground">Estado: {
          snapshot.cashState==="open"?"Abierta":snapshot.cashState==="closed"?"Cerrada":"Sin apertura"
        }</p>
      </div>
      {role==="encargado"?<div className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Wallet className="size-5"/> Caja del local</h2>
        <p className="text-sm text-muted-foreground">
          Todas las operaciones se validan en Supabase; los gastos respetan topes
          individuales y diarios establecidos por el Administrador.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="nx-cash-action">Operación</Label>
            <select id="nx-cash-action" value={cashAction} disabled={busy}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              onChange={e=>setCashAction(e.target.value as CashOperation)}>
              <option value="open">Abrir caja</option>
              <option value="expense">Registrar gasto</option>
              <option value="close">Cerrar caja</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nx-cash-amount">Monto en COP</Label>
            <Input id="nx-cash-amount" type="number" min="0" step="0.01"
              value={cashAmount} disabled={busy} onChange={e=>setCashAmount(e.target.value)}
              placeholder={cashAction==="close"?"Efectivo contado":"0"}/>
          </div>
        </div>
        {cashAction==="expense"?<div className="space-y-1">
          <Label htmlFor="nx-cash-note">Motivo del gasto</Label>
          <Input id="nx-cash-note" value={cashNote} disabled={busy} maxLength={500}
            placeholder="Describe el gasto (mínimo 5 caracteres)"
            onChange={e=>setCashNote(e.target.value)}/>
        </div>:null}
        <Button disabled={busy||loading||!cashAmount.trim()} onClick={()=>void executeCash()}>
          {busy?"Registrando...":"Confirmar movimiento"}
        </Button>
      </div>:null}

    </>}
  </section>;
};
export default MiSede;
