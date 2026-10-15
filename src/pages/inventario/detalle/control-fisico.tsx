import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Copy,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SerialScanInput } from "@/components/shared/serial-scan-input";
import { UnitStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/use-permissions";
import { useStore } from "@/hooks/use-store";
import { esVerificada, type EstadoControl } from "@/lib/control-fisico";
import { formatDateTime } from "@/lib/format";
import type { Product, Unit } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { ControlFisico } from "./use-control-fisico";

/** Casilla de cada fila: muestra si la unidad ya se verificó y permite marcarla a mano. */
export const ControlCheck = ({
  unit,
  product,
  onToggle,
}: {
  unit: Unit;
  product: Product;
  onToggle: (unit: Unit) => void;
}) => {
  const { t } = useTranslation();
  const verificada = esVerificada(unit, product);
  const fuera = verificada && unit.status !== "en_bodega";
  const titulo = fuera
    ? t("control.verifiedOutOfState", { estado: t(`unitStatus.${unit.status}`) })
    : verificada
      ? t("control.verifiedAt", { fecha: formatDateTime(unit.checkedAt) })
      : t("control.mark");
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={verificada}
      aria-label={verificada ? t("control.unmark") : t("control.mark")}
      title={titulo}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(unit);
      }}
    >
      {fuera ? (
        <AlertTriangle className="text-warning" />
      ) : verificada ? (
        <CheckCircle2 className="text-success" />
      ) : (
        <Circle className="text-muted-foreground" />
      )}
    </Button>
  );
};

const Dato = ({ etiqueta, valor, tono }: { etiqueta: string; valor: number; tono?: "aviso" | "error" }) => (
  <div
    className={cn(
      "rounded-md border px-3 py-2",
      tono === "aviso" && valor > 0 && "border-warning/50 bg-warning/10",
      tono === "error" && valor > 0 && "border-destructive/40 bg-destructive/10",
    )}
  >
    <p className="text-xs text-muted-foreground">{etiqueta}</p>
    <p className="font-tabular text-lg font-semibold">{valor}</p>
  </div>
);

/**
 * Panel del control físico de un producto: inicia el control, muestra el avance y ofrece la
 * barra de escaneo (lector USB/Bluetooth o cámara). `units` son las unidades que muestra la
 * lista (ya filtradas por condición); el avance se cuenta sobre ellas.
 */
