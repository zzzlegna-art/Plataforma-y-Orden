import { useState } from "react";
import { Barcode,CheckCircle2,ChevronDown,ChevronUp,ClipboardCheck,LockKeyhole,ScanLine,ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  parsePhysicalScanBatch,registerPhysicalScanBatch,
  type PhysicalBatchReceipt,
} from "@/lib/nexora-physical-scan-batch";

/** Lecturas reales del escáner. Envío atómico y explícitamente aprobado por admin. */
export const PhysicalBatchScanPanel=({
  siteId,siteName,approvalLocked,onCompleted,
}:{
  siteId:string;siteName:string;approvalLocked:boolean;
  onCompleted:()=>void;
})=>{
  const [expanded,setExpanded]=useState(false);
  const [raw,setRaw]=useState("");
  const [notes,setNotes]=useState("");
  const [prepared,setPrepared]=useState<string[]|null>(null);
  const [ack,setAck]=useState(false);
  const [token,setToken]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [receipt,setReceipt]=useState<PhysicalBatchReceipt|null>(null);
  const canPrepare=!approvalLocked&&Boolean(siteId)&&!busy;
  const canSubmit=canPrepare&&prepared!==null&&ack&&token.trim()==="COTEJAR";
  const prepare=()=>{
    if(!canPrepare)return;
    setError(null);setReceipt(null);
    try{
      const rows=parsePhysicalScanBatch(raw);
      setPrepared(rows);setAck(false);setToken("");
    }catch(e:unknown){
      setPrepared(null);setError(e instanceof Error?e.message:"Lecturas inválidas.");
    }
  };
  const submit=async()=>{
    if(!canSubmit||!prepared)return;
    setBusy(true);setError(null);setReceipt(null);
    try{
      const result=await registerPhysicalScanBatch(siteId,prepared,notes);
      setReceipt(result);setPrepared(null);setRaw("");setNotes("");
      setAck(false);setToken("");
      onCompleted();
    }catch(e:unknown){
      setError((e instanceof Error?e.message:"No se confirmó el lote.")+
        " Verifica los cotejos existentes antes de reintentar.");
    }finally{setBusy(false);}
  };
  return <section aria-label="Escaneo físico por lotes"
    className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-indigo-50 via-white to-sky-50 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-900 dark:bg-indigo-400/10 dark:text-indigo-200">
          <ScanLine className="size-5"/>
        </span>
        <div className="max-w-xl">
          <h3 className="text-base font-bold text-slate-950 dark:text-white sm:text-lg">
            Conteo rápido · escaneo por lote
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Escanea hasta 50 IMEI, uno por línea. Se guardan juntos o se rechazan todos;
            nunca se mueve inventario comercial.
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" disabled={busy} aria-expanded={expanded}
        aria-controls="nexora-scan-batch" onClick={()=>setExpanded(v=>!v)}
        className="border-slate-300 bg-white/80 text-slate-900 dark:border-slate-600 dark:bg-white/10 dark:text-white">
        {expanded?"Ocultar escáner":"Abrir escáner por lote"}
        {expanded?<ChevronUp className="size-4"/>:<ChevronDown className="size-4"/>}
      </Button>
    </div>
    {expanded?<div id="nexora-scan-batch" className="space-y-4 border-t p-4 sm:p-6">
      <div className="flex items-start gap-2 rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
        <LockKeyhole className="mt-0.5 size-4 shrink-0"/>
        Acceso de Administrador. Cada serial debe corresponder a una unidad que
        está físicamente presente ante el inspector en la sede seleccionada.
        No utilices listas históricas ni IMEI que no hayas visto o escaneado.
      </div>
      <p className="flex items-center gap-2 text-sm">
        <Barcode className="size-4 text-muted-foreground"/>
        <strong>Sede de conteo:</strong> {siteName||"Sin sede activa"}
      </p>
      {approvalLocked?<p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
        Inventario inicial ya aprobado. No se admiten cotejos adicionales.
      </p>:null}
      <div className="space-y-1.5">
        <Label htmlFor="physical-batch-serials">Lecturas de escáner (máximo 50)</Label>
        <Textarea id="physical-batch-serials" rows={6} value={raw}
          disabled={!canPrepare||prepared!==null}
          placeholder={"IMEI escaneado 1\nIMEI escaneado 2\nIMEI escaneado 3"}
          onChange={e=>{setRaw(e.target.value);setError(null);setReceipt(null);}}/>
        <p className="text-xs text-muted-foreground">
          Se admiten lecturas separadas por saltos de línea, coma, punto y coma o tabulación.
          No se toleran duplicados.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="physical-batch-notes">Notas del conteo (opcional)</Label>
        <Textarea id="physical-batch-notes" rows={2} maxLength={500}
          value={notes} disabled={!canPrepare||prepared!==null}
          onChange={e=>setNotes(e.target.value)}
          placeholder="Ejemplo: conteo físico presenciado en estante 2"/>
      </div>
      {!prepared?<Button variant="outline" disabled={!canPrepare} onClick={prepare}>
        <ClipboardCheck className="size-4"/> Revisar lecturas sin guardar
      </Button>:<div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-400/25 dark:bg-indigo-400/10">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4"/> {prepared.length} IMEI únicos preparados para {siteName}.
        </p>
        <p className="text-xs text-muted-foreground">
          La base comprobará cada IMEI, su estado histórico y que no exista otro
          cotejo vigente. Una falla impide guardar el lote completo.
        </p>
        <div className="max-h-32 overflow-auto rounded-lg border bg-background/60 p-3">
          <p className="break-all font-mono text-xs">{prepared.join(" · ")}</p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={ack} onCheckedChange={value=>setAck(value===true)}
            disabled={busy} aria-label="Confirmo presencia física de todos los IMEI"/>
          <span>Confirmo que estos IMEI fueron escaneados físicamente en <strong>{siteName}</strong>.</span>
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="physical-batch-confirm">Escribe COTEJAR para confirmar el lote</Label>
          <input id="physical-batch-confirm" value={token} disabled={busy}
            onChange={e=>setToken(e.target.value)}
            className="h-10 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-sm"
            autoComplete="off" placeholder="COTEJAR"/>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canSubmit} onClick={()=>{void submit();}}>
            <ScanLine className="size-4"/>
            {busy?"Confirmando en Supabase…":"Registrar lote físico"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={()=>{setPrepared(null);setAck(false);setToken("");}}>
            Corregir lecturas
          </Button>
        </div>
      </div>}
      {error?<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
        {error}
      </p>:null}
      {receipt?<p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0"/>
        {receipt.registered} cotejos guardados y auditados. Siguen pendientes de aprobación del inventario inicial;
        no representan stock disponible.
      </p>:null}
    </div>:null}
  </section>;
};
