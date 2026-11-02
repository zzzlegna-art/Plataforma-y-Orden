import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightLeft, CheckCircle2, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/page-header";
import { listNexoraNetwork, type NexoraSite } from "@/lib/nexora-sites";
import { loadMoneyTransfers, sendMoneyTransfer, transitionMoneyTransfer,
  validateMoneyTransfer, type MoneyTransfer, type MoneyTransferDraft } from "@/lib/nexora-money-transfers";

const empty: MoneyTransferDraft = {
  originSiteId:"",destinationSiteId:"",originAccount:"",destinationAccount:"",
  amount:0,proofReference:"",
};
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";
const money = (value: number) => new Intl.NumberFormat("es-CO",{
  style:"currency",currency:"COP",maximumFractionDigits:2,
}).format(value);
const date = (iso: string|null) => iso ? new Date(iso).toLocaleString("es-CO",{
  timeZone:"America/Bogota",dateStyle:"medium",timeStyle:"short",
}) : "Pendiente";
export const TesoreriaTab = () => {
  const [sites,setSites] = useState<NexoraSite[]>([]);
  const [transfers,setTransfers] = useState<MoneyTransfer[]>([]);
  const [form,setForm] = useState<MoneyTransferDraft>(empty);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [notes,setNotes] = useState<Record<string,string>>({});
  const stableRequest = useRef<string|null>(null);
  const busyRef = useRef(false);
  const current = useRef(0);
  const refresh = useCallback(async () => {
    const token=++current.current;
    setLoading(true);
    try {
      const [network,rows] = await Promise.all([listNexoraNetwork(),loadMoneyTransfers()]);
      if(token===current.current){setSites(network.sites);setTransfers(rows);}
    } catch(error){
      if(token===current.current) toast.error(error instanceof Error?error.message:"No se pudo cargar tesorería.");
    } finally {if(token===current.current)setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();return ()=>{current.current+=1;};},[refresh]);
  const update = <K extends keyof MoneyTransferDraft>(key:K,value:MoneyTransferDraft[K])=>{
    setForm(previous=>({...previous,[key]:value}));
  };
  const execute = async (work:()=>Promise<void>,message:string) => {
    if(busyRef.current)return;
    busyRef.current=true;setBusy(true);
    try {await work();toast.success(message);await refresh();}
    catch(error){toast.error(error instanceof Error?error.message:"No se confirmó la operación.");}
    finally {busyRef.current=false;setBusy(false);}
  };
  const send = () => void execute(async()=>{
    const requestId=stableRequest.current??crypto.randomUUID();
    stableRequest.current=requestId;
    await sendMoneyTransfer(form,requestId);
    stableRequest.current=null;
    setForm(empty);
  },"Envío monetario documentado. No suma ingresos.");
  const confirm = (transfer:MoneyTransfer) => void execute(async()=>{
    const note=(notes[transfer.id]??"").trim();
    await transitionMoneyTransfer(transfer.status==="sent"?"receive":"reconcile",transfer.id,note);
    setNotes(previous=>({...previous,[transfer.id]:""}));
  },transfer.status==="sent"?"Recepción documentada":"Conciliación registrada");
  const siteName=(id:string)=>sites.find(s=>s.id===id)?.name??"Sede sin acceso";
  const invalid=validateMoneyTransfer(form);
  return <section className="space-y-6" aria-label="Transferencias monetarias internas">
    <PageHeader title="Tesorería entre sedes" description="Solo Administrador. Envíos, recepción y conciliación documental; nunca se computan como ventas."/>
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <Wallet className="mt-1 h-6 w-6 text-primary"/>
        <div>
          <h2 className="font-semibold">Nueva transferencia interna · COP</h2>
          <p className="mt-1 text-sm text-muted-foreground">Registra aquí únicamente movimientos reales con comprobante. No modifica el efectivo de caja ni presume saldo bancario.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="money-origin-site">Sede de origen</Label>
          <select id="money-origin-site" className={selectClass} value={form.originSiteId}
            onChange={e=>update("originSiteId",e.target.value)}>
            <option value="">Selecciona origen</option>
            {sites.filter(s=>s.isActive).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>
        <div className="space-y-1.5"><Label htmlFor="money-destination-site">Sede destino</Label>
          <select id="money-destination-site" className={selectClass} value={form.destinationSiteId}
            onChange={e=>update("destinationSiteId",e.target.value)}>
            <option value="">Selecciona destino</option>
            {sites.filter(s=>s.isActive&&s.id!==form.originSiteId).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>
        <div className="space-y-1.5"><Label htmlFor="money-origin-account">Cuenta/medio de origen</Label>
          <Input id="money-origin-account" maxLength={120} value={form.originAccount} placeholder="Referencia de cuenta o caja"
            onChange={e=>update("originAccount",e.target.value)}/></div>
        <div className="space-y-1.5"><Label htmlFor="money-destination-account">Cuenta/medio destino</Label>
          <Input id="money-destination-account" maxLength={120} value={form.destinationAccount} placeholder="Referencia de cuenta o caja"
            onChange={e=>update("destinationAccount",e.target.value)}/></div>
        <div className="space-y-1.5"><Label htmlFor="money-amount">Importe COP</Label>
          <Input id="money-amount" inputMode="decimal" type="number" min="0.01" step="0.01"
            value={form.amount||""} onChange={e=>update("amount",Number(e.target.value))}/></div>
        <div className="space-y-1.5"><Label htmlFor="money-proof">Referencia del comprobante real</Label>
          <Input id="money-proof" maxLength={250} value={form.proofReference} placeholder="Número/soporte de envío"
            onChange={e=>update("proofReference",e.target.value)}/></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs text-muted-foreground">{invalid??"La operación se registrará con auditoría, no como venta."}</p>
        <Button disabled={Boolean(invalid)||busy||loading} onClick={send}>
          <ArrowRightLeft className="h-4 w-4"/> Registrar envío real
        </Button>
      </div>
    </div>
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Historial de envíos, recepción y conciliación</h2>
        <Button variant="outline" size="sm" onClick={()=>void refresh()} disabled={busy||loading}>
          <RefreshCw className="h-4 w-4"/> Actualizar
        </Button>
      </div>
      {loading?<p role="status" className="p-5 text-sm text-muted-foreground">Consultando transferencias...</p>
      :transfers.length===0?<p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Sin transferencias registradas. No se han inventado movimientos de dinero.</p>
      :transfers.map(t=><article key={t.id} className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-semibold">{siteName(t.originSiteId)} → {siteName(t.destinationSiteId)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.originAccount} → {t.destinationAccount}</p>
            <p className="text-xs text-muted-foreground">Comprobante: {t.proofReference} · Envío: {date(t.sentAt)}</p>
          </div>
          <div className="text-right"><p className="font-bold tabular-nums">{money(t.amount)}</p>
            <span className="text-xs text-muted-foreground">{t.status==="sent"?"Pendiente de recepción":t.status==="received"?"Pendiente de conciliación":"Conciliada"}</span>
          </div>
        </div>
        {t.status!=="reconciled"?<div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
          <div className="min-w-48 flex-1 space-y-1"><Label htmlFor={"money-note-"+t.id}>Observación/evidencia real</Label>
            <Input id={"money-note-"+t.id} maxLength={500} value={notes[t.id]??""}
              onChange={e=>setNotes(v=>({...v,[t.id]:e.target.value}))}
              placeholder={t.status==="sent"?"Confirmación de recepción":"Referencia de conciliación"}/>
          </div>
          <Button variant="outline" disabled={busy||!(notes[t.id]??"").trim()|| (notes[t.id]??"").trim().length<5}
            onClick={()=>confirm(t)}><ShieldCheck className="h-4 w-4"/>{t.status==="sent"?"Confirmar recepción":"Conciliar"}</Button>
        </div>:<p className="mt-2 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4"/> Conciliada el {date(t.reconciledAt)}</p>}
      </article>)}
    </div>
    <p className="text-xs text-muted-foreground">Módulo documental V4. No calcula saldos bancarios ni afecta cajas o estadísticas comerciales. Todas las acciones verifican el rol Administrador en Supabase.</p>
  </section>;
};
export default TesoreriaTab;
