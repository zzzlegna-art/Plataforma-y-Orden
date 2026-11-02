import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Banknote, CalendarClock, CheckCircle2, CircleDollarSign, ClipboardCheck, LockKeyhole, RefreshCw, RotateCcw, ShieldCheck, Store, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { RetailSiteFinancePanel } from "./RetailSiteFinancePanel";
import { CashClosureAuditPanel } from "./CashClosureAuditPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getCashDayReport, runCashOperation, CASH_STATE_LABEL, validateCashOperation,
  type CashDayReport, type CashOperation, type CashStoreDay } from "@/lib/nexora-cash-day";

const money = (n: number) => new Intl.NumberFormat("es-CO", {
  style:"currency",currency:"COP",maximumFractionDigits:0,
}).format(n);
const dateTime = (s: string|null) => s
  ? new Date(s).toLocaleString("es-CO",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Bogota"})
  : "—";
const getTotals = (stores: readonly CashStoreDay[]) => stores.reduce((acc,s) => ({
  active:acc.active+(s.state==="open"?1:0),
  closed:acc.closed+(s.state==="closed"?1:0),
  cash:acc.cash+s.salesCash,
  transfer:acc.transfer+s.salesTransfer,
  expenses:acc.expenses+s.expenses,
}),{active:0,closed:0,cash:0,transfer:0,expenses:0});

const CajaDiariaTab = () => {
  const [report,setReport] = useState<CashDayReport|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [pending,setPending] = useState<{action:CashOperation;site:CashStoreDay}|null>(null);
  const [amount,setAmount] = useState("");
  const [note,setNote] = useState("");
  const current=useRef(0);
  const isSaving=useRef(false);

  const refresh=useCallback(async () => {
    const id=++current.current;
    setLoading(true);
    try {
      const r=await getCashDayReport();
      if(id===current.current)setReport(r);
    } catch(e){
      if(id===current.current){
        setReport(null);
        toast.error(e instanceof Error?e.message:"No pudo consultarse la caja.");
      }
    } finally { if(id===current.current)setLoading(false); }
  },[]);
  useEffect(()=>{
    void refresh();
    return ()=>{current.current++;};
  },[refresh]);

  const openDialog=(action:CashOperation,site:CashStoreDay)=>{
    setPending({action,site});setAmount("");setNote("");
  };
  const closeDialog=()=>{if(!isSaving.current)setPending(null);};
  const submit=async ()=>{
    if(!pending||isSaving.current) return;
    const value=pending.action==="reopen"?null:Number(amount);
    const error=validateCashOperation(pending.action,value,note);
    if(error){toast.error(error);return;}
    isSaving.current=true;setBusy(true);
    try {
      await runCashOperation(pending.action,pending.site.siteId,value,note);
      toast.success(pending.action==="open"?"Apertura registrada con auditoría":"Caja reabierta con registro de motivo");
      setPending(null);setAmount("");setNote("");
      await refresh();
    } catch(e){toast.error(e instanceof Error?e.message:"No se pudo procesar la caja.");}
    finally{isSaving.current=false;setBusy(false);}
  };

  const stats=getTotals(report?.stores??[]);
  const ready=Boolean(report?.initialApproved);
  const n=report?.stores.length??0;
  return (
    <section className="space-y-5" aria-label="Caja diaria multisede">
      <PageHeader title="Caja diaria" description="Aperturas, efectivo, transferencias, arqueo y auditoría por local." />
      <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-white via-emerald-50 to-cyan-100 p-5 text-slate-900 shadow-xl shadow-emerald-950/5 dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950 dark:text-white dark:shadow-black/20 sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-16 h-60 w-60 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 dark:border-emerald-300/25 bg-emerald-100 dark:bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-900 dark:text-emerald-100">
              <Wallet className="h-3.5 w-3.5" /> Control financiero · Nexora 2.0
            </span>
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">Control de caja por local</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Un único día de caja por local, con gastos autorizados, ingresos separados
              por medio de pago y diferencias de cierre documentadas.
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={loading||busy}
            className="border-slate-300 bg-white/80 text-slate-900 hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            onClick={()=>void refresh()}><RefreshCw className="h-4 w-4" /> Actualizar</Button>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {caption:"Locales abiertos",value:String(stats.active),icon:Store},
            {caption:"Cajas cerradas",value:String(stats.closed),icon:CheckCircle2},
            {caption:"Ventas en efectivo",value:money(stats.cash),icon:Banknote},
            {caption:"Ventas por transferencia",value:money(stats.transfer),icon:CircleDollarSign},
          ].map((metric)=>{
            const Icon=metric.icon;
            return <div key={metric.caption} className="rounded-xl border border-slate-200 bg-white/75 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none p-3 sm:p-4">
              <Icon className="mb-3 h-4 w-4 text-emerald-700 dark:text-emerald-200" />
              <p className="text-lg font-bold tabular-nums sm:text-xl">{metric.value}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{metric.caption}</p>
            </div>;
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <CalendarClock className="h-4 w-4 text-primary" />
          Jornada contable: {report?.businessDate??"Consultando..."}
        </p>
        <p className="text-xs text-muted-foreground">Zona horaria: Bogotá, Colombia · un cierre por jornada, salvo reapertura auditada</p>
      </div>

      {!ready ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-5">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"/>
          <div>
            <p className="font-semibold">Caja operativa todavía bloqueada</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Registra los locales, termina la conciliación física del inventario y firma el acta inicial.
              Además, cada local deberá tener un Encargado con permisos reales activados.
              La preparación de perfiles no concede autorización para manejar dinero.
            </p>
          </div>
        </div>
      ) : null}

      {loading && !report ? <p role="status" className="rounded-xl border p-6 text-sm text-muted-foreground">Cargando jornadas de caja...</p>
      : n===0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-9 text-center">
          <Store className="mx-auto h-10 w-10 text-primary" />
          <h3 className="mt-3 font-semibold">Sin locales comerciales registrados</h3>
          <p className="mt-2 text-sm text-muted-foreground">Crea los locales desde Administración → Ciudades y sedes para visualizar aquí sus jornadas.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {report?.stores.map((site)=>(
            <article key={site.siteId} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4 sm:p-5">
                <div>
                  <h3 className="flex items-center gap-2 font-semibold"><Store className="h-4 w-4 text-primary"/>{site.siteName}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{site.managerEnabled?"Encargado autorizado":"Encargado pendiente de activación"}</p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{CASH_STATE_LABEL[site.state]}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4 sm:p-5">
                {[
                  ["Base de apertura",site.openingCash],
                  ["Ingresos en efectivo",site.salesCash],
                  ["Transferencias recibidas",site.salesTransfer],
                  ["Gastos autorizados",site.expenses],
                ].map(([label,value])=>(
                  <div key={String(label)} className="rounded-xl border bg-muted/10 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-lg font-bold tabular-nums">{money(Number(value))}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 px-4 pb-4 sm:px-5 sm:pb-5">
                <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3 text-sm">
                  <span>Efectivo esperado</span>
                  <strong className="tabular-nums">{money(site.expectedCash)}</strong>
                </div>
                {site.state==="closed" ? (
                  <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span>Diferencia del cierre</span>
                    <strong className="tabular-nums">{site.closingDifference===null?"—":money(site.closingDifference)}</strong>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Apertura: {dateTime(site.openedAt)} · Cierre: {dateTime(site.closedAt)}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4"/> Movimientos auditados
                  </span>
                  {site.state==="not_opened" ? (
                    <Button size="sm" disabled={!ready||!site.managerEnabled||busy}
                      onClick={()=>openDialog("open",site)}><ClipboardCheck className="h-4 w-4"/> Abrir caja</Button>
                  ) : site.state==="closed" ? (
                    <Button size="sm" variant="outline" disabled={!site.managerEnabled||busy}
                      onClick={()=>openDialog("reopen",site)}><RotateCcw className="h-4 w-4"/> Reapertura excepcional</Button>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <LockKeyhole className="h-4 w-4"/> Gastos y cierre: Encargado
                    </span>
                  )}
                </div>
                {!site.managerEnabled ? (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
                    La caja se habilitará después de activar el perfil del Encargado y vincularlo al local.
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
      <RetailSiteFinancePanel />
      <CashClosureAuditPanel />

      <div className="flex items-start gap-2 rounded-xl border p-4 text-xs text-muted-foreground">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0"/>
        La tabla retail está preparada, pero el POS aún no tiene autorización para vender.
        Los ingresos mayoristas no forman parte de estas cajas y ningún IMEI puede registrarse dos veces
        en el futuro libro minorista.
      </div>

      <Dialog open={pending!==null} onOpenChange={(v)=>{if(!v)closeDialog();}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pending?.action==="reopen"?"Reapertura excepcional":"Apertura diaria de caja"}</DialogTitle>
            <DialogDescription>
              {pending?.site.siteName} · Las operaciones se verifican nuevamente en Supabase antes de registrar dinero.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {pending?.action==="open" ? (
              <div className="space-y-2">
                <Label htmlFor="cash-open-amount">Efectivo inicial (COP)</Label>
                <Input id="cash-open-amount" type="number" min={0} step="0.01"
                  value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="0" />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="cash-reopen-note">Motivo de reapertura *</Label>
                <Input id="cash-reopen-note" maxLength={500} value={note}
                  onChange={(e)=>setNote(e.target.value)} placeholder="Describe el error a corregir"/>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={busy}>Cancelar</Button>
            <Button disabled={busy||!pending|| (pending.action==="open"&&!amount)||
              Boolean(pending&&validateCashOperation(pending.action,
                pending.action==="open"?Number(amount):null,note))}
              onClick={()=>void submit()}>Confirmar con auditoría</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
export default CajaDiariaTab;
