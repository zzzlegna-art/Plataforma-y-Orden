import { useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardCheck, PackageSearch, ScanLine, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DispatchedSerial } from "@/lib/nexora-transfer-rules";
import { buildOriginReturnRpcArgs, type OriginReturnReview } from "@/lib/nexora-transfer-rpc";

type Decision = "sin_verificar" | "encontrado" | "no_encontrado";
type Mark = { decision: Decision; observation: string };

export const OriginReturnChecklist = ({
  returnId, returnCode, warehouseName, units, onConfirm,
}: {
  returnId: string;
  returnCode: string;
  warehouseName: string;
  units: readonly DispatchedSerial[];
  onConfirm: (rows: OriginReturnReview[]) => Promise<void>;
}) => {
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [scanValue, setScanValue] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const locked = useRef(false);

  const valueOf = (unitId: string): Mark =>
    marks[unitId] ?? { decision: "sin_verificar", observation: "" };

  const setMark = (unitId: string, update: Partial<Mark>) => {
    if (locked.current || confirmed) return;
    setMarks((current) => ({
      ...current,
      [unitId]: { ...current[unitId], ...update },
    }));
  };

  const scan = () => {
    if (locked.current || confirmed || saving) return;
    const serial = scanValue.trim().toUpperCase();
    if (!serial) return;
    const found = units.find((unit) => unit.serial.trim().toUpperCase() === serial);
    if (!found) {
      setScanMessage("Este IMEI no forma parte de la devolución.");
      toast.error("El IMEI no pertenece a esta devolución.");
      return;
    }
    if (valueOf(found.unitId).decision === "encontrado") {
      setScanMessage("Este IMEI ya fue marcado como encontrado.");
      setScanValue("");
      return;
    }
    setMark(found.unitId, { decision: "encontrado" });
    setScanMessage(`IMEI ${found.serial} verificado físicamente.`);
    setScanValue("");
  };

  const foundCount = units.filter((unit) => valueOf(unit.unitId).decision === "encontrado").length;
  const missingCount = units.filter((unit) => valueOf(unit.unitId).decision === "no_encontrado").length;
  const unmarked = units.length - foundCount - missingCount;
  const missingNotes = units.filter((unit) => {
    const value = valueOf(unit.unitId);
    return value.decision === "no_encontrado" && !value.observation.trim();
  }).length;

  const confirm = async () => {
    if (locked.current || confirmed) return;
    const review: OriginReturnReview[] = units.map((unit) => ({
      unitId: unit.unitId,
      found: valueOf(unit.unitId).decision === "encontrado",
      observation: valueOf(unit.unitId).observation.trim(),
    }));
    try {
      // Never send a partial review, or mark an unobserved unit as physically found.
      if (unmarked || missingNotes) throw new Error("Verifica cada IMEI y escribe las observaciones pendientes.");
      buildOriginReturnRpcArgs(returnId, units, review);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verificación incompleta.");
      return;
    }

    locked.current = true;
    setSaving(true);
    try {
      await onConfirm(review);
      setConfirmed(true);
      toast.success(`Devolución verificada: ${foundCount} encontrados y ${missingCount} incidencias.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo confirmar. Verifica el servidor antes de reintentar.");
    } finally {
      locked.current = false;
      setSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm" aria-label="Confirmar devolución en bodega">
      <header className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-white sm:p-6">
        <p className="inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-xs font-semibold text-sky-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Verificación física en origen
        </p>
        <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">Devolución {returnCode}</h2>
        <p className="mt-2 text-sm text-slate-300">Recibe y verifica en {warehouseName} cada IMEI que faltó en el envío.</p>
        <p className="mt-2 text-xs text-slate-300">
          Solo los equipos encontrados ingresarán al disponible. Los demás permanecerán en incidencia.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 border-b p-4 sm:grid-cols-4">
        {[
          { label: "Por revisar", value: units.length, icon: PackageSearch },
          { label: "Encontrados", value: foundCount, icon: CheckCircle2 },
          { label: "No encontrados", value: missingCount, icon: TriangleAlert },
          { label: "Sin marcar", value: unmarked, icon: ClipboardCheck },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-muted/20 p-3">
            <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <form
          aria-label="Escanear IMEI de devolución"
          onSubmit={(event) => { event.preventDefault(); scan(); }}
          className="space-y-2 rounded-xl border border-primary/20 bg-primary/[0.04] p-4"
        >
          <label htmlFor="return-imei-scan" className="flex items-center gap-2 text-sm font-semibold">
            <ScanLine className="h-4 w-4 text-primary" /> Escaneo de devolución
          </label>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Input
              id="return-imei-scan"
              value={scanValue}
              onChange={(event) => setScanValue(event.target.value)}
              disabled={saving || confirmed}
              placeholder="Escanea el IMEI que encontraste"
              inputMode="numeric"
              autoComplete="off"
              className="min-w-0 flex-1 font-mono"
            />
            <Button type="submit" variant="outline" disabled={saving || confirmed || !scanValue.trim()}>
              <ScanLine className="h-4 w-4" /> Encontrado
            </Button>
          </div>
          <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
            {scanMessage || "Pulsa Enter para marcar el equipo encontrado. Los IMEI repetidos no suman otra unidad."}
          </p>
        </form>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Unidades pendientes de devolución</h3>
          {units.map((unit) => {
            const current = valueOf(unit.unitId);
            return (
              <div key={unit.unitId} className="space-y-3 rounded-xl border p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="break-all font-mono text-sm font-semibold">{unit.serial}</span>
                  <div role="group" aria-label={`Verificar devolución IMEI ${unit.serial}`} className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving || confirmed}
                      aria-pressed={current.decision === "encontrado"}
                      onClick={() => setMark(unit.unitId, { decision: "encontrado" })}
                      className={`min-h-10 rounded-lg border px-3 text-xs font-semibold transition-colors ${current.decision === "encontrado" ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "hover:bg-muted"}`}
                    >
                      Encontrado
                    </button>
                    <button
                      type="button"
                      disabled={saving || confirmed}
                      aria-pressed={current.decision === "no_encontrado"}
                      onClick={() => setMark(unit.unitId, { decision: "no_encontrado" })}
                      className={`min-h-10 rounded-lg border px-3 text-xs font-semibold transition-colors ${current.decision === "no_encontrado" ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "hover:bg-muted"}`}
                    >
                      No encontrado
                    </button>
                  </div>
                </div>
                {current.decision === "no_encontrado" ? (
                  <div className="space-y-1.5">
                    <label htmlFor={`return-note-${unit.unitId}`} className="text-xs font-semibold">
                      Observación obligatoria de incidencia
                    </label>
                    <Input
                      id={`return-note-${unit.unitId}`}
                      value={current.observation}
                      onChange={(event) => setMark(unit.unitId, { observation: event.target.value })}
                      disabled={saving || confirmed}
                      maxLength={500}
                      aria-invalid={!current.observation.trim()}
                      placeholder="Ej. No se encontró en el conteo de bodega"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <footer className="space-y-3 border-t bg-muted/20 p-4 sm:p-5">
        <div className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          La recepción solo se confirma cuando el servidor registra el conteo y los eventos de cada IMEI.
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-xs text-muted-foreground">
            {confirmed ? "Acta confirmada." : unmarked
              ? `Faltan ${unmarked} IMEI por verificar.`
              : missingNotes ? `Faltan ${missingNotes} observaciones.` : "Todos los IMEI revisados."}
          </p>
          <Button
            onClick={() => void confirm()}
            disabled={confirmed || saving || units.length === 0 || unmarked > 0 || missingNotes > 0}
          >
            <ClipboardCheck className="h-4 w-4" />
            {saving ? "Confirmando…" : "Confirmar acta de devolución"}
          </Button>
        </div>
      </footer>
    </section>
  );
};
