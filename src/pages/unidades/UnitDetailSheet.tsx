import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { History, LockOpen, Save, Undo2 } from "lucide-react";

import { ConditionBadge, UnitStatusBadge, Badge } from "@/components/shared/status-badge";
import { ProductThumbnail } from "@/components/shared/product-thumbnail";
import { UnitStatusMenu } from "@/components/shared/unit-status-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import { usePermissions } from "@/hooks/use-permissions";
import { liberarUnit, reingresarUnit, updateUnit } from "@/lib/actions/units";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { getUnitTimeline, unitLocation } from "@/lib/selectors";

const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-right text-sm">{children}</span>
  </div>
);

/** Ficha de una unidad: trazabilidad, costos, ubicación y ajustes. */
export const UnitDetailSheet = ({
  unitId,
  onClose,
}: {
  unitId: string | null;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const { isAdmin } = usePermissions();
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const unit = db.units.find((item) => item.id === unitId) ?? null;

  useEffect(() => {
    setLocation(unit?.location ?? "");
    setNotes(unit?.notes ?? "");
  }, [unit?.id, unit?.location, unit?.notes]);

  const product = db.products.find((item) => item.id === unit?.productId);
  const reception = db.receptions.find((item) => item.id === unit?.receptionId);
  const orderRow = unit
    ? db.orderItemUnits.find((row) => row.unitId === unit.id)
    : undefined;
  const orderItem = orderRow
    ? db.orderItems.find((item) => item.id === orderRow.orderItemId)
    : undefined;
  const order = orderItem
    ? db.orders.find((item) => item.id === orderItem.orderId)
    : undefined;
  const customer = order
    ? db.customers.find((item) => item.id === order.customerId)
    : undefined;
  const warranty = unit
    ? db.warranties.find((item) => item.unitId === unit.id)
    : undefined;

  const liberable = unit && ["en_bodega", "en_local", "defectuoso"].includes(unit.status);
  // La línea de vida reúne movimientos y garantías sin modificar el historial almacenado.
  const timeline = unit ? getUnitTimeline(db, unit.id).slice().reverse() : [];

  return (
    <Sheet open={Boolean(unit)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto pr-0 sm:max-w-2xl">
        <SheetHeader className="pr-6">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            <History className="h-4 w-4" aria-hidden="true" /> Hoja de vida del equipo
          </div>
          <SheetTitle className="font-tabular break-all text-2xl font-bold tracking-tight">{unit?.serial ?? ""}</SheetTitle>
          <div className="flex min-w-0 items-center gap-4">
            <ProductThumbnail
              src={product?.imageUrl}
              alt={product?.name ?? "Referencia"}
              size="2xl"
              className="rounded-xl p-0"
            />
            <div className="min-w-0">
              <SheetDescription className="text-base font-semibold leading-snug text-foreground">
                {product?.name ?? ""}
              </SheetDescription>
              {product?.sku ? (
                <p className="font-tabular mt-1 text-sm text-muted-foreground">{product.sku}</p>
              ) : null}
            </div>
          </div>
        </SheetHeader>

        {unit ? (
          <div className="mt-5 space-y-5 pr-6">
            <div>
              <InfoRow label={t("unit.condition")}>
                <ConditionBadge condition={unit.condition} />
              </InfoRow>
              <InfoRow label={t("common.status")}>
                <UnitStatusBadge status={unit.status} />
              </InfoRow>
              <InfoRow label={t("unit.location")}>
                {t(`unitLocation.${unitLocation(unit.status)}`)}
              </InfoRow>
              <InfoRow label={t("unit.cost")}>
                <span className="font-tabular">
                  {unit.cost != null ? formatCurrency(unit.cost) : "—"}
                </span>
              </InfoRow>
              <InfoRow label={t("unit.receivedAt")}>{formatDate(unit.receivedAt)}</InfoRow>
              <InfoRow label={t("receptions.title")}>
                {reception ? (
                  <span className="font-tabular">{reception.code}</span>
                ) : (
                  t("common.none")
                )}
              </InfoRow>
              <InfoRow label={t("nav.orders")}>
                {order ? (
                  <span>
                    <span className="font-tabular">{order.code}</span>
                    {customer ? ` · ${customer.name}` : ""}
                  </span>
                ) : (
                  t("common.none")
                )}
              </InfoRow>
              <InfoRow label={t("nav.warranties")}>
                {warranty ? (
                  <Badge label={warranty.code} withDot={false} />
                ) : (
                  t("common.none")
                )}
              </InfoRow>
            </div>

            <section aria-label="Historial del serial" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-primary/[0.04] px-4 py-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <History className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">Historia del serial</h3>
                    <p className="text-xs text-muted-foreground">Movimientos y garantías registrados</p>
                  </div>
                </div>
                <span className="rounded-full border bg-background px-3 py-1 text-xs font-semibold tabular-nums">
                  {timeline.length} {timeline.length === 1 ? "evento" : "eventos"}
                </span>
              </div>
              {timeline.length > 0 ? (
                <ol className="space-y-0 px-5 py-4" aria-label="Línea de tiempo del IMEI">
                  {timeline.map((item) => (
                    <li key={item.id} className="relative border-l border-primary/20 pb-5 pl-5 last:border-transparent last:pb-0">
                      <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary ring-2 ring-primary/15" aria-hidden="true" />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold capitalize text-primary">
                          {item.tipo.replace(/_/g, " ")}
                        </span>
                        <time dateTime={item.fecha} className="text-xs tabular-nums text-muted-foreground">
                          {formatDateTime(item.fecha)}
                        </time>
                      </div>
                      <p className="mt-2 break-words text-sm leading-relaxed text-foreground">
                        {item.descripcion}
                      </p>
                      {item.usuario ? (
                        <p className="mt-1 text-xs text-muted-foreground">Responsable: {item.usuario}</p>
                      ) : null}
                      {item.enlace ? (
                        <Link
                          to={item.enlace.to}
                          className="mt-2 inline-flex rounded-md text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          Ver documento {item.enlace.codigo}
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="px-5 py-6 text-sm leading-relaxed text-muted-foreground">
                  Este equipo no tiene movimientos históricos adicionales registrados.
                  Su información de ingreso y estado actual aparece arriba.
                </p>
              )}
            </section>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="space-y-2">
                <Label htmlFor="location">{t("unit.location")}</Label>
                <Input
                  id="location"
                  value={location}
                  placeholder={t("unit.locationPlaceholder")}
                  onChange={(event) => setLocation(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit-notes">{t("common.notes")}</Label>
                <Textarea
                  id="unit-notes"
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  void runAction(
                    (db2, actor) =>
                      updateUnit(db2, actor, { id: unit.id, location, notes }),
                    { success: "unit.updated", key: `unidad-guardar:${unit.id}` },
                  )
                }
              >
                <Save />
                {t("common.save")}
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button size="sm" variant="ghost" asChild>
                <Link to={`/seriales?serial=${encodeURIComponent(unit.serial)}`}>
                  <History />
                  {t("serialHistory.title")}
                </Link>
              </Button>
              <UnitStatusMenu unit={unit} />
            </div>

            {isAdmin ? (
              <div className="rounded-lg border p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("unit.adminActions")}
                </p>
                {unit.status === "liberado" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
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
                      <Button variant="outline" size="sm" className="w-full text-destructive">
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
              </div>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
