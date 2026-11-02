import { useRef, useState } from "react";
import { CircleAlert, ClipboardCheck, ScanLine, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TransferUnitView } from "@/lib/nexora-transfer-inbox";

/** No genera stock en la interfaz; solo el RPC autorizado puede cerrarlo. */
export const IncidentRecoveryPanel = ({
  units, onRecover,
}: {
  units: readonly TransferUnitView[];
  onRecover: (unitId: string, observation: string) => Promise<void>;
}) => {
  const [scan, setScan] = useState("");
  const [observation, setObservation] = useState("");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const unresolved = units.filter(unit => unit.isOpen && unit.receiptStatus === "no_llego");
  const match = unresolved.find(unit => unit.serial.trim().toUpperCase() === scan.trim().toUpperCase());
  const recover = async () => {
    if (lock.current || !match || !observation.trim()) return;
    lock.current = true;
    setSaving(true);
    try {
      await onRecover(match.unitId, observation.trim());
      toast.success("IMEI recuperado y registrado en la hoja de vida.");
      setScan("");
      setObservation("");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message
        : "No se pudo verificar. Consulta el estado del servidor antes de reintentar.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  if (!unresolved.length) return null;
  return (
    <section className="space-y-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-4"
      aria-label="Recuperar IMEI encontrado">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CircleAlert className="h-4 w-4 text-amber-600" />
        Recuperación física de incidencias
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Si aparece posteriormente uno de los equipos faltantes, escanea su IMEI y registra cómo fue encontrado.
        Solo la confirmación del servidor permite devolverlo al inventario disponible.
      </p>
      <form onSubmit={e => { e.preventDefault(); void recover(); }} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="recover-imei-scan" className="text-xs font-semibold">IMEI encontrado físicamente</label>
          <div className="relative">
            <ScanLine className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-primary" />
            <Input id="recover-imei-scan" className="pl-9 font-mono" value={scan}
              onChange={e => setScan(e.target.value)} disabled={saving}
              placeholder="Escanear IMEI de la incidencia" autoComplete="off" inputMode="numeric" />
          </div>
          <p role="status" className="text-xs text-muted-foreground">
            {scan && !match ? "Este IMEI no tiene una incidencia abierta en el documento."
              : match ? "IMEI identificado. Registra la verificación física." : `${unresolved.length} IMEI pendientes de localizar.`}
          </p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="recover-imei-note" className="text-xs font-semibold">Observación obligatoria</label>
          <Input id="recover-imei-note" value={observation} onChange={e => setObservation(e.target.value)}
            disabled={saving} maxLength={500}
            placeholder="Ej. Apareció en conteo físico, estante 3" />
        </div>
        <Button type="submit" disabled={!match || !observation.trim() || saving}>
          <ClipboardCheck className="h-4 w-4" /> {saving ? "Verificando..." : "Confirmar IMEI recuperado"}
        </Button>
      </form>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
        La incidencia original permanece en el historial junto con la nueva recuperación. Sin verificación no entra mercancía al disponible.
      </p>
    </section>
  );
};
