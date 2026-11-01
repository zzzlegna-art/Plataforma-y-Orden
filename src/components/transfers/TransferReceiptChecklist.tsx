import { useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight, Check, ClipboardCheck, ClipboardList,
  PackageCheck, PackageX, ShieldCheck, Truck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  planTransferReceipt,
  type DispatchedSerial, type TransferReceiptPlan,
} from "@/lib/nexora-transfer-rules";

type Decision = "sin_marcar" | "recibido" | "no_llego";

export interface TransferReceiptItem {
  decision: Decision;
  observation: string;
}

export interface TransferReceiptChecklistProps {
  transferCode: string;
  originName: string;
  destinationName: string;
  dispatched: readonly DispatchedSerial[];
  /** El servidor debe aplicar la confirmación y retorno en UNA transacción atómica.
   * Si falla, esta vista mantiene las marcas para corregir/reintentar. */
  onConfirm: (plan: TransferReceiptPlan) => Promise<void>;
}

export const TransferReceiptChecklist = ({
  transferCode, originName, destinationName, dispatched, onConfirm,
}: TransferReceiptChecklistProps) => {
  const [decisions, setDecisions] = useState<Record<string, TransferReceiptItem>>({});
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const locked = useRef(false);

  const byUnit = (unitId: string): TransferReceiptItem =>
    decisions[unitId] ?? { decision: "sin_marcar", observation: "" };

  const setDecision = (unitId: string, decision: Decision) => {
    if (locked.current) return;
    setDecisions((current) => ({
      ...current,
      [unitId]: { ...current[unitId], decision, observation: current[unitId]?.observation ?? "" },
    }));
  };

  const setObservation = (unitId: string, observation: string) => {
    if (locked.current) return;
    setDecisions((current) => ({
      ...current,
      [unitId]: { ...current[unitId], decision: current[unitId]?.decision ?? "sin_marcar", observation },
    }));
  };

  const summary = useMemo(() => {
    const received = dispatched.filter((u) => decisions[u.unitId]?.decision === "recibido").length;
    const missing = dispatched.filter((u) => decisions[u.unitId]?.decision === "no_llego").length;
    const missingNotes = dispatched.filter(
      (u) => decisions[u.unitId]?.decision === "no_llego" && !decisions[u.unitId]?.observation?.trim(),
    ).length;
    return { received, missing, unmarked: dispatched.length - received - missing, missingNotes };
  }, [decisions, dispatched]);

  const confirm = async () => {
    if (locked.current || confirmed) return;
    let plan: TransferReceiptPlan;
    try {
      plan = planTransferReceipt(
        dispatched,
        dispatched.filter((u) => decisions[u.unitId]?.decision === "recibido").map((u) => u.serial),
        dispatched.filter((u) => decisions[u.unitId]?.decision === "no_llego")
          .map((u) => ({ serial: u.serial, observation: decisions[u.unitId]?.observation ?? "" })),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Completa la revisión de todos los equipos.");
      return;
    }

    locked.current = true;
    setSaving(true);
    try {
      await onConfirm(plan);
      setConfirmed(true);
      toast.success(
        plan.missingCount
          ? `Recepción registrada: ${plan.receivedCount} recibidos y ${plan.missingCount} pendientes de retorno al origen.`
          : "Recepción completa registrada correctamente.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo confirmar la recepción. Revisa la conexión.");
    } finally {
      locked.current = false;
      setSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm" aria-label="Verificación física del traslado">
      <header className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-5 py-6 text-white sm:px-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="relative space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-200">
            <ClipboardCheck className="h-3.5 w-3.5" /> Recepción física multisede
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Verificar traslado {transferCode}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-300">
              <span>{originName}</span><ArrowLeftRight className="h-4 w-4 shrink-0" /><span>{destinationName}</span>
            </div>
          </div>
          <p className="max-w-xl text-xs leading-relaxed text-slate-300">
            Marca individualmente los equipos recibidos. Si un IMEI no llegó,
            selecciona «No llegó» y explica la diferencia. La devolución al origen quedará pendiente de su verificación física.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 border-b p-4 sm:grid-cols-4 sm:gap-3">
        {[
          { name: "Enviados", value: dispatched.length, Icon: Truck },
          { name: "Recibidos", value: summary.received, Icon: PackageCheck },
          { name: "No llegaron", value: summary.missing, Icon: PackageX },
          { name: "Sin verificar", value: summary.unmarked, Icon: ClipboardList },
        ].map(({ name, value, Icon }) => (
          <div key={name} className="rounded-xl border bg-muted/15 p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="h-4 w-4" /><span className="text-xs">{name}</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Verificación por IMEI</h3>
          <span className="text-xs text-muted-foreground">
            {summary.received + summary.missing} de {dispatched.length} verificados
          </span>
        </div>

        <div className="space-y-2">
          {dispatched.map(({ unitId, serial }, index) => {
            const current = byUnit(unitId);
            return (
              <div key={unitId} className="rounded-xl border bg-background/60 p-3.5 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Equipo {index + 1}
                    </p>
                    <p className="break-all font-mono text-sm font-semibold">{serial}</p>
                  </div>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={`Estado del IMEI ${serial}`}>
                    <button
                      type="button"
                      disabled={saving || confirmed}
                      aria-pressed={current.decision === "recibido"}
                      onClick={() => setDecision(unitId, "recibido")}
                      className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${current.decision === "recibido" ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "hover:bg-muted"}`}
                    >
                      <Check className="h-4 w-4" /> Recibido
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      aria-pressed={current.decision === "no_llego"}
                      onClick={() => setDecision(unitId, "no_llego")}
                      className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${current.decision === "no_llego" ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "hover:bg-muted"}`}
                    >
                      <PackageX className="h-4 w-4" /> No llegó
                    </button>
                  </div>
                </div>
                {current.decision === "no_llego" ? (
                  <div className="mt-3 space-y-1.5">
                    <label htmlFor={`observation-${unitId}`} className="text-xs font-semibold">
                      Observación obligatoria
                    </label>
                    <Input
                      id={`observation-${unitId}`}
                      disabled={saving || confirmed}
                      maxLength={500}
                      value={current.observation}
                      onChange={(event) => setObservation(unitId, event.target.value)}
                      placeholder="Ej. Este celular no llegó en la caja"
                      aria-invalid={!current.observation.trim()}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <footer className="space-y-3 border-t bg-muted/15 px-4 py-4 sm:px-5">
        <div className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          Los faltantes se documentan para la bodega que emitió el traslado.
          Ningún IMEI se reincorpora a su inventario disponible hasta que sea verificado allí.
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-xs text-muted-foreground">
            {confirmed ? "Recepción confirmada. Puedes consultar su acta." : summary.unmarked > 0
              ? `Faltan ${summary.unmarked} IMEI por marcar.`
              : summary.missingNotes > 0
                ? `Faltan ${summary.missingNotes} observaciones de faltantes.`
                : "Todos los equipos han sido verificados."}
          </p>
          <Button
            loading={saving}
            disabled={confirmed || saving || dispatched.length === 0 || summary.unmarked > 0 || summary.missingNotes > 0}
            onClick={() => void confirm()}
          >
            <ClipboardCheck className="h-4 w-4" /> Confirmar recepción
          </Button>
        </div>
      </footer>
    </section>
  );
};
