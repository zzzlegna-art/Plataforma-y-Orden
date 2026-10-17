import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Pencil, Printer, Send } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge, ConditionBadge, PendingImeiBadge, WarrantyStatusBadge } from "@/components/shared/status-badge";
import { WarrantyOriginBadge } from "@/components/shared/warranty-origin-badge";
import { Button } from "@/components/ui/button";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import { enviarATecnico } from "@/lib/actions/warranties";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { esCodigoInterno } from "@/lib/imei";
import { imprimirEtiquetas } from "@/lib/print-labels";
import { getWarrantyView } from "@/lib/selectors";
import { getWarrantyOrigin } from "@/lib/warranty-origin";
import { tabDeEstado } from "@/lib/warranty-tabs";
import {
  DevolverDialog,
  DiagnosticoDialog,
  EditarClienteDialog,
  EntregarDialog,
  TecnicosDialog,
} from "../modals";
import { DeshacerEstadoButton } from "../deshacer-estado";
import { DocumentosGarantiaSection } from "../warranty-documents";

const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 border-b py-3 last:border-0">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-right text-sm">{children}</span>
  </div>
);

/** Detalle del caso de garantía con su bitácora y acciones. */
const GarantiaDetalle = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const { warrantyId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const view = useMemo(
    () => (warrantyId ? getWarrantyView(db, warrantyId) : undefined),
    [db, warrantyId],
  );

  if (!view) {
    return (
      <EmptyState
        title={t("warranty.notFound")}
        description={t("warranty.notFoundDescription")}
        action={
          <Button asChild>
            <Link to="/garantias">{t("warranty.backToList")}</Link>
          </Button>
        }
      />
    );
  }

  const { warranty, unit, product, customer, order, tecnico, events, open } = view;
  const serial = warranty.unitId ? unit?.serial : warranty.imeiManual;
  const producto = product?.name ?? warranty.referenciaManual ?? "—";
  const cliente = customer?.name ?? warranty.clienteManual ?? "—";
  const serialReemplazo = warranty.replacementUnitId
    ? db.units.find((item) => item.id === warranty.replacementUnitId)?.serial
    : undefined;

  return (
    <div className="space-y-5 stagger">
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link
          to={`/garantias?tab=${tabDeEstado(warranty.status)}`}
          onClick={(event) => {
            // Si se llegó desde la lista, se vuelve exactamente a ella (pestaña incluida).
            if (location.key !== "default") {
              event.preventDefault();
              navigate(-1);
            }
          }}
        >
          <ArrowLeft />
          {t("warranty.backToList")}
        </Link>
      </Button>

      <PageHeader
        title={<span className="font-tabular">{warranty.code}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{producto}</span>
            {unit ? <ConditionBadge condition={unit.condition} /> : null}
            {serial && esCodigoInterno(serial) ? <PendingImeiBadge /> : null}
            <WarrantyStatusBadge status={warranty.status} />
            <WarrantyOriginBadge origin={getWarrantyOrigin(warranty, order)} />
          </span>
        }
        actions={
          <>
            {serial ? (
              <Button
                variant="outline"
                onClick={() => imprimirEtiquetas([{ producto, serial }])}
              >
                <Printer />
                {t("serialHistory.printLabel")}
              </Button>
            ) : null}
            {warranty.status === "recibido" ? (
              <TecnicosDialog
                onSelect={(tecnicoId) =>
                  void runAction(
                    (db2, actor) =>
                      enviarATecnico(db2, actor, { warrantyIds: [warranty.id], tecnicoId }),
                    { success: "warranty.sentToTecnico" },
                  )
                }
                trigger={
                  <Button>
                    <Send />
                    {t("warranty.sendToTecnico")}
                  </Button>
                }
              />
            ) : null}
            {warranty.status === "en_servicio_tecnico" ? (
              <>
                <DiagnosticoDialog
                  warranty={warranty}
                  trigger={<Button>{t("warranty.diagnose")}</Button>}
                />
                <DevolverDialog
                  warranty={warranty}
                  trigger={
                    <Button variant="outline" className="text-destructive">
                      {t("warranty.return")}
                    </Button>
                  }
                />
              </>
            ) : null}
            <DeshacerEstadoButton warranty={warranty} size="default" />
            {warranty.status === "reenvio_pendiente" ? (
              <>
                <EntregarDialog
                  warranty={warranty}
                  trigger={<Button>{t("warranty.deliver")}</Button>}
                />
                <DevolverDialog
                  warranty={warranty}
                  trigger={
                    <Button variant="outline" className="text-destructive">
                      {t("warranty.return")}
                    </Button>
                  }
                />
              </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <section className="rounded-lg border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">{t("warranty.caseTitle")}</h3>
          <InfoRow label={t("unit.serial")}>
            <span className="flex items-center gap-2">
              <span className="font-tabular">{serial ?? "—"}</span>
              {serial && esCodigoInterno(serial) ? <PendingImeiBadge /> : null}
            </span>
          </InfoRow>
          {serialReemplazo ? (
            <div className="my-3 rounded-lg border border-primary/25 bg-primary/5 p-3">
              <p className="mb-3 text-sm font-semibold">Cambio de equipo en garantía</p>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Serial original (recibido)</p>
                  <p className="break-all font-mono text-sm font-semibold">{serial ?? "—"}</p>
                </div>
                <span aria-hidden="true" className="text-center text-lg text-primary">→</span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Serial de reemplazo (entregado)</p>
                  <p className="break-all font-mono text-sm font-semibold text-primary">{serialReemplazo}</p>
                </div>
              </div>
            </div>
          ) : null}
          <InfoRow label={t("customer.title")}>
            <span className="flex items-center justify-end gap-2">
              {cliente}
              <EditarClienteDialog
                warranty={warranty}
                trigger={
                  <button
                    type="button"
                    aria-label={t("warranty.editarClienteTitle")}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                }
              />
            </span>
          </InfoRow>
          <InfoRow label={t("nav.orders")}>
            {order ? (
              <Link
                to={`/pedidos/${order.id}`}
                className="font-tabular text-primary hover:underline"
              >
                {order.code}
              </Link>
            ) : (
              t("common.none")
            )}
          </InfoRow>
          <InfoRow label={t("warranty.tecnico")}>
            {tecnico?.nombre ?? "—"}
          </InfoRow>
          <InfoRow label={t("warranty.receivedAt")}>{formatDateTime(warranty.receivedAt)}</InfoRow>
          <InfoRow label={t("warranty.resolvedAt")}>
            {warranty.resolvedAt ? formatDateTime(warranty.resolvedAt) : t("common.pending")}
          </InfoRow>
          {warranty.fechaVentaManual ? (
            <InfoRow label={t("warranty.previaFecha")}>{formatDateTime(warranty.fechaVentaManual)}</InfoRow>
          ) : null}
          <div className="pt-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("warranty.reason")}
            </p>
            <p className="mt-1 text-sm">{warranty.reason}</p>
          </div>
          {warranty.diagnostico ? (
            <div className="pt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("warranty.diagnosis")}
              </p>
              <p className="mt-1 text-sm">{warranty.diagnostico}</p>
            </div>
          ) : null}
          {warranty.resolucion ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge label={t(`warrantyResolution.${warranty.resolucion}`)} withDot={false} />
              {warranty.costo ? (
                <Badge label={formatCurrency(warranty.costo)} withDot={false} />
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">{t("warranty.timeline")}</h3>
          <ol className="space-y-4">
            {events.map((event) => {
              const user = db.users.find((item) => item.id === event.createdBy);
              return (
                <li key={event.id} className="relative border-l pl-4">
                  <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <WarrantyStatusBadge status={event.status} />
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                    </span>
                  </div>
                  {event.notes ? (
                    <p className="mt-1 text-sm text-muted-foreground">{event.notes}</p>
                  ) : null}
                  {user ? <p className="mt-1 text-xs text-muted-foreground">{user.fullName}</p> : null}
                </li>
              );
            })}
          </ol>
          <div className="mt-4 border-t pt-3">
            <Badge
              tone={open ? "warning" : "success"}
              label={t(open ? "warranty.openCase" : "warranty.closedCase")}
            />
          </div>
        </section>

        <DocumentosGarantiaSection warrantyId={warranty.id} />
      </div>
    </div>
  );
};

export default GarantiaDetalle;
