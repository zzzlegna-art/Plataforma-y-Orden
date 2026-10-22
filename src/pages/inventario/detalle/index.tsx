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
import { getMovementRows, getProductRows, getUnitRows } from "@/lib/selectors";
import type { UnitCondition } from "@/lib/types";
import { ProductFormDialog } from "../ProductFormDialog";
import { SerialesSeccion } from "./seriales-section";

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
