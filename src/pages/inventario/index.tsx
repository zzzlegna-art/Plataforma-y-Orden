import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Boxes,
  Check,
  Eye,
  FileSpreadsheet,
  FileText,
  Headphones,
  Package,
  PencilLine,
  Plus,
  Smartphone,
  Tablet,
  Watch,
  Wrench,
  type LucideIcon,
} from "lucide-react";
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

type StatTone = "primary" | "info" | "warning";

const STAT_TONES: Record<StatTone, { icon: string; bar: string; glow: string }> = {
  primary: {
    icon: "bg-primary/10 text-primary",
    bar: "bg-primary",
    glow: "from-primary/10",
  },
  info: {
    icon: "bg-info/10 text-info",
    bar: "bg-info",
    glow: "from-info/10",
  },
  warning: {
    icon: "bg-warning/10 text-warning",
    bar: "bg-warning",
    glow: "from-warning/10",
  },
};

const STAT_BAR_HEIGHTS = [12, 19, 27, 36, 44] as const;

const InventoryStatCard = ({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  tone: StatTone;
}) => {
  const styles = STAT_TONES[tone];

  return (
    <div className="group relative isolate overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-[0_14px_36px_-26px_rgba(15,39,64,.38)] transition duration-200 [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-elegant motion-reduce:transition-none">
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-28 bg-gradient-to-l to-transparent opacity-80",
          styles.glow,
        )}
      />
      <div className="relative flex min-h-[104px] items-center gap-3">
        <div
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ring-inset ring-current/10",
            styles.icon,
          )}
        >
          <Icon className="h-6 w-6" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          <p className="font-tabular mt-1 text-3xl font-bold leading-none tracking-tight">
            {value.toLocaleString()}
          </p>
          <p className="mt-2 text-xs leading-4 text-muted-foreground">{hint}</p>
        </div>
        <div
          aria-hidden="true"
          className="flex h-11 shrink-0 items-end gap-1.5 pb-0.5"
        >
          {STAT_BAR_HEIGHTS.map((height, index) => (
            <span
              key={height}
              className={cn(
                "w-1.5 origin-bottom rounded-full opacity-70 transition-transform duration-200",
                styles.bar,
                "[@media(hover:hover)]:group-hover:scale-y-110",
              )}
              style={{ height, opacity: 0.3 + index * 0.15 }}
            />
          ))}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"
      />
    </div>
  );
};

const PRODUCT_THUMB_TONES: Record<string, string> = {
  celular:
    "from-sky-100 via-white to-cyan-100 text-sky-700 ring-sky-200/70 dark:from-sky-500/20 dark:via-card dark:to-cyan-500/10 dark:text-sky-300 dark:ring-sky-400/20",
  tablet:
    "from-violet-100 via-white to-indigo-100 text-violet-700 ring-violet-200/70 dark:from-violet-500/20 dark:via-card dark:to-indigo-500/10 dark:text-violet-300 dark:ring-violet-400/20",
  reloj:
    "from-amber-100 via-white to-orange-100 text-amber-700 ring-amber-200/70 dark:from-amber-500/20 dark:via-card dark:to-orange-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  audifono:
    "from-rose-100 via-white to-pink-100 text-rose-700 ring-rose-200/70 dark:from-rose-500/20 dark:via-card dark:to-pink-500/10 dark:text-rose-300 dark:ring-rose-400/20",
  repuesto:
    "from-emerald-100 via-white to-teal-100 text-emerald-700 ring-emerald-200/70 dark:from-emerald-500/20 dark:via-card dark:to-teal-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
};

