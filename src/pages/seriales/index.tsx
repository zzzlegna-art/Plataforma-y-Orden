import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, History, LockOpen, PencilLine, Printer, ShieldAlert, Undo2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { CodeLink, TextWithCodeLink } from "@/components/shared/code-link";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ProductThumbnail } from "@/components/shared/product-thumbnail";
import { PrintLabelsDialog } from "@/components/shared/print-labels-dialog";
import { SerialScanInput } from "@/components/shared/serial-scan-input";
import {
  Badge,
  ConditionBadge,
  UnitStatusBadge,
} from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/use-permissions";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import {
  corregirUnitSerial,
  liberarUnit,
  reingresarUnit,
  reportarNovedad,
} from "@/lib/actions/units";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { imprimirEtiquetas } from "@/lib/print-labels";
import {
  findUnitBySerial,
  getUnitOrigen,
  getUnitTimeline,
  rutaDeRecepcion,
  unitLocation,
} from "@/lib/selectors";
import type { Unit } from "@/lib/types";

const exportarCsv = (serial: string, fechaIngreso: string, rows: ReturnType<typeof getUnitTimeline>) => {
  const header = `Serial;${serial}\nIngreso;${fechaIngreso}\nFecha;Tipo;Descripcion;Usuario\n`;
  const body = rows
    .map((row) =>
      [row.fecha, row.tipo, `"${row.descripcion.replace(/"/g, '""')}"`, row.usuario ?? ""].join(";"),
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + header + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `historial-${serial}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

/** Abre la bandeja operativa actual, no la ficha de detalle. */
const rutaOperativaGarantia = (warranty: { id: string; status: string }) => {
  const tab =
    warranty.status === "recibido" ? "recibidos" :
    warranty.status === "en_servicio_tecnico" ? "servicio" :
    warranty.status === "reenvio_pendiente" ? "reenvio" : "historial";
  return `/garantias?tab=${tab}&focus=${encodeURIComponent(warranty.id)}`;
};

/** Ficha y línea de tiempo de un serial/IMEI con acciones de mantenimiento. */
const HistorialSerial = ({ embedded = false }: { embedded?: boolean }) => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const { isAdmin } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("serial") ?? "");

  useEffect(() => {
    const fromUrl = params.get("serial");
    if (fromUrl) setSearch(fromUrl);
  }, [params]);

  const unit = useMemo(() => (search ? findUnitBySerial(db, search) : undefined), [db, search]);
  const garantiasPorSerialManual = useMemo(
    () => search
      ? db.warranties
          .filter((warranty) => warranty.imeiManual?.trim().toLocaleLowerCase() === search.trim().toLocaleLowerCase())
          .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      : [],
    [db, search],
  );
  const product = unit ? db.products.find((item) => item.id === unit.productId) : undefined;
  const timeline = useMemo(() => (unit ? getUnitTimeline(db, unit.id) : []), [db, unit]);

  // Recepción, venta, cliente y garantías del equipo (cada una se puede abrir desde aquí).
  const origen = useMemo(() => (unit ? getUnitOrigen(db, unit) : undefined), [db, unit]);
  const reception = origen?.reception;
  const order = origen?.order;
  const customer = origen?.customer;
  const warranties = unit
    ? db.warranties.filter(
        (warranty) =>
          warranty.unitId === unit.id ||
          warranty.imeiManual?.trim().toLocaleLowerCase() === unit.serial.trim().toLocaleLowerCase(),
      )
    : [];
  const reemplazos = unit ? db.warranties.filter((warranty) => warranty.replacementUnitId === unit.id && warranty.unitId !== unit.id) : [];
  const garantiasRelacionadas = [...warranties, ...reemplazos].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  // Diálogos
  const [dialog, setDialog] = useState<null | "novedad" | "corregir" | "imprimir">(null);
  const [novedad, setNovedad] = useState("");
  const [nuevoSerial, setNuevoSerial] = useState("");
  const [corregirMotivo, setCorregirMotivo] = useState("");

  const handleScan = (serial: string) => {
    setSearch(serial);
    setParams({ serial }, { replace: true });
  };

  const liberable = unit && ["en_bodega", "en_local", "defectuoso"].includes(unit.status);

  return (
    <div className="space-y-5 stagger">
      {!embedded ? <PageHeader title={t("serialHistory.title")} description={t("serialHistory.subtitle")} /> : null}

      <section className="space-y-2 rounded-lg border bg-card p-4 shadow-sm">
        <SerialScanInput onScan={handleScan} />
      </section>

      {search && !unit && garantiasPorSerialManual.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title={t("serialHistory.notFound")}
          description={t("serialHistory.notFoundDescription", { serial: search })}
        />
      ) : null}

      {search && !unit && garantiasPorSerialManual.length > 0 ? (
        <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold">{t("serialHistory.priorWarrantyTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("serialHistory.priorWarrantyHint", { serial: search })}
            </p>
          </div>
          <div className="grid gap-2">
            {garantiasPorSerialManual.map((warranty) => {
              const referencia = db.products.find((item) => item.id === warranty.productId)?.name
                ?? db.products.find((item) => item.name.trim().toLocaleLowerCase() === warranty.referenciaManual?.trim().toLocaleLowerCase())?.name
                ?? warranty.referenciaManual
                ?? "—";
              const ultimoEvento = db.warrantyEvents
                .filter((event) => event.warrantyId === warranty.id)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
              return (
                <Link
                  key={warranty.id}
                  to={rutaOperativaGarantia(warranty)}
                  className="rounded-lg border bg-muted/20 p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-primary">{warranty.code}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge label={t("warranty.origin.previa")} withDot={false} />
                      <WarrantyStatusBadge status={warranty.status} />
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-medium">{referencia}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("warranty.previaCliente")}: {warranty.clienteManual ?? "—"} · {warranty.imeiManual}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{ultimoEvento?.notes ?? warranty.reason}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {unit ? (
        <>
          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <ProductThumbnail src={product?.imageUrl} alt={product?.name ?? "Referencia"} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{product?.name ?? "—"}</p>
                  <p className="font-tabular mt-1 text-sm text-muted-foreground">
                    {unit.serial} · {product?.sku ?? ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <UnitStatusBadge status={unit.status} />
                    <ConditionBadge condition={unit.condition} />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog("imprimir")}
                >
                  <Printer />
                  {t("serialHistory.printLabel")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportarCsv(unit.serial, unit.receivedAt, timeline)}
                >
                  <Download />
                  {t("serialHistory.export")}
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("unit.location")}
                </p>
                <p className="mt-1 font-medium">{t(`unitLocation.${unitLocation(unit.status)}`)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("unit.cost")}
                </p>
                <p className="font-tabular mt-1 font-medium">
                  {unit.cost != null ? formatCurrency(unit.cost) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("unit.receivedAt")}
                </p>
                <p className="mt-1 font-medium">{formatDateTime(unit.receivedAt)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("receptions.title")}
                </p>
                <p className="mt-1 font-medium">
                  {reception ? (
                    <CodeLink to={rutaDeRecepcion(reception, unit?.serial)}>{reception.code}</CodeLink>
                  ) : (
                    "—"
                  )}
                </p>
              </div>
            </div>

            {order ? (
              <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t("serialHistory.sale")}: </span>
                <CodeLink to={`/pedidos/${order.id}`}>{order.code}</CodeLink>
                <span className="text-muted-foreground"> · </span>
                <span className="font-medium">{customer?.name ?? "—"}</span>
              </div>
            ) : null}

            {garantiasRelacionadas.length > 0 ? (
              <div className="mt-4 space-y-2 rounded-xl border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Garantías vinculadas al serial ({garantiasRelacionadas.length})</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {garantiasRelacionadas.map((warranty) => {
                    const esReemplazo = warranty.replacementUnitId === unit.id && warranty.unitId !== unit.id;
                    const serialOriginal = db.units.find((item) => item.id === warranty.unitId)?.serial ?? warranty.imeiManual ?? "Sin serial original";
                    const serialNuevo = db.units.find((item) => item.id === warranty.replacementUnitId)?.serial;
                    return (
                      <Link key={warranty.id} to={rutaOperativaGarantia(warranty)} className="rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/40">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-primary">{warranty.code}</span>
                          <Badge label={t(`warrantyStatus.${warranty.status}`)} withDot={false} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {esReemplazo
                            ? (Boolean(warranty.customerId || warranty.orderId || warranty.clienteManual?.trim())
                                ? "Entregado como reemplazo"
                                : "Seleccionado como reemplazo de inventario")
                            : (warranty.imeiManual ? t("warranty.origin.previa") : "Equipo recibido en garantía")}
                        </p>
                        {serialNuevo ? (
                          <p className="mt-2 break-all text-xs">Original: <span className="font-medium">{serialOriginal}</span> · Reemplazo: <span className="font-medium">{serialNuevo}</span></p>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialog("novedad")}>
                <ShieldAlert />
                {t("serialHistory.reportIssue")}
              </Button>
              {isAdmin ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setDialog("corregir")}>
                    <PencilLine />
                    {t("serialHistory.correctSerial")}
                  </Button>
                  {unit.status === "liberado" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void runAction(
                          (db2, actor) =>
                            reingresarUnit(db2, actor, { id: unit.id, status: "en_bodega" }),
                          { success: "unit.reingresada", key: `unidad-reingresar:${unit.id}` },
                        )
                      }
                    >
                      <Undo2 />
                      {t("unit.reingresar")}
                    </Button>
                  ) : liberable ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="outline" size="sm" className="text-destructive">
                          <LockOpen />
                          {t("unit.liberar")}
                        </Button>
                      }
                      title={t("unit.liberarTitle")}
                      description={t("unit.liberarDescription")}
                      confirmLabel={t("unit.liberar")}
                      destructive
                      onConfirm={() =>
                        void runAction(
                          (db2, actor) => liberarUnit(db2, actor, { id: unit.id }),
                          { success: "unit.liberada", key: `unidad-liberar:${unit.id}` },
                        )
                      }
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-primary" />
              {t("serialHistory.timeline")}
            </h3>
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("serialHistory.noEvents")}</p>
            ) : (
              <ol className="space-y-4">
                {timeline.map((item) => (
                  <li key={item.id} className="relative border-l pl-4">
                    <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge label={t(`movement.${item.tipo}`)} withDot={false} />
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(item.fecha)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">
                      <TextWithCodeLink text={item.descripcion} enlace={item.enlace?.to.startsWith("/garantias/") ? { ...item.enlace, to: rutaOperativaGarantia(db.warranties.find((w) => item.enlace?.to === `/garantias/${w.id}`) ?? { id: item.enlace.to.split("/")[2], status: "entregado" }) } : item.enlace} />
                    </p>
                    {item.usuario ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.usuario}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <PrintLabelsDialog
            open={dialog === "imprimir"}
            onOpenChange={(open) => !open && setDialog(null)}
            count={1}
            onConfirm={(nota) =>
              imprimirEtiquetas([{ producto: product?.name ?? unit.serial, serial: unit.serial, nota }])
            }
          />

          <Dialog open={dialog === "novedad"} onOpenChange={(open) => !open && setDialog(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("serialHistory.reportIssue")}</DialogTitle>
                <DialogDescription>{t("serialHistory.reportIssueHint")}</DialogDescription>
              </DialogHeader>
              <Textarea
                rows={3}
                value={novedad}
                placeholder={t("serialHistory.reportIssuePlaceholder")}
                onChange={(event) => setNovedad(event.target.value)}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  loading={runAction.pending}
                  onClick={async () => {
                    const result = await runAction(
                      (db2, actor) =>
                        reportarNovedad(db2, actor, { id: unit.id, descripcion: novedad }),
                      { success: "serialHistory.issueReported" },
                    );
                    if (result) {
                      setDialog(null);
                      setNovedad("");
                    }
                  }}
                >
                  {t("serialHistory.report")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={dialog === "corregir"} onOpenChange={(open) => !open && setDialog(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("serialHistory.correctSerial")}</DialogTitle>
                <DialogDescription>{t("serialHistory.correctSerialHint")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("serialHistory.currentSerial")}
                  </Label>
                  <Input value={unit.serial} disabled className="font-tabular" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newSerial">{t("serialHistory.newSerial")}</Label>
                  <Input
                    id="newSerial"
                    value={nuevoSerial}
                    onChange={(event) => setNuevoSerial(event.target.value)}
                    className="font-tabular"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="correctMotivo">{t("common.notes")}</Label>
                  <Input
                    id="correctMotivo"
                    value={corregirMotivo}
                    placeholder={t("serialHistory.correctMotivoPlaceholder")}
                    onChange={(event) => setCorregirMotivo(event.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  loading={runAction.pending}
                  onClick={async () => {
                    const result = await runAction(
                      (db2, actor) =>
                        corregirUnitSerial(db2, actor, {
                          id: unit.id,
                          nuevoSerial: nuevoSerial,
                          motivo: corregirMotivo,
                        }),
                      { success: "serialHistory.corrected" },
                    );
                    if (result) {
                      setDialog(null);
                      setNuevoSerial("");
                      setCorregirMotivo("");
                    }
                  }}
                >
                  {t("common.confirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
};

export default HistorialSerial;
