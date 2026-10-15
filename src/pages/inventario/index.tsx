import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, Check, Eye, FileSpreadsheet, FileText, PencilLine, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { DataTable } from "@/components/shared/data-table";
import { ExportDialog } from "@/components/shared/export-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SearchField } from "@/components/shared/search-field";
import { OptionSelect } from "@/components/shared/option-select";
import { ActiveBadge, LowStockBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useStore } from "@/hooks/use-store";
import { exportExcel, exportPdf, exportSubtitle } from "@/lib/export";
import { formatCurrency, todayIso } from "@/lib/format";
import { getProductRows, type ProductRow, type ProductStock } from "@/lib/selectors";
import type { ProductCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductFormDialog } from "./ProductFormDialog";

/**
 * Pastillas de condición: muestran las unidades que siguen en inventario
 * (nuevas o seminuevas). Una referencia vendida por completo no muestra ninguna.
 */
const CondicionPill = ({
  tone,
  label,
  count,
}: {
  tone: "primary" | "neutral";
  label: string;
  count: number;
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-2.5 pr-1 text-xs font-medium",
      tone === "primary"
        ? "border-transparent bg-primary/12 text-primary"
        : "border-border bg-muted text-muted-foreground",
    )}
  >
    {label}
    <span className="font-tabular min-w-5 rounded-full bg-background/70 px-1.5 text-center font-semibold">
      {count}
    </span>
  </span>
);

const CondicionPills = ({ stock }: { stock: ProductStock }) => {
  const { t } = useTranslation();
  const vacio = stock.nuevoEnInventario === 0 && stock.seminuevoEnInventario === 0;
  if (vacio) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {stock.nuevoEnInventario > 0 ? (
        <CondicionPill tone="primary" label={t("condition.nuevo")} count={stock.nuevoEnInventario} />
      ) : null}
      {stock.seminuevoEnInventario > 0 ? (
        <CondicionPill
          tone="neutral"
          label={t("condition.seminuevo")}
          count={stock.seminuevoEnInventario}
        />
      ) : null}
    </div>
  );
};