export const ControlFisicoPanel = ({
  product,
  estado,
  control,
  alcance,
  totalUnidades,
}: {
  product: Product;
  estado: EstadoControl;
  control: ControlFisico;
  /** Nombre del filtro de condición, si hay uno aplicado (por ejemplo "Nuevos"). */
  alcance?: string;
  totalUnidades: number;
}) => {
  const { t } = useTranslation();
  const { db } = useStore();
  const { can } = usePermissions();
  const esMovil = useIsMobile();
  const [resumenAbierto, setResumenAbierto] = useState(false);

  const puede = can("inventory.manage");
  const inicio = useMemo(
    () => db.users.find((user) => user.id === product.controlStartedBy)?.fullName ?? "",
    [db.users, product.controlStartedBy],
  );

  if (totalUnidades === 0) return null;

  if (!estado.activo) {
    return (
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <div className="max-w-xl">
              <h3 className="text-sm font-semibold">{t("control.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("control.description")}</p>
            </div>
          </div>
          {puede ? (
            <Button onClick={() => void control.iniciar()} loading={control.ocupado}>
              <ClipboardCheck />
              {t("control.start")}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  const copiarFaltantes = async () => {
    try {
      await navigator.clipboard.writeText(estado.faltan.map((unit) => unit.serial).join("\n"));
      toast.success(t("control.copied"));
    } catch {
      toast.error(t("errors.unexpected"));
    }
  };

  return (
    <section className="space-y-4 rounded-lg border-2 border-primary/40 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {t("control.title")}
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                {t("control.inProgress")}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("control.startedBy", {
                nombre: inicio || "—",
                fecha: formatDateTime(product.controlStartedAt),
              })}
            </p>
          </div>
        </div>
        {puede ? (
          <div className="flex flex-wrap gap-2">
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm" disabled={control.ocupado}>
                  <RotateCcw />
                  {t("control.restart")}
                </Button>
              }
              title={t("control.restartTitle")}
              description={t("control.restartDescription")}
              confirmLabel={t("common.confirm")}
              onConfirm={() => control.iniciar(true)}
            />
            <Button size="sm" onClick={() => setResumenAbierto(true)} disabled={control.ocupado}>
              {t("control.finish")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">
            {t("control.progress", { verificados: estado.verificadas, esperadas: estado.esperadas })}
            {alcance ? <span className="text-muted-foreground"> · {alcance}</span> : null}
          </p>
          <span className="font-tabular text-sm text-muted-foreground">
            {t("control.percent", { valor: estado.porcentaje })}
          </span>
        </div>
        <Progress value={estado.porcentaje} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Dato etiqueta={t("control.pending")} valor={estado.faltan.length} />
        <Dato etiqueta={t("control.outOfState")} valor={estado.fueraDeEstado.length} tono="aviso" />
        <Dato etiqueta={t("control.notRegistered")} valor={control.noEncontrados.length} tono="error" />
      </div>

      {puede ? (
        <SerialScanInput
          onScan={control.escanear}
          validate={control.validar}
          placeholder={t("control.scan.placeholder")}
          hint={t("control.scan.hint")}
          stacked={esMovil}
          submitLabel={t("control.mark")}
        />
      ) : null}

      {control.aviso ? (
        <div
          key={control.aviso.id}
          role="status"
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            control.aviso.tono === "ok" && "border-success/40 bg-success/10",
            control.aviso.tono === "aviso" && "border-warning/50 bg-warning/10",
            control.aviso.tono === "error" && "border-destructive/40 bg-destructive/10",
          )}
        >
          <span className="font-tabular">{control.aviso.texto}</span>
        </div>
      ) : null}

      <Dialog open={resumenAbierto} onOpenChange={setResumenAbierto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("control.finishTitle")}</DialogTitle>
            <DialogDescription>{t("control.finishDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm font-medium">
              {t("control.progress", { verificados: estado.verificadas, esperadas: estado.esperadas })}
              {alcance ? <span className="text-muted-foreground"> · {alcance}</span> : null}
            </p>

            {estado.faltan.length === 0 ? (
              <p className="text-sm text-success">{t("control.summary.allFound")}</p>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {t("control.summary.missingTitle", { count: estado.faltan.length })}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void copiarFaltantes()}>
                    <Copy />
                    {t("control.copyMissing")}
                  </Button>
                </div>
                <ul className="font-tabular max-h-44 space-y-0.5 overflow-y-auto rounded-md border bg-muted/30 p-2 text-sm">
                  {estado.faltan.map((unit) => (
                    <li key={unit.id}>{unit.serial}</li>
                  ))}
                </ul>
              </div>
            )}

            {estado.fueraDeEstado.length > 0 ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t("control.summary.outOfStateTitle", { count: estado.fueraDeEstado.length })}
                </p>
                <ul className="max-h-32 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-sm">
                  {estado.fueraDeEstado.map((unit) => (
                    <li key={unit.id} className="flex items-center justify-between gap-2">
                      <span className="font-tabular">{unit.serial}</span>
                      <UnitStatusBadge status={unit.status} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {control.noEncontrados.length > 0 ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t("control.summary.notRegisteredTitle", { count: control.noEncontrados.length })}
                </p>
                <ul className="font-tabular max-h-32 space-y-0.5 overflow-y-auto rounded-md border bg-muted/30 p-2 text-sm">
                  {control.noEncontrados.map((serial) => (
                    <li key={serial}>{serial}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResumenAbierto(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              loading={control.ocupado}
              onClick={async () => {
                if (await control.finalizar(estado, alcance)) setResumenAbierto(false);
              }}
            >
              {t("control.finishConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
