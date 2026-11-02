import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, History, PencilLine, Power, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StockSummary } from "@/components/shared/stock-summary";
import { ActiveBadge, Badge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import { deleteProduct, setProductActive } from "@/lib/actions/catalogs";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { getMovementRows, getProductRows, getUnitRows, unidadesDescontadasPorPreparacion, unidadesFueraPorGarantia } from "@/lib/selectors";
import type { UnitCondition } from "@/lib/types";
import { ProductFormDialog } from "../ProductFormDialog";
import { SerialesSeccion } from "./seriales-section";
import { DisponibilidadPorSede } from "./DisponibilidadPorSede";

/** Detalle de producto: stock, seriales y movimientos. */
const ProductoDetalle = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const navigate = useNavigate();
  const { productId } = useParams();
  const [params, setParams] = useSearchParams();

  // La condición viaja en la URL para que al entrar desde el listado filtrado
  // por "seminuevos" el detalle muestre solo esas unidades.
  const buscada = params.get("condicion");
  const condicion: UnitCondition | undefined =
    buscada === "nuevo" || buscada === "seminuevo" ? buscada : undefined;
  // Al volver desde la ficha, regresar al listado con los filtros que originaron la navegación.
  const rutaInventario = params.toString() ? `/inventario?${params.toString()}` : "/inventario";

  const cambiarCondicion = (siguiente?: UnitCondition) => {
    const next = new URLSearchParams(params);
    if (siguiente) next.set("condicion", siguiente);
    else next.delete("condicion");
    setParams(next, { replace: true });
  };

  const row = useMemo(
    () => getProductRows(db, condicion).find((item) => item.product.id === productId),
    [db, productId, condicion],
  );
  const units = useMemo(
    () =>
      getUnitRows(db)
        .filter((item) => item.unit.productId === productId)
        .filter((item) => (condicion ? item.unit.condition === condicion : true)),
    [db, productId, condicion],
  );
  const preparedUnitIds = useMemo(() => unidadesDescontadasPorPreparacion(db), [db]);
  const excludedWarrantyIds = useMemo(() => unidadesFueraPorGarantia(db), [db]);
  const siteUnits = useMemo(() => units.map((row) => row.unit), [units]);
  const movements = useMemo(
    () => getMovementRows(db, 500).filter((movement) => movement.product?.id === productId),
    [db, productId],
  );

  if (!row) {
    return (
      <EmptyState
        title={t("product.notFound")}
        description={t("product.notFoundDescription")}
        action={
          <Button asChild>
            <Link to={rutaInventario}>{t("product.backToCatalog")}</Link>
          </Button>
        }
      />
    );
  }

  const { product, stock } = row;
  const puedeEliminar =
    !db.units.some((unit) => unit.productId === product.id) &&
    !db.orderItems.some((item) => item.productId === product.id);

  return (
    <div className="space-y-5 animate-fade-in">
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link to={rutaInventario}>
          <ArrowLeft />
          {t("product.backToCatalog")}
        </Link>
      </Button>

      <PageHeader
        title={product.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-tabular">{product.sku}</span>
            {row.category ? <Badge label={row.category.name} withDot={false} /> : null}
            {row.brand ? <Badge label={row.brand.name} withDot={false} /> : null}
            <ActiveBadge isActive={product.isActive} />
          </span>
        }
        actions={
          <>
            <ProductFormDialog
              product={product}
              trigger={
                <Button variant="outline">
                  <PencilLine />
                  {t("common.edit")}
                </Button>
              }
            />
            <ConfirmDialog
              trigger={
                <Button variant={product.isActive ? "outline" : "default"}>
                  <Power />
                  {product.isActive ? t("product.deactivate") : t("product.activate")}
                </Button>
              }
              title={
                product.isActive ? t("product.deactivateTitle") : t("product.activateTitle")
              }
              description={t("product.toggleDescription")}
              confirmLabel={t("common.confirm")}
              destructive={product.isActive}
              onConfirm={async () => {
                await runAction(
                  (db2, actor) =>
                    setProductActive(db2, actor, {
                      id: product.id,
                      isActive: !product.isActive,
                    }),
                  { success: "product.updated" },
                );
              }}
            />
            {puedeEliminar ? (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" className="text-destructive hover:text-destructive">
                    <Trash2 />
                    {t("common.delete")}
                  </Button>
                }
                title={t("product.deleteTitle")}
                description={t("product.deleteDescription")}
                confirmLabel={t("common.delete")}
                destructive
                onConfirm={async () => {
                  const result = await runAction(
                    (db2, actor) => deleteProduct(db2, actor, { id: product.id }),
                    { success: "product.deleted" },
                  );
                  if (result !== null) navigate(rutaInventario);
                }}
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("product.price")}
          </p>
          <p className="font-tabular mt-1 text-xl font-semibold">
            {formatCurrency(product.price)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("product.cost")}
          </p>
          <p className="font-tabular mt-1 text-xl font-semibold">
            {formatCurrency(product.cost)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("product.minStock")}
          </p>
          <p className="font-tabular mt-1 text-xl font-semibold">{product.minStock}</p>
        </div>
      </div>

      <StockSummary stock={stock} />
      <DisponibilidadPorSede
        units={siteUnits}
        preparedUnitIds={preparedUnitIds}
        excludedWarrantyIds={excludedWarrantyIds}
      />
      {(product.colorVariants?.length ?? 0) > 0 ? (
        <section className="rounded-2xl border border-primary/20 bg-card p-4 sm:p-5">
          <h2 className="text-base font-bold">Stock y precios por color</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Una sola referencia y SKU con tarifas por color. No es necesario clasificar los IMEI
            en recepción: el color se asigna al serializar cada pedido.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {product.colorVariants?.map((variant) => {
              const asignados = new Set(db.orderItemUnits.filter((assignment) => {
                const linea = db.orderItems.find((i) => i.id === assignment.orderItemId);
                const pedido = linea && db.orders.find((o) => o.id === linea.orderId);
                return pedido?.status === "preparado" || pedido?.status === "en_preparacion";
              }).map((assignment) => assignment.unitId));
              const disponibles = units.filter(({ unit }) =>
                (unit.color ?? "").toLowerCase() === variant.color.toLowerCase() &&
                ["en_bodega","en_local"].includes(unit.status) && !asignados.has(unit.id),
              ).length;
              return (
                <div key={variant.color} className="rounded-xl border bg-background/80 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm">{variant.color}</strong>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{disponibles} identificados</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div><p className="text-muted-foreground">Costo sugerido</p><p className="font-tabular mt-1 font-bold">{formatCurrency(variant.cost)}</p></div>
                    <div><p className="text-muted-foreground">Venta sugerida</p><p className="font-tabular mt-1 font-bold">{formatCurrency(variant.price)}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
          {(() => {
            const asignados = new Set(db.orderItemUnits.filter((row) => {
              const item = db.orderItems.find((linea) => linea.id === row.orderItemId);
              const pedido = item && db.orders.find((order) => order.id === item.orderId);
              return pedido && ["en_preparacion","preparado"].includes(pedido.status);
            }).map((row) => row.unitId));
            const sinColor = units.filter(({unit}) => !unit.color &&
              ["en_bodega","en_local"].includes(unit.status) && !asignados.has(unit.id)).length;
            return sinColor > 0 ? (
              <p className="mt-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
                <strong>{sinColor} equipos disponibles sin color asignado.</strong> Se pueden elegir
                como blancos, azules o de otro color configurado al serializar el pedido.
                No se suman por separado a cada color para evitar duplicar el stock.
              </p>
            ) : null;
          })()}
        </section>
      ) : null}

      {product.description ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          {product.description}
        </p>
      ) : null}

      <SerialesSeccion
        product={product}
        units={units}
        condicion={condicion}
        onCambiarCondicion={cambiarCondicion}
      />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("movement.title")}</h3>
        <DataTable
          rows={movements}
          rowKey={(movement) => movement.id}
          emptyTitle={t("movement.emptyTitle")}
          emptyDescription={t("movement.emptyDescription")}
          emptyIcon={History}
          renderCard={(movement) => (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Badge label={t(`movement.${movement.type}`)} withDot={false} />
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(movement.createdAt)}
                </span>
              </div>
              <p className="font-tabular text-sm">{movement.serial ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{movement.notes ?? "—"}</p>
            </div>
          )}
          columns={[
            {
              key: "date",
              header: t("common.date"),
              cell: (movement) => (
                <span className="text-sm">{formatDateTime(movement.createdAt)}</span>
              ),
            },
            {
              key: "type",
              header: t("movement.type"),
              cell: (movement) => (
                <Badge label={t(`movement.${movement.type}`)} withDot={false} />
              ),
            },
            {
              key: "serial",
              header: t("unit.serial"),
              cell: (movement) => (
                <span className="font-tabular text-sm">{movement.serial ?? "—"}</span>
              ),
            },
            {
              key: "reference",
              header: t("movement.reference"),
              cell: (movement) => (
                <span className="text-sm text-muted-foreground">
                  {t(`movementSource.${movement.referenceType}`)}
                </span>
              ),
            },
            {
              key: "notes",
              header: t("common.notes"),
              cell: (movement) => (
                <span className="text-sm text-muted-foreground">{movement.notes ?? "—"}</span>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
};

export default ProductoDetalle;