const ProductThumbnail = ({
  categoria,
  imageUrl,
  size = "sm",
}: {
  categoria?: string;
  imageUrl?: string;
  size?: "sm" | "md";
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageUrl]);

  const Icon =
    categoria === "celular"
      ? Smartphone
      : categoria === "tablet"
        ? Tablet
        : categoria === "reloj"
          ? Watch
          : categoria === "audifono"
            ? Headphones
            : categoria === "repuesto"
              ? Wrench
              : Package;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative isolate grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br shadow-inner ring-1 ring-inset",
        size === "md" ? "h-12 w-12" : "h-10 w-10",
        PRODUCT_THUMB_TONES[categoria ?? ""] ??
          "from-muted via-background to-muted text-muted-foreground ring-border",
      )}
    >
      {imageUrl && !imageFailed ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className="absolute inset-0 z-10 h-full w-full object-cover"
        />
      ) : (
        <>
          <span className="pointer-events-none absolute -right-1 -top-1 h-6 w-6 rounded-full bg-white/50 blur-sm dark:bg-white/5" />
          <Icon className="relative z-10 h-5 w-5 drop-shadow-sm" strokeWidth={1.8} />
        </>
      )}
    </div>
  );
};

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
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <ProductThumbnail categoria={row.product.categoria} imageUrl={row.product.imageUrl} size="md" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold leading-snug">{row.product.name}</p>
              <p className="font-tabular mt-0.5 truncate text-xs text-muted-foreground">
                {row.product.sku}
                {row.brand ? ` · ${row.brand.name}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {row.stock.lowStock ? <LowStockBadge /> : null}
              {!row.product.isActive ? <ActiveBadge isActive={false} /> : null}
            </div>
          </div>
          {row.category ? (
            <p className="text-xs text-muted-foreground">{row.category.name}</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border/60 pt-3">
        <span className="font-tabular text-sm">
          {t("product.availableOf", {
            available: row.stock.disponible,
            total: row.stock.enInventario,
          })}
        </span>
        <span className="font-tabular text-sm font-semibold">
          {formatCurrency(row.product.price)}
        </span>
      </div>
      <CondicionPills stock={row.stock} />
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" asChild className="flex-1 rounded-xl">
          <Link to={detalleUrl(row.product.id)}>
            <Eye />
            {t("product.viewDetail")}
          </Link>
        </Button>
        <ProductFormDialog
          product={row.product}
          trigger={
            <Button size="sm" variant="ghost" className="flex-1 rounded-xl">
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
        <InventoryStatCard
          label={t("product.statProducts")}
          value={rows.length}
          hint={t("product.statProductsHint")}
          icon={Package}
          tone="primary"
        />
        <InventoryStatCard
          label={t("product.statUnits")}
          value={totalDisponibles}
          hint={t("product.statUnitsHint")}
          icon={Smartphone}
          tone="info"
        />
        <InventoryStatCard
          label={t("product.statLow")}
          value={conStockBajo}
          hint={t("product.statLowHint")}
          icon={AlertTriangle}
          tone="warning"
        />
      </div>

      <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
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
            <div className="flex gap-1 rounded-full border bg-muted/40 p-1">
              {(["", "nuevo", "seminuevo"] as const).map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={condicion === option ? "default" : "ghost"}
                  className="h-8 rounded-full px-4"
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
              className="h-8 rounded-full"
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
              className="h-8 rounded-full"
              onClick={() => setLowOnly((previous) => !previous)}
            >
              {lowOnly ? <Check /> : null}
              {t("product.onlyLowStock")}
            </Button>
            <Button
              variant={includeInactive ? "default" : "outline"}
              size="sm"
              className="h-8 rounded-full"
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
        className="rounded-2xl border-border/70 shadow-sm"
        rowClassName={(row) => (row.product.isActive ? undefined : "opacity-60")}
        columns={[
          {
            key: "product",
            header: t("product.title"),
            className: "min-w-[280px]",
            cell: (row) => (
              <div className="flex min-w-0 items-center gap-3 py-1">
                <ProductThumbnail categoria={row.product.categoria} imageUrl={row.product.imageUrl} />
                <div className="min-w-0 space-y-1">
                  <Link
                    to={detalleUrl(row.product.id)}
                    className="block font-semibold leading-snug hover:text-primary hover:underline"
                  >
                    {row.product.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-tabular rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {row.product.sku}
                    </span>
                    {!row.product.isActive ? <ActiveBadge isActive={false} /> : null}
                  </div>
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
