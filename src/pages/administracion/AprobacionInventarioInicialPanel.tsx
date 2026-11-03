import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BadgeCheck, Building2, ClipboardCheck, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Warehouse6ADeclarationPanel } from "./Warehouse6ADeclarationPanel";
import { NexoraLocalInitialControls } from "./NexoraV49Controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  approveInitialInventory, canApproveInitialInventory, getInitialApprovedSiteSummary,
  getInitialApprovalBlocker, getInitialInventoryProgress,
  type ApprovedSiteSummary, type InitialInventoryProgress,
} from "@/lib/nexora-initial-approval";

const number = (value: number) => new Intl.NumberFormat("es-CO").format(value);

export const AprobacionInventarioInicialPanel = ({
  onApproved,
}: {
  onApproved: () => void;
}) => {
  const [progress, setProgress] = useState<InitialInventoryProgress | null>(null);
  const [summary, setSummary] = useState<ApprovedSiteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const requestRef = useRef(0);
  const savingRef = useRef(false);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const result = await getInitialInventoryProgress();
      if (request !== requestRef.current) return;
      setProgress(result);
      if (result.isApproved) {
        onApproved();
        const rows = await getInitialApprovedSiteSummary();
        if (request === requestRef.current) setSummary(rows);
      } else {
        setSummary([]);
      }
    } catch (error) {
      if (request === requestRef.current) {
        setProgress(null);
        toast.error(error instanceof Error ? error.message : "No fue posible consultar la aprobación inicial.");
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [onApproved]);

  useEffect(() => {
    void refresh();
    return () => { requestRef.current += 1; };
  }, [refresh]);

  const complete = async () => {
    if (!canApproveInitialInventory(progress, acknowledged, confirmation) || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await approveInitialInventory();
      toast.success(`Acta aprobada: ${number(result.approvedCount)} IMEI asociados a sus sedes`);
      onApproved();
      setOpen(false);
      setConfirmation("");
      setAcknowledged(false);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible completar la aprobación.");
      await refresh();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const percent = progress && progress.total > 0
    ? (progress.isApproved && progress.approvalMethod === "admin_declaration_6a" ? 100 : Math.min(100, Math.round((progress.verified / progress.total) * 100)))
    : 0;
  const blocker = progress ? getInitialApprovalBlocker(progress) : "Sin datos verificados";
  return (
    <section className="space-y-4" aria-label="Aprobación final del inventario inicial">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary"><ClipboardCheck className="h-6 w-6" /></div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Aprobación del inventario inicial</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                El cierre inicial registra las ubicaciones con un acta auditable: por escaneo físico real
                o, exclusivamente en Bodega 6A ya revisada, mediante declaración administrativa.
                Ningún método inventa lecturas de IMEI.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" disabled={loading || saving} onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" /> Actualizar verificación
          </Button>
        </header>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { title: "Unidades físicas", value: progress?.total },
              { title: "IMEI escaneados y válidos", value: progress?.verified },
              { title: "Sin escaneo individual", value: progress?.pending },
              { title: "Cotejos desactualizados", value: progress?.stale },
            ].map((stat) => (
              <div key={stat.title} className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs font-medium text-muted-foreground">{stat.title}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{stat.value === undefined ? "—" : number(stat.value)}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold">{progress?.approvalMethod === "admin_declaration_6a" ? "Apertura certificada por declaración (sin escaneo)" : "Conciliación física del inventario"}</span>
              <span className="font-bold tabular-nums">{percent}%</span>
            </div>
            <div role="progressbar" aria-label="Avance de la conciliación inicial"
              aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}
              className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </div>
          </div>

          {progress?.isApproved ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <BadgeCheck className="h-5 w-5" />
                <p className="font-semibold">{progress.approvalMethod === "admin_declaration_6a" ? "Acta administrativa de Bodega 6A firmada" : "Acta definitiva aprobada por escaneo"}</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {number(progress.approved)} IMEI quedaron vinculados a una sede.\n                {progress.approvalMethod === "admin_declaration_6a" ? " Certificación por declaración del Administrador; no se realizó escaneo individual. Los costos pendientes permanecen sin validar." : ""}
                Fecha de aprobación: {progress.approvedAt
                  ? new Date(progress.approvedAt).toLocaleString("es-CO") : "sin fecha"}.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
              <div className="flex min-w-0 max-w-2xl items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold">{blocker ?? "Todos los IMEI físicos están conciliados"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    El cierre ordinario exige cotejos individuales. Si ya verificaste físicamente las
                    unidades elegibles de Bodega 6A, utiliza abajo la apertura excepcional por declaración.
                    No necesita repetir escaneos, no inventa lecturas y no valida costos faltantes.
                  </p>
                </div>
              </div>
              <Button disabled={!progress?.ready || loading || saving} onClick={() => setOpen(true)}>
                <ShieldCheck className="h-4 w-4" /> Aprobar inventario inicial
              </Button>
            </div>
          )}
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
            El acta conserva el costo y estado de cada unidad en el momento de aprobación.
            Esto no habilita todavía ventas ni traslados multisede: esos flujos requieren su integración transaccional posterior.
          </p>
        </div>
        {progress?.isApproved && summary.length > 0 ? (
          <div className="border-t p-5 sm:p-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Building2 className="h-4 w-4 text-primary" /> Distribución aprobada por sede
            </h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {summary.map((site) => (
                <article key={site.siteId} className="rounded-xl border bg-muted/15 p-4">
                  <p className="font-semibold">{site.siteName}</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums">{number(site.approved)}</p>
                  <p className="text-xs text-muted-foreground">IMEI en la foto inicial</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {number(site.stillPhysical)} siguen en un estado físico del inventario anterior.
                    No representa stock disponible para el POS.
                  </p>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <NexoraLocalInitialControls />
      <Warehouse6ADeclarationPanel
        alreadyApproved={Boolean(progress?.isApproved)}
        onApproved={()=>{onApproved();void refresh();}}
      />
      <Dialog open={open} onOpenChange={(value) => { if (!savingRef.current) setOpen(value); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Confirmar inventario inicial de Nexora</DialogTitle>
            <DialogDescription>
              Operación definitiva: se registra una ubicación única y el costo histórico por cada IMEI
              verificado. No se podrá repetir ni alterar el acta sin un procedimiento de auditoría.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl border bg-muted/20 p-4 text-sm">
              <strong>{progress ? number(progress.verified) : "—"} unidades verificadas</strong>
              <p className="mt-1 text-muted-foreground">La base de datos comprobará nuevamente el inventario completo en una única transacción.</p>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)} />
              <span>Confirmo que el conteo físico fue revisado y autorizo guardar las ubicaciones iniciales sin modificar el stock comercial existente.</span>
            </label>
            <div className="space-y-2">
              <Label htmlFor="nexora-approval-word">Escribe APROBAR para confirmar</Label>
              <Input id="nexora-approval-word" autoComplete="off" value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)} placeholder="APROBAR" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={saving || !canApproveInitialInventory(progress, acknowledged, confirmation)}
              onClick={() => void complete()}>
              <ShieldCheck className="h-4 w-4" /> Firmar acta definitiva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
