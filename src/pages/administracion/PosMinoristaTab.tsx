import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, Banknote, CreditCard, Fingerprint, LockKeyhole, PackageCheck, RefreshCw, ScanLine, ShieldCheck, Store, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCashDayReport, type CashDayReport } from "@/lib/nexora-cash-day";
import { listNexoraNetwork, type NexoraSite } from "@/lib/nexora-sites";
import { POS_REASON_LABEL, runPosPreflight, type PosPreflight } from "@/lib/nexora-pos-preflight";
import { performRetailSale, retailPaymentLabel, validateRetailSale,
  type RetailPayment, type RetailReceipt, type RetailSaleInput } from "@/lib/nexora-retail-pos";

const cop = (value: number) => new Intl.NumberFormat("es-CO",{
  style:"currency",currency:"COP",maximumFractionDigits:0,
}).format(value);
const control = "flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

const PosMinoristaTab = () => {
  const [sites,setSites]=useState<NexoraSite[]>([]);
  const [cash,setCash]=useState<CashDayReport|null>(null);
  const [siteId,setSiteId]=useState("");
  const [serial,setSerial]=useState("");
  const [price,setPrice]=useState("");
  const [payment,setPayment]=useState<RetailPayment>("efectivo");
  const [preflight,setPreflight]=useState<PosPreflight|null>(null);
  const [receipt,setReceipt]=useState<RetailReceipt|null>(null);
  const [confirmed,setConfirmed]=useState(false);
  const [requestId,setRequestId]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const read=useRef(0);
  const saving=useRef(false);
  const active=sites.filter((s)=>s.isActive&&s.siteType==="local");
  const chosen=active.find((s)=>s.id===siteId)?.id??active[0]?.id??"";
  const session=cash?.stores.find((s)=>s.siteId===chosen);
  const operational=Boolean(cash?.initialApproved&&session?.managerEnabled&&session.state==="open");
  const saleDraft:RetailSaleInput={
    requestId:requestId??"00000000-0000-0000-0000-000000000000",
    siteId:chosen,serial,price:Number(price),paid:Number(price),paymentMethod:payment,
  };

  const refresh=useCallback(async()=>{
    const call=++read.current;setLoading(true);
    try {
      const [network,day]=await Promise.all([listNexoraNetwork(),getCashDayReport()]);
      if(call!==read.current)return;
      setSites(network.sites);setCash(day);
    } catch(error){
      if(call===read.current){
        setCash(null);
        toast.error(error instanceof Error?error.message:"No se pudo cargar el punto de venta.");
      }
    } finally{if(call===read.current)setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();return()=>{read.current++;};},[refresh]);

  const invalidate=()=>{
    setPreflight(null);setConfirmed(false);setReceipt(null);setRequestId(null);
  };
  const check=async()=>{
    if(busy||!chosen||!serial.trim()||!price||!Number.isSafeInteger(Number(price))||Number(price)<=0)return;
    setBusy(true);setPreflight(null);setConfirmed(false);setRequestId(null);
    const call=++read.current;
    try{
      const r=await runPosPreflight(chosen,serial,Number(price));
      if(call===read.current)setPreflight(r);
    }catch(error){
      if(call===read.current)toast.error(error instanceof Error?error.message:"No pudo verificarse el IMEI.");
    }finally{setBusy(false);}
  };
  const sell=async()=>{
    if(saving.current||!confirmed||!preflight?.eligibleForFuturePos||!operational)return;
    const id=requestId??crypto.randomUUID();
    setRequestId(id);
    const data:RetailSaleInput={...saleDraft,requestId:id};
    const issue=validateRetailSale(data);
    if(issue){toast.error(issue);return;}
    saving.current=true;setBusy(true);
    try{
      const result=await performRetailSale(data);
      setReceipt(result);setConfirmed(false);setPreflight(null);setRequestId(null);
      toast.success(result.replayed?"Venta recuperada sin duplicarla":"Venta registrada y existencias descontadas");
      await refresh();
    }catch(error){
      toast.error(error instanceof Error?error.message:"La venta no se pudo confirmar; vuelve a intentar con la misma solicitud.");
    }finally{saving.current=false;setBusy(false);}
  };

  return <section className="space-y-5" aria-label="Punto de venta minorista por IMEI">
    <div className="relative overflow-hidden rounded-3xl border border-cyan-200/80 bg-gradient-to-br from-slate-50 via-white to-cyan-100 p-5 text-slate-900 shadow-lg shadow-cyan-950/5 dark:border-slate-700 dark:from-slate-950 dark:via-slate-900 dark:to-cyan-950 dark:text-slate-50 dark:shadow-black/20 sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 size-72 rounded-full bg-cyan-400/15 blur-3xl dark:bg-cyan-400/10" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/70 bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-cyan-800 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200">
            <Fingerprint className="h-3.5 w-3.5" /> Nexora Multisede · Ventas
          </p>
          <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Punto de venta minorista</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Un IMEI, una venta, un pago completo. El costo y la disponibilidad se verifican nuevamente en el servidor antes de registrar el comprobante.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={()=>void refresh()} disabled={loading||busy}
          className="border-slate-300 bg-white/80 text-slate-800 hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20">
          <RefreshCw className="h-4 w-4" /> Actualizar caja
        </Button>
      </div>
      <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
        {[
          {label:"Locales activos",value:active.length,icon:Store},
          {label:"Cajas abiertas",value:cash?.stores.filter((s)=>s.state==="open").length??0,icon:Wallet},
          {label:"Cajas autorizadas",value:cash?.stores.filter((s)=>s.managerEnabled).length??0,icon:ShieldCheck},
        ].map(({label,value,icon:Icon})=>(
          <div key={label} className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none">
            <Icon className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
            <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{label}</p>
          </div>
        ))}
      </div>
    </div>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
      <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
        <header className="flex items-start gap-3 border-b bg-muted/20 p-5 sm:p-6">
          <span className="rounded-xl bg-primary/10 p-3 text-primary"><ScanLine className="h-5 w-5"/></span>
          <div>
            <h3 className="text-lg font-bold">Preparar venta por IMEI</h3>
            <p className="mt-1 text-sm text-muted-foreground">Escanea el equipo, verifica su costo y registra un pago total.</p>
          </div>
        </header>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="retail-site">Local de venta</Label>
              <select className={control} id="retail-site" value={chosen} disabled={busy}
                onChange={(e)=>{setSiteId(e.target.value);invalidate();}}>
                {active.length===0?<option value="">No hay locales registrados</option>:null}
                {active.map((s)=><option value={s.id} key={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="retail-imei">IMEI / Serial</Label>
              <Input id="retail-imei" autoComplete="off" maxLength={160} value={serial} disabled={busy}
                placeholder="Escanea o escribe el IMEI"
                onChange={(e)=>{setSerial(e.target.value);invalidate();}}/>
            </div>
            <div className="space-y-2">
              <Label htmlFor="retail-price">Precio de venta (COP)</Label>
              <Input id="retail-price" type="number" min="1" step="1" value={price} disabled={busy}
                placeholder="0" onChange={(e)=>{setPrice(e.target.value);invalidate();}}/>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Medio de pago</p>
            <div className="grid grid-cols-2 gap-3">
              {(["efectivo","transferencia"] as const).map((kind)=>(
                <button type="button" key={kind} disabled={busy}
                  aria-pressed={payment===kind}
                  onClick={()=>{setPayment(kind);invalidate();}}
                  className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${payment===kind?"border-primary bg-primary/10 text-foreground":"border-border bg-card text-muted-foreground hover:bg-muted/40"}`}>
                  {kind==="efectivo"?<Banknote className="h-4 w-4"/>:<CreditCard className="h-4 w-4"/>}
                  {retailPaymentLabel[kind]}
                </button>
              ))}
            </div>
          </div>

          <Button className="w-full" variant="outline" disabled={!chosen||!serial.trim()||!price||Number(price)<=0||!Number.isSafeInteger(Number(price))||busy}
            onClick={()=>void check()}>
            <PackageCheck className="h-4 w-4"/> Verificar IMEI, sede y costo
          </Button>
          {preflight ? (
            <div role="status" className={`rounded-xl border p-4 ${preflight.eligibleForFuturePos?"border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100":"border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"}`}>
              <p className="flex items-center gap-2 text-sm font-bold">
                {preflight.eligibleForFuturePos?<BadgeCheck className="h-4 w-4"/>:<LockKeyhole className="h-4 w-4"/>}
                {POS_REASON_LABEL[preflight.reason]??"La comprobación no fue aprobada."}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div><span className="opacity-75">Costo real</span><p className="mt-1 font-semibold">{preflight.unitCost===null?"Sin costo":cop(preflight.unitCost)}</p></div>
                <div><span className="opacity-75">Venta propuesta</span><p className="mt-1 font-semibold">{cop(preflight.proposedPrice)}</p></div>
              </div>
            </div>
          ) : null}
          {preflight?.eligibleForFuturePos&&operational ? (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={confirmed} className="mt-1 size-4"
                  onChange={(e)=>setConfirmed(e.target.checked)}/>
                <span>Confirmo que recibí <strong>{cop(Number(price))}</strong> por {retailPaymentLabel[payment].toLowerCase()} y que entregué el IMEI indicado.</span>
              </label>
              <Button className="w-full" disabled={!confirmed||busy}
                onClick={()=>void sell()}>
                <ShieldCheck className="h-4 w-4"/> Registrar venta y descontar IMEI <ArrowRight className="h-4 w-4"/>
              </Button>
            </div>
          ) : null}
          {receipt ? (
            <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
              <p className="flex items-center gap-2 font-bold"><BadgeCheck className="h-5 w-5"/> Comprobante de venta registrado</p>
              <p className="mt-2 break-all font-mono text-xs">{receipt.saleId}</p>
              <p className="mt-2 text-sm">IMEI {receipt.serial} · {cop(receipt.price)} · {retailPaymentLabel[receipt.paymentMethod]}</p>
              <p className="mt-1 text-xs">{new Date(receipt.soldAt).toLocaleString("es-CO",{timeZone:"America/Bogota"})}</p>
              <Button size="sm" className="mt-4" variant="outline" onClick={()=>{setSerial("");setPrice("");setReceipt(null);setPreflight(null);}}>
                Preparar otra venta
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">
          <h3 className="flex items-center gap-2 font-bold"><Wallet className="h-5 w-5 text-primary"/> Control de caja</h3>
          <p className="mt-2 text-sm text-muted-foreground">Se valida la caja y la autorización del local en cada venta, no solo al abrir la pantalla.</p>
          <div className="mt-4 space-y-3 text-sm">
            {[
              ["Inventario inicial conciliado",Boolean(cash?.initialApproved)],
              ["Local registrado",Boolean(chosen)],
              ["Encargado autorizado",Boolean(session?.managerEnabled)],
              ["Caja abierta hoy",session?.state==="open"],
            ].map(([label,valid])=>(
              <div key={String(label)} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0">
                <span>{label}</span>
                {valid?<BadgeCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400"/>:
                  <LockKeyhole className="h-4 w-4 text-amber-700 dark:text-amber-400"/>}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/[0.08] dark:text-amber-100">
          <h3 className="flex items-center gap-2 font-bold"><LockKeyhole className="h-4 w-4"/> Activación responsable</h3>
          <p className="mt-2 text-sm leading-relaxed">
            Mientras no existan sedes, inventario inicial aprobado, Encargado habilitado y caja abierta, este POS no puede registrar ventas.
            La preparación de roles no concede permisos y no hay atajos desde el navegador.
          </p>
        </div>
      </aside>
    </div>
  </section>;
};
export default PosMinoristaTab;
