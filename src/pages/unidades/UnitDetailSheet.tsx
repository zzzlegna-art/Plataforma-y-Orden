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
import { formatCurrency, formatDate } from "@/lib/format";
import { unitLocation } from "@/lib/selectors";

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

  return (
    <Sheet open={Boolean(unit)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-tabular text-lg">{unit?.serial ?? ""}</SheetTitle>
          <div className="flex min-w-0 items-center gap-4">
            <ProductThumbnail
              src={product?.imageUrl}
              alt={product?.name ?? "Referencia"}
              size="xl"
              className="rounded-xl"
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
          <div className="mt-5 space-y-5">
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
