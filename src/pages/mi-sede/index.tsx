import { useCallback,useEffect,useRef,useState } from "react";
import { BadgeCheck,Building2,LockKeyhole,RefreshCw,ShoppingBag,Wallet } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/hooks/use-app";
import { getWorkerSnapshot,type WorkerSnapshot } from "@/lib/nexora-worker";
import { runCashOperation,validateCashOperation,type CashOperation } from "@/lib/nexora-cash-day";
import {
  performRetailSale, validateRetailSale, retailPaymentLabel,
  type RetailPayment,type RetailReceipt,
} from "@/lib/nexora-retail-pos";

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
  const [serial,setSerial]=useState("");
  const [price,setPrice]=useState("");
  const [payment,setPayment]=useState<RetailPayment>("efectivo");
  const [confirmed,setConfirmed]=useState(false);
  const [receipt,setReceipt]=useState<RetailReceipt|null>(null);
  const requestId=useRef<string|null>(null);
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
  const executeSale=async()=>{
    if(!snapshot||(role!=="vendedor"&&role!=="encargado")||saving.current||!confirmed)return;
    const amount=Number(price);
    const id=requestId.current??crypto.randomUUID();
    const sale={requestId:id,siteId:snapshot.siteId,serial,price:amount,
      paid:amount,paymentMethod:payment};
    const issue=validateRetailSale(sale);
    if(issue){toast.error(issue);return;}
    requestId.current=id;
    saving.current=true;setBusy(true);
    try{
      const response=await performRetailSale(sale);
      setReceipt(response);setConfirmed(false);requestId.current=null;
      toast.success(response.replayed?"Venta confirmada sin duplicar":"Venta registrada con su IMEI");
      await refresh();
    }catch(error){
      toast.error(error instanceof Error?error.message:"La venta no pudo confirmarse.");
    }finally{saving.current=false;setBusy(false);}
  };
  const invalidateSale=()=>{
    requestId.current=null;setConfirmed(false);setReceipt(null);
  };
  const canSale=Boolean(snapshot?.cashState==="open" &&
    snapshot?.unitsWithRealCost && !busy);
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
        <Button asChild size="sm" variant="outline"><Link to="/traslados">Traslados</Link></Button>
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
      <div className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><ShoppingBag className="size-5"/> Venta minorista por IMEI</h2>
        <p className="text-sm text-muted-foreground">
          Cada venta requiere una caja abierta, equipo físicamente disponible en este local,
          costo real y precio superior al costo. El servidor revalida todo antes de vender.
        </p>
        {!canSale?<p role="status" className="rounded-lg border bg-muted/30 p-3 text-sm">
          No hay condiciones confirmadas para vender: revisa caja, traslado
          de mercancía al local y costos reales de cada equipo.
        </p>:null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="nx-sale-serial">IMEI / Serial</Label>
            <Input id="nx-sale-serial" value={serial} disabled={busy}
              onChange={e=>{setSerial(e.target.value);invalidateSale();}}
              placeholder="Escanea o escribe el IMEI"/>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nx-sale-price">Precio completo (COP)</Label>
            <Input id="nx-sale-price" type="number" min="1" step="1" value={price}
              disabled={busy} onChange={e=>{setPrice(e.target.value);invalidateSale();}}/>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nx-sale-payment">Medio de pago</Label>
            <select id="nx-sale-payment" value={payment} disabled={busy}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              onChange={e=>{setPayment(e.target.value as RetailPayment);invalidateSale();}}>
              <option value="efectivo">{retailPaymentLabel.efectivo}</option>
              <option value="transferencia">{retailPaymentLabel.transferencia}</option>
            </select>
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 size-4" checked={confirmed}
            disabled={!canSale} onChange={e=>setConfirmed(e.target.checked)}/>
          Confirmo el IMEI, el precio {price?cop(Number(price)):"indicado"} y que recibí el pago completo.
        </label>
        <Button disabled={!canSale||!confirmed||busy} onClick={()=>void executeSale()}>
          {busy?"Validando...":"Registrar venta"}
        </Button>
        {receipt?<p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <BadgeCheck className="mr-2 inline size-4"/>
          Venta registrada: {receipt.serial} · {cop(receipt.price)} · Comprobante {receipt.saleId}
        </p>:null}
      </div>
    </>}
  </section>;
};
export default MiSede;