/** Catálogo de productos con su stock por estado. */
const Inventario = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState<"" | ProductCategory>("");
  const [brandId, setBrandId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [condicion, setCondicion] = useState<"" | "nuevo" | "seminuevo">("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "excel">("pdf");
  const [exportCat, setExportCat] = useState<"" | ProductCategory>("");
  const [exportCond, setExportCond] = useState<"" | "nuevo" | "seminuevo">("");

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const cond = condicion === "" ? undefined : condicion;
    // El stock se calcula con la condición elegida: al filtrar "nuevos" no se
    // muestran ni las unidades ni las pastillas de seminuevos, y al revés.
    return getProductRows(db, cond)
      .filter((row) => (includeInactive ? true : row.product.isActive))
      .filter((row) => (tipo ? row.product.categoria === tipo : true))
      .filter((row) => (brandId ? row.product.brandId === brandId : true))
      .filter((row) => (lowOnly ? row.stock.lowStock : true))
      .filter((row) => (cond ? row.stock.enInventario > 0 : true))
      .filter(
        (row) =>
          !needle ||
          row.product.name.toLowerCase().includes(needle) ||
          row.product.sku.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [db, search, tipo, brandId, lowOnly, includeInactive, condicion]);

  // Resumen de lo que se ve en la lista (respeta los filtros y la condición elegida).
  const totalDisponibles = rows.reduce((suma, row) => suma + row.stock.disponible, 0);
  const conStockBajo = rows.filter((row) => row.stock.lowStock).length;

  const exportar = (format: "pdf" | "excel") => {
    const cond = exportCond === "" ? undefined : exportCond;
    // Las columnas se calculan solo con la condición elegida: un informe de
    // "celulares nuevos" no incluye unidades seminuevas ni al revés.
    const base = getProductRows(db, cond)
      // Solo referencias con unidades en existencia: lo vendido o liberado no es inventario.
      .filter((row) => row.stock.enInventario > 0)
      .filter((row) => (exportCat ? row.product.categoria === exportCat : true))
      .sort((a, b) => a.product.name.localeCompare(b.product.name));

    if (base.length === 0) {
      toast.error(t("export.noData"));
      return;
    }

    const body = base.map((row, index) => [
      index + 1,
      row.product.sku,
      row.product.name,
      row.category?.name ?? "—",
      row.brand?.name ?? "—",
      formatCurrency(row.product.price),
      row.stock.disponible,
      row.stock.enInventario,
      row.stock.lowStock ? t("product.lowStock") : t("export.estadoDisponible"),
    ]);
    const head = [
      "#",
      t("product.sku"),
      t("export.producto"),
      t("export.categoria"),
      t("export.marca"),
      t("product.price"),
      t("product.available"),
      t("product.enInventario"),
      t("export.estado"),
    ];

    if (format === "pdf") {
      exportPdf({
        title: `${t("nav.inventory")} — ${db.settings.companyName}`,
        subtitle: exportSubtitle(body.length),
        head,
        body,
        filename: `inventario-${todayIso()}.pdf`,
        highlightColumns: [1],
      });
    } else {
      exportExcel({
        filename: `inventario-${todayIso()}.xlsx`,
        sheets: [
          {
            name: "Inventario",
            title: `${t("nav.inventory")} — ${db.settings.companyName}`,
            subtitle: exportSubtitle(body.length),
            columns: head,
            rows: body,
          },
        ],
      });
    }
  };

  /** Enlace al detalle conservando la condición elegida en el listado. */
  const detalleUrl = (productId: string) =>
    condicion ? `/inventario/${productId}?condicion=${condicion}` : `/inventario/${productId}`;

  const renderCard = (row: ProductRow) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{row.product.name}</p>
          <p className="font-tabular truncate text-xs text-muted-foreground">
            {row.product.sku}
            {row.brand ? ` · ${row.brand.name}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {row.stock.lowStock ? <LowStockBadge /> : null}
          {!row.product.isActive ? <ActiveBadge isActive={false} /> : null}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-tabular text-sm">
          {t("product.availableOf", {
            available: row.stock.disponible,
            total: row.stock.enInventario,
          })}
        </span>
        <span className="font-tabular text-sm text-muted-foreground">
          {formatCurrency(row.product.price)}
        </span>
      </div>
      <CondicionPills stock={row.stock} />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" asChild className="flex-1">
          <Link to={detalleUrl(row.product.id)}>{t("product.viewDetail")}</Link>
        </Button>
        <ProductFormDialog
          product={row.product}
          trigger={
            <Button size="sm" variant="ghost" className="flex-1">
              <PencilLine />
              {t("common.edit")}
            </Button>
          }
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-5 stagger nx-operations nx-operations-inventario">
      <PageHeader
        title={t("product.title")}
        description={t("product.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setExportFormat("pdf");
                setExportOpen(true);
              }}
            >
              <FileText />
              {t("export.pdf")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setExportFormat("excel");
                setExportOpen(true);
              }}
            >
              <FileSpreadsheet />
              {t("export.excel")}
            </Button>
            <ProductFormDialog
              trigger={
                <Button>
                  <Plus />
                  {t("product.new")}
                </Button>
              }
            />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3 shadow-sm transition-[box-shadow,transform] duration-200 hover:shadow-elegant motion-reduce:transition-none [@media(hover:hover)]:hover:-translate-y-0.5 motion-reduce:[@media(hover:hover)]:hover:translate-y-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("product.statProducts")}
          </p>
          <p className="font-tabular mt-0.5 text-xl font-semibold">{rows.length}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3 shadow-sm transition-[box-shadow,transform] duration-200 hover:shadow-elegant motion-reduce:transition-none [@media(hover:hover)]:hover:-translate-y-0.5 motion-reduce:[@media(hover:hover)]:hover:translate-y-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("product.statUnits")}
          </p>
          <p className="font-tabular mt-0.5 text-xl font-semibold">{totalDisponibles}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3 shadow-sm transition-[box-shadow,transform] duration-200 hover:shadow-elegant motion-reduce:transition-none [@media(hover:hover)]:hover:-translate-y-0.5 motion-reduce:[@media(hover:hover)]:hover:translate-y-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("product.statLow")}
          </p>
          <p
            className={cn(
              "font-tabular mt-0.5 text-xl font-semibold",
              conStockBajo > 0 && "text-warning",
            )}
          >
            {conStockBajo}
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={t("product.searchPlaceholder")}
          />
          <OptionSelect
            value={tipo}
            onChange={(value) => setTipo(value as "" | ProductCategory)}
            emptyLabel={t("product.allCategories")}
            options={[
              { value: "celular", label: t("productCat.celular") },
              { value: "tablet", label: t("productCat.tablet") },
              { value: "reloj", label: t("productCat.reloj") },
              { value: "audifono", label: t("productCat.audifono") },
              { value: "repuesto", label: t("productCat.repuesto") },
            ]}
          />
          <OptionSelect
            value={brandId}
            onChange={setBrandId}
            emptyLabel={t("product.allBrands")}
            options={db.brands.map((brand) => ({ value: brand.id, label: brand.name }))}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("export.conditionQuestion")}
            </span>
            <div className="flex gap-1 rounded-md border bg-muted/40 p-0.5">
              {(["", "nuevo", "seminuevo"] as const).map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={condicion === option ? "default" : "ghost"}
                  className="h-7 px-3"
                  onClick={() => setCondicion(option)}
                >
                  {option === ""
                    ? t("common.all")
                    : option === "nuevo"
                      ? t("export.nuevos")
                      : t("export.seminuevos")}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                setSearch("");
                setTipo("");
                setBrandId("");
                setLowOnly(false);
                setIncludeInactive(false);
                setCondicion("");
              }}
            >
              Limpiar filtros
            </Button>
            <Button
              variant={lowOnly ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => setLowOnly((previous) => !previous)}
            >
              {lowOnly ? <Check /> : null}
              {t("product.onlyLowStock")}
            </Button>
            <Button
              variant={includeInactive ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => setIncludeInactive((previous) => !previous)}
            >
              {includeInactive ? <Check /> : null}
              {t("product.includeInactive")}
            </Button>
          </div>
        </div>
      </div>

      <DataTable<ProductRow>
        rows={rows}
        rowKey={(row) => row.product.id}
        emptyTitle={
          search || tipo || brandId || lowOnly || condicion
            ? t("product.emptyFilteredTitle")
            : t("product.emptyTitle")
        }
        emptyDescription={
          search || tipo || brandId || lowOnly || condicion
            ? t("product.emptyFilteredDescription")
            : t("product.emptyDescription")
        }
        emptyIcon={Boxes}
        emptyAction={
          !search && !tipo && !brandId && !lowOnly && !condicion ? (
            <ProductFormDialog
              trigger={
                <Button>
                  <Plus />
                  {t("product.new")}
                </Button>
              }
            />
          ) : undefined
        }
        renderCard={renderCard}
        rowClassName={(row) => (row.product.isActive ? undefined : "opacity-60")}
        columns={[
          {
            key: "product",
            header: t("product.title"),
            className: "min-w-[220px]",
            cell: (row) => (
              <div className="min-w-0 space-y-1">
                <Link
                  to={detalleUrl(row.product.id)}
                  className="block font-medium leading-snug hover:text-primary hover:underline"
                >
                  {row.product.name}
                </Link>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-tabular rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {row.product.sku}
                  </span>
                  {!row.product.isActive ? <ActiveBadge isActive={false} /> : null}
                </div>
              </div>
            ),
          },
          {
            key: "catalog",
            header: t("product.categoryBrand"),
            cell: (row) =>
              row.category || row.brand ? (
                <div className="space-y-0.5 text-sm">
                  {row.category ? <p>{row.category.name}</p> : null}
                  {row.brand ? (
                    <p className="text-xs text-muted-foreground">{row.brand.name}</p>
                  ) : null}
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
          {
            key: "condition",
            header: t("product.condition"),
            cell: (row) => <CondicionPills stock={row.stock} />,
          },
          {
            key: "price",
            header: t("product.price"),
            align: "right",
            className: "whitespace-nowrap",
            cell: (row) =>
              row.product.price > 0 ? (
                <span className="font-tabular text-sm font-medium">
                  {formatCurrency(row.product.price)}
                </span>
              ) : (
                <span className="text-xs italic text-muted-foreground">{t("product.noPrice")}</span>
              ),
          },
          {
            key: "available",
            header: t("product.available"),
            align: "right",
            className: "whitespace-nowrap",
            cell: (row) => (
              <div className="flex items-center justify-end gap-2">
                {row.stock.lowStock ? <LowStockBadge /> : null}
                <span
                  className={cn(
                    "font-tabular min-w-8 text-sm font-semibold",
                    row.stock.disponible === 0 && "text-destructive",
                  )}
                >
                  {row.stock.disponible}
                </span>
              </div>
            ),
          },
          {
            key: "total",
            header: t("product.enInventario"),
            align: "right",
            className: "whitespace-nowrap",
            cell: (row) => (
              <span className="font-tabular text-sm text-muted-foreground">
                {row.stock.enInventario}
              </span>
            ),
          },
          {
            key: "actions",
            header: t("common.actions"),
            align: "right",
            className: "whitespace-nowrap",
            cell: (row) => (
              <div className="flex items-center justify-end gap-1.5">
                <Button size="sm" variant="outline" className="h-8" asChild>
                  <Link to={detalleUrl(row.product.id)}>
                    <Eye />
                    {t("common.view")}
                  </Link>
                </Button>
                <ProductFormDialog
                  product={row.product}
                  trigger={
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label={t("common.edit")}
                    >
                      <PencilLine />
                    </Button>
                  }
                />
              </div>
            ),
          },
        ]}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        title={t("export.inventoryTitle")}
        description={t("export.choose")}
        onConfirm={() => exportar(exportFormat)}
      >
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("export.categoryQuestion")}
          </Label>
          <RadioGroup
            value={exportCat}
            onValueChange={(value) => setExportCat(value as "" | ProductCategory)}
            className="gap-1.5"
          >
            {(
              [
                { value: "", label: t("export.allInventory") },
                { value: "celular", label: t("export.onlyCelulares") },
                { value: "tablet", label: t("export.onlyTablets") },
                { value: "reloj", label: t("export.onlyRelojes") },
                { value: "audifono", label: t("export.onlyAudifonos") },
                { value: "repuesto", label: t("export.onlyRepuestos") },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                onClick={() => setExportCat(option.value)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                  exportCat === option.value
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50",
                )}
              >
                <RadioGroupItem value={option.value} />
                {option.label}
              </label>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("export.conditionQuestion")}
          </Label>
          <RadioGroup
            value={exportCond}
            onValueChange={(value) => setExportCond(value as "" | "nuevo" | "seminuevo")}
            className="gap-1.5"
          >
            {(
              [
                { value: "", label: t("export.allConditions") },
                { value: "nuevo", label: t("export.nuevos") },
                { value: "seminuevo", label: t("export.seminuevos") },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                onClick={() => setExportCond(option.value)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                  exportCond === option.value
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50",
                )}
              >
                <RadioGroupItem value={option.value} />
                {option.label}
              </label>
            ))}
          </RadioGroup>
        </div>
      </ExportDialog>
    </div>
  );
};

export default Inventario;
