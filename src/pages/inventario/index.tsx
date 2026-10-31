import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Bluetooth,
  Boxes,
  BookOpen,
  Camera,
  Check,
  Cpu,
  Droplets,
  HardDrive,
  Eye,
  Fingerprint,
  FileSpreadsheet,
  FileUp,
  FileText,
  Headphones,
  Mic,
  Monitor,
  Package,
  Plug,
  Palette,
  PencilLine,
  Ruler,
  Plus,
  Smartphone,
  Tablet,
  Volume2,
  Keyboard,
  Image as ImageIcon,
  Settings2,
  MapPin,
  Watch,
  Wifi,
  Wrench,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { DataTable } from "@/components/shared/data-table";
import { ExportDialog } from "@/components/shared/export-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SearchField } from "@/components/shared/search-field";
import { OptionSelect } from "@/components/shared/option-select";
import { ActiveBadge, LowStockBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useStore } from "@/hooks/use-store";
import {
  exportCompanyName,
  exportExcel,
  exportPdf,
  exportProductCatalogExcel,
  exportProductCatalogPdf,
  exportSubtitle,
  type CatalogExportProgress,
} from "@/lib/export";
import { descargarCsv } from "@/lib/csv";
import { getProductTechnicalSpecFieldsForCategory } from "@/lib/product-specs";
import { coincideBusquedaInventario, indexUnitSerialsByProduct } from "@/lib/inventory-search";
import { clearInventoryFilters, getInventoryFilters, updateInventoryFilter } from "@/lib/inventory-filters";
import { formatCurrency, todayIso } from "@/lib/format";
import { getProductRows, type ProductRow, type ProductStock } from "@/lib/selectors";
import { etiquetaTipoProducto, tiposProductoOrdenados } from "@/lib/products";
import type { Product, ProductCategory, ProductTechnicalSpecKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductFormDialog } from "./ProductFormDialog";
import { ProductImportDialog } from "./ProductImportDialog";
import "./inventory-product-zoom.css";

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

const TECHNICAL_SPEC_ICONS: Record<ProductTechnicalSpecKey, LucideIcon> = {
  storage: HardDrive,
  ram: Cpu,
  processor: Cpu,
  screen: Monitor,
  screenResolution: Monitor,
  refreshRate: Monitor,
  cameras: Camera,
  rearCamera: Camera,
  frontCamera: Camera,
  battery: BatteryCharging,
  connectivity: Wifi,
  color: Palette,
  caseSize: Ruler,
  compatibility: Bluetooth,
  material: Package,
  waterResistance: Droplets,
  sensors: Activity,
  operatingSystem: Package,
  biometric: Fingerprint,
  stylusSupport: PencilLine,
  keyboardSupport: Keyboard,
  gps: MapPin,
  cellularConnectivity: Wifi,
  noiseCancellation: Volume2,
  transparencyMode: Volume2,
  spatialAudio: Volume2,
  microphones: Mic,
  soundLevel: Volume2,
  caseBattery: BatteryCharging,
  chargingCase: BatteryCharging,
  wirelessCharging: BatteryCharging,
  bluetoothVersion: Bluetooth,
  audioCodec: Volume2,
  graphics: Monitor,
  ports: Plug,
  dimensions: Ruler,
  weight: Package,
  power: BatteryCharging,
  audioFeatures: Volume2,
  latency: Activity,
};

const ProductThumbnail = ({
  product,
  brandName,
  categoryName,
  technicalEnabled,
  size = "sm",
}: {
  product: Product;
  brandName?: string;
  categoryName?: string;
  technicalEnabled?: boolean;
  size?: "sm" | "md";
}) => {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [product.imageUrl]);
  // Solo mostrar fotografías asignadas explícitamente a esta referencia.
  // No deducir fotos de celulares a partir del nombre de pantallas o repuestos.
  const imageUrl = product.imageUrl && !imageFailed ? product.imageUrl : undefined;

  const Icon =
    product.categoria === "celular"
      ? Smartphone
      : product.categoria === "tablet"
        ? Tablet
        : product.categoria === "reloj"
          ? Watch
          : product.categoria === "audifono"
            ? Headphones
            : product.categoria === "repuesto"
              ? Wrench
              : Package;
  const sizeClasses = size === "md" ? "h-16 w-16" : "h-20 w-20";
  const thumbnailClasses = cn(
    "relative isolate grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br shadow-sm ring-1 ring-inset transition-all duration-200",
    sizeClasses,
    PRODUCT_THUMB_TONES[product.categoria ?? ""] ??
      "from-muted via-background to-muted text-muted-foreground ring-border",
  );
  // Las fotografías usan un marco neutro: el color por categoría solo se reserva
  // para el icono de respaldo cuando una referencia no tiene imagen.
  const imageThumbnailClasses = cn(
    "relative isolate grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm ring-1 ring-inset ring-border/40 transition-all duration-200",
    sizeClasses,
  );
  const showTechnicalSpecs = technicalEnabled ?? product.categoria !== "repuesto";
  const specFields = showTechnicalSpecs ? getProductTechnicalSpecFieldsForCategory(product.categoria) : [];
  const populatedFields = specFields.filter((field) => Boolean(product.technicalSpecs?.[field.key]?.trim()));
  const populatedCustomFields = showTechnicalSpecs && !["celular", "tablet", "reloj", "audifono"].includes(product.categoria)
    ? (product.technicalSpecs?.customFields ?? []).filter(
        (field) => Boolean(field.name.trim() && field.value.trim()),
      )
    : [];
  const technicalCount = populatedFields.length + populatedCustomFields.length;

  if (imageUrl) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={t("product.zoomImage", { name: product.name })}
            className={cn(
              imageThumbnailClasses,
              "group cursor-zoom-in border-0 p-0 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            )}
          >
            <img
              src={imageUrl}
              alt={product.name}
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
              className="absolute inset-0 z-10 h-full w-full object-contain p-1.5"
            />
            <span className="absolute bottom-1 right-1 z-20 rounded-lg bg-black/65 p-1.5 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <ZoomIn className="h-4 w-4" />
            </span>
          </button>
        </DialogTrigger>
        <DialogContent
          className={cn("nx-inventory-zoom", !showTechnicalSpecs && "nx-inventory-zoom-solo")}
        >
          <DialogHeader className="nx-inventory-zoom-header">
            <div className="nx-inventory-zoom-heading">
              <span className="nx-inventory-zoom-mark" aria-hidden="true">
                <ZoomIn className="h-6 w-6" strokeWidth={1.9} />
              </span>
              <div className="nx-inventory-zoom-heading-text">
                <DialogTitle>{product.name}</DialogTitle>
                <DialogDescription className="nx-inventory-zoom-subtitle">
                  {product.sku} · {t("product.imageZoomHint")}
                </DialogDescription>
              </div>
            </div>
            <div className="nx-inventory-zoom-meta" aria-label="Información del producto">
              {brandName ? <span className="nx-inventory-zoom-pill">{brandName}</span> : null}
              {categoryName ? <span className="nx-inventory-zoom-pill">{categoryName}</span> : null}
              <span className="nx-inventory-zoom-pill font-tabular">{product.sku}</span>
            </div>
          </DialogHeader>

          <div className="nx-inventory-zoom-body">
            <section className="nx-inventory-zoom-media" aria-label={t("product.imagePreviewAlt")}>
              <div className="nx-inventory-zoom-media-title">
                <span>Vista del producto</span>
                <span className="nx-inventory-zoom-original">
                  <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  Imagen original
                </span>
              </div>
              <div className="nx-inventory-zoom-stage">
                {showTechnicalSpecs ? (
                  <img
                    src={imageUrl}
                    alt={product.name}
                    className="max-h-[72vh] w-full object-contain"
                    decoding="async"
                  />
                ) : (
                  <img
                    src={imageUrl}
                    alt={product.name}
                    className="max-h-[76vh] w-full object-contain"
                    decoding="async"
                  />
                )}
              </div>
              <p className="nx-inventory-zoom-image-hint">
                <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                {t("product.imageZoomHint")}
              </p>
            </section>

            {showTechnicalSpecs ? (
              <div className="nx-inventory-zoom-info">
                <section className="nx-inventory-zoom-specs">
                  <div className="nx-inventory-zoom-section-header">
                    <span className="nx-inventory-zoom-section-icon" aria-hidden="true">
                      <Settings2 className="h-5 w-5" strokeWidth={1.9} />
                    </span>
                    <div className="nx-inventory-zoom-section-copy">
                      <h3>{t("product.technicalDetails")}</h3>
                      <p>{t("product.technicalSpecsSubtitle")}</p>
                    </div>
                    <span className="nx-inventory-zoom-count font-tabular" aria-label={`${technicalCount} características`}>
                      {technicalCount} <span>especificaciones</span>
                    </span>
                  </div>
                  {technicalCount ? (
                    <div className="nx-inventory-zoom-spec-grid">
                      {populatedFields.map((field) => {
                        const SpecIcon = TECHNICAL_SPEC_ICONS[field.key];
                        return (
                          <div key={field.key} className="nx-inventory-zoom-spec-card">
                            <span className="nx-inventory-zoom-spec-icon" aria-hidden="true">
                              <SpecIcon className="h-4 w-4" strokeWidth={1.9} />
                            </span>
                            <div className="nx-inventory-zoom-spec-copy">
                              <p className="nx-inventory-zoom-spec-label">{t(field.labelKey)}</p>
                              <p className="nx-inventory-zoom-spec-value">{product.technicalSpecs?.[field.key]}</p>
                            </div>
                          </div>
                        );
                      })}
                      {populatedCustomFields.map((field) => (
                        <div key={field.id} className="nx-inventory-zoom-spec-card">
                          <span className="nx-inventory-zoom-spec-icon" aria-hidden="true">
                            <Package className="h-4 w-4" strokeWidth={1.9} />
                          </span>
                          <div className="nx-inventory-zoom-spec-copy">
                            <p className="nx-inventory-zoom-spec-label">{field.name}</p>
                            <p className="nx-inventory-zoom-spec-value">{field.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="nx-inventory-zoom-no-specs">
                      {t("product.technicalSpecsEmpty")}
                    </div>
                  )}
                </section>
                <section className="nx-inventory-zoom-description">
                  <div className="nx-inventory-zoom-description-heading">
                    <span className="nx-inventory-zoom-section-icon" aria-hidden="true">
                      <FileText className="h-5 w-5" strokeWidth={1.9} />
                    </span>
                    <div>
                      <h3>{t("product.description")}</h3>
                      <p className="whitespace-pre-wrap break-words">
                        {product.description?.trim() || t("product.descriptionEmpty")}
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div aria-hidden="true" className={thumbnailClasses}>
      <span className="pointer-events-none absolute -right-1 -top-1 h-8 w-8 rounded-full bg-white/50 blur-sm dark:bg-white/5" />
      <Icon
        className={cn("relative z-10 drop-shadow-sm", size === "md" ? "h-7 w-7" : "h-8 w-8")}
        strokeWidth={1.8}
      />
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
  const supportsTechnicalSpecs = (product: Product) => {
    const productType = db.productTypes.find((type) => type.key === product.categoria);
    return product.categoria !== "repuesto" && productType?.mayoristaGroup !== "repuestos";
  };
  const [params, setParams] = useSearchParams();
  const { search, tipo, brandId, lowOnly, includeInactive, condicion } = getInventoryFilters(params);
  const updateFilter = (
    key: "q" | "tipo" | "marca" | "bajo" | "inactivos" | "condicion",
    value: string | boolean,
  ) => {
    setParams((previous) => updateInventoryFilter(previous, key, value), { replace: true });
  };
  const setSearch = (value: string) => updateFilter("q", value);
  const setTipo = (value: "" | ProductCategory) => updateFilter("tipo", value);
  const setBrandId = (value: string) => updateFilter("marca", value);
  const setLowOnly = (value: boolean) => updateFilter("bajo", value);
  const setIncludeInactive = (value: boolean) => updateFilter("inactivos", value);
  const setCondicion = (value: "" | "nuevo" | "seminuevo") => updateFilter("condicion", value);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "excel">("pdf");
  const [exportCat, setExportCat] = useState<"" | ProductCategory>("");
  const [exportCond, setExportCond] = useState<"" | "nuevo" | "seminuevo">("");
  const [catalogExportOpen, setCatalogExportOpen] = useState(false);
  const [catalogFormat, setCatalogFormat] = useState<"pdf" | "excel" | "csv">("pdf");
  const [catalogCat, setCatalogCat] = useState("");
  const [catalogIncludePrice, setCatalogIncludePrice] = useState(false);
  const [catalogIncludeStock, setCatalogIncludeStock] = useState(false);
  const [catalogExportProgress, setCatalogExportProgress] = useState<CatalogExportProgress | null>(null);

  const productTypesByKey = useMemo(
    () => new Map(db.productTypes.map((productType) => [productType.key, productType] as const)),
    [db.productTypes],
  );

  // Índice de seriales por producto: se construye una vez por actualización de unidades,
  // no en cada tecla de búsqueda.
  const serialsByProduct = useMemo(() => indexUnitSerialsByProduct(db.units), [db.units]);

  const rows = useMemo(() => {
    const cond = condicion === "" ? undefined : condicion;
    // El stock se calcula con la condición elegida: al filtrar "nuevos" no se
    // muestran ni las unidades ni las pastillas de seminuevos, y al revés.
    return getProductRows(db, cond)
      .filter((row) => (includeInactive ? true : row.product.isActive))
      .filter((row) => (tipo ? row.product.categoria === tipo : true))
      .filter((row) => (brandId ? row.product.brandId === brandId : true))
      .filter((row) => (lowOnly ? row.stock.lowStock : true))
      .filter((row) => (cond ? row.stock.enInventario > 0 : true))
      .filter((row) => {
        const productType = productTypesByKey.get(row.product.categoria);
        const standardSpecValues = getProductTechnicalSpecFieldsForCategory(row.product.categoria)
          .flatMap((field) => {
            const value = row.product.technicalSpecs?.[field.key]?.trim();
            return value ? [t(field.labelKey), value] : [];
          });
        const customSpecValues = (row.product.technicalSpecs?.customFields ?? [])
          .flatMap((field) => [field.name, field.value]);

        return coincideBusquedaInventario(search, [
          row.product.name,
          row.product.sku,
          row.product.description,
          row.brand?.name,
          row.category?.name,
          row.product.categoria,
          productType ? etiquetaTipoProducto(t, productType) : undefined,
          ...standardSpecValues,
          ...customSpecValues,
          ...(serialsByProduct.get(row.product.id) ?? []),
        ]);
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [db, search, tipo, brandId, lowOnly, includeInactive, condicion, productTypesByKey, serialsByProduct, t]);

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
      formatCurrency(row.product.cost),
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
      t("product.salePrice"),
      t("product.costPrice"),
      t("product.available"),
      t("product.enInventario"),
      t("export.estado"),
    ];

    if (format === "pdf") {
      exportPdf({
        title: t("nav.inventory"),
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
            title: `${t("nav.inventory")} — ${exportCompanyName(db.settings.companyName)}`,
            subtitle: exportSubtitle(body.length),
            columns: head,
            rows: body,
          },
        ],
      });
    }
  };

  const exportarCatalogo = async (format: "pdf" | "excel" | "csv") => {
    const base = getProductRows(db)
      .filter((row) => row.product.isActive)
      .filter((row) => (catalogCat ? row.product.categoria === catalogCat : true))
      .sort((a, b) => a.product.name.localeCompare(b.product.name));

    if (base.length === 0) {
      toast.error(t("export.noData"));
      return;
    }

    const products = base.map((row) => {
      const productType = db.productTypes.find((type) => type.key === row.product.categoria);
      const standardFeatures = getProductTechnicalSpecFieldsForCategory(row.product.categoria)
        .flatMap((field) => {
          const value = row.product.technicalSpecs?.[field.key]?.trim();
          return value ? [{ label: t(field.labelKey), value }] : [];
        });
      const customFeatures = (row.product.technicalSpecs?.customFields ?? [])
        .filter((field) => Boolean(field.name.trim() && field.value.trim()))
        .map((field) => ({ label: field.name.trim(), value: field.value.trim() }));

      return {
        name: row.product.name,
        sku: row.product.sku,
        brand: row.brand?.name ?? "",
        category: [
          productType ? etiquetaTipoProducto(t, productType) : "",
          row.category?.name ?? "",
        ].filter(Boolean).join(" / "),
        description: row.product.description?.trim() ?? "",
        imageUrl: row.product.imageUrl ?? "",
        price: formatCurrency(row.product.price),
        stock: row.stock.enInventario,
        features: [...standardFeatures, ...customFeatures],
      };
    });

    const labels = {
      product: t("export.producto"),
      reference: t("product.sku"),
      brand: t("export.marca"),
      category: t("export.categoria"),
      description: t("product.description"),
      features: t("product.technicalDetails"),
      price: t("product.price"),
      stock: t("product.enInventario"),
      image: t("catalog.image"),
      imageUrl: t("catalog.imageUrl"),
      openImage: t("catalog.openImage"),
      noDescription: t("catalog.descriptionPending"),
      noFeatures: t("catalog.featuresPending"),
      imageUnavailable: t("catalog.imageUnavailable"),
      moreFeatures: (count: number) => t("catalog.moreFeatures", { count }),
    };
    const companyName = exportCompanyName(db.settings.companyName);
    const options = {
      title: format === "pdf" ? t("catalog.title") : `${t("catalog.title")} — ${companyName}`,
      subtitle: exportSubtitle(products.length),
      filename: `catalogo-nexora-${todayIso()}.${format === "pdf" ? "pdf" : format === "csv" ? "csv" : "xlsx"}`,
      products,
      includePrice: catalogIncludePrice,
      includeStock: catalogIncludeStock,
      labels,
      onProgress: setCatalogExportProgress,
    };

    if (format === "csv") {
      try {
        const columns = [
          labels.product,
          labels.reference,
          labels.brand,
          labels.category,
          labels.description,
          labels.features,
          labels.imageUrl,
          ...(catalogIncludePrice ? [labels.price] : []),
          ...(catalogIncludeStock ? [labels.stock] : []),
        ];
        const rows = products.map((product) => [
          product.name,
          product.sku,
          product.brand ?? "",
          product.category ?? "",
          product.description ?? "",
          (product.features ?? []).map((feature) => `${feature.label}: ${feature.value}`).join(" | "),
          product.imageUrl ?? "",
          ...(catalogIncludePrice ? [product.price ?? ""] : []),
          ...(catalogIncludeStock ? [product.stock ?? 0] : []),
        ]);
        descargarCsv(options.filename, [columns, ...rows]);
        toast.success(t("catalog.exportSuccess"));
      } catch {
        toast.error(t("catalog.exportFailed"));
      }
      return;
    }

    setCatalogExportProgress({ phase: "preparing", completed: 0, total: products.length, percent: 3 });
    try {
      if (format === "pdf") {
        await exportProductCatalogPdf(options);
      } else {
        await exportProductCatalogExcel(options);
      }
      toast.success(t("catalog.exportSuccess"));
      await new Promise<void>((resolve) => window.setTimeout(resolve, 850));
    } catch (error) {
      const message = error instanceof Error && error.message === "CATALOG_IMAGES_UNAVAILABLE"
        ? t("catalog.imagesLoadFailed")
        : t("catalog.exportFailed");
      toast.error(message);
    } finally {
      setCatalogExportProgress(null);
    }
  };

  /** Enlace al detalle conservando todos los filtros del listado. */
  const detalleUrl = (productId: string) => {
    const query = params.toString();
    return query ? `/inventario/${productId}?${query}` : `/inventario/${productId}`;
  };

  const renderCard = (row: ProductRow) => (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <ProductThumbnail
          product={row.product}
          brandName={row.brand?.name}
          categoryName={row.category?.name}
          technicalEnabled={supportsTechnicalSpecs(row.product)}
          size="md"
        />
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
        <span className="font-tabular text-sm font-medium">
          {t("product.availableOf", {
            available: row.stock.disponible,
            total: row.stock.enInventario,
          })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2" aria-label={t("product.pricing")}>
        <div className="min-w-0 rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
          <p className="text-[11px] font-semibold text-muted-foreground">{t("product.costPrice")}</p>
          <p className="font-tabular mt-1 break-words text-sm font-semibold text-foreground">
            {formatCurrency(row.product.cost)}
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2">
          <p className="text-[11px] font-semibold text-muted-foreground">{t("product.salePrice")}</p>
          <p className="font-tabular mt-1 break-words text-sm font-bold text-foreground">
            {row.product.price > 0 ? formatCurrency(row.product.price) : t("product.noPrice")}
          </p>
        </div>
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
            <ProductImportDialog
              trigger={
                <Button variant="outline">
                  <FileUp />
                  {t("productImport.openButton")}
                </Button>
              }
            />
            <Button
              variant="outline"
              onClick={() => {
                setCatalogFormat("pdf");
                setCatalogExportOpen(true);
              }}
            >
              <BookOpen />
              {t("catalog.exportButton")}
            </Button>
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
          <div className="space-y-1.5">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder={t("product.searchPlaceholder")}
            />
            <p className="px-1 text-xs leading-relaxed text-muted-foreground">
              {t("product.searchHint")}
            </p>
          </div>
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
              onClick={() => setParams((previous) => clearInventoryFilters(previous), { replace: true })}
            >
              Limpiar filtros
            </Button>
            <Button
              variant={lowOnly ? "default" : "outline"}
              size="sm"
              className="h-8 rounded-full"
              onClick={() => setLowOnly(!lowOnly)}
            >
              {lowOnly ? <Check /> : null}
              {t("product.onlyLowStock")}
            </Button>
            <Button
              variant={includeInactive ? "default" : "outline"}
              size="sm"
              className="h-8 rounded-full"
              onClick={() => setIncludeInactive(!includeInactive)}
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
        rowClassName={(row) =>
          cn(
            "border-b border-border [&>td]:border-b [&>td]:border-border/80",
            !row.product.isActive && "opacity-60",
          )
        }
        columns={[
          {
            key: "product",
            header: t("product.title"),
            className: "min-w-[280px]",
            cell: (row) => (
              <div className="flex min-w-0 items-center gap-3 py-1">
                <ProductThumbnail
                  product={row.product}
                  brandName={row.brand?.name}
                  categoryName={row.category?.name}
                  technicalEnabled={supportsTechnicalSpecs(row.product)}
                />
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
            header: t("product.salePrice"),
            align: "right",
            className: "whitespace-nowrap",
            cell: (row) =>
              row.product.price > 0 ? (
                <span className="font-tabular text-sm font-semibold text-foreground">
                  {formatCurrency(row.product.price)}
                </span>
              ) : (
                <span className="text-xs italic text-muted-foreground">{t("product.noPrice")}</span>
              ),
          },
          {
            key: "cost",
            header: t("product.costPrice"),
            align: "right",
            className: "whitespace-nowrap",
            cell: (row) => (
              <span className="font-tabular rounded-lg border border-border/60 bg-muted/35 px-2 py-1 text-sm font-medium text-foreground">
                {formatCurrency(row.product.cost)}
              </span>
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

      <ExportDialog
        open={catalogExportOpen}
        onOpenChange={setCatalogExportOpen}
        title={t("catalog.title")}
        description={t("catalog.description")}
        onConfirm={() => void exportarCatalogo(catalogFormat)}
      >
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("catalog.format")}
          </Label>
          <RadioGroup
            value={catalogFormat}
            onValueChange={(value) => setCatalogFormat(value as "pdf" | "excel" | "csv")}
            className="gap-1.5"
          >
            {(
              [
                { value: "pdf", label: t("catalog.formatPdf") },
                { value: "excel", label: t("catalog.formatExcel") },
                { value: "csv", label: t("catalog.formatCsv") },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                onClick={() => setCatalogFormat(option.value)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                  catalogFormat === option.value
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
            {t("catalog.category")}
          </Label>
          <OptionSelect
            value={catalogCat}
            onChange={setCatalogCat}
            emptyLabel={t("catalog.allCategories")}
            options={tiposProductoOrdenados(db).map((type) => ({
              value: type.key,
              label: etiquetaTipoProducto(t, type),
            }))}
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
          <Label htmlFor="catalog-include-price" className="cursor-pointer">
            {t("catalog.includePrice")}
          </Label>
          <Switch
            id="catalog-include-price"
            checked={catalogIncludePrice}
            onCheckedChange={setCatalogIncludePrice}
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
          <Label htmlFor="catalog-include-stock" className="cursor-pointer">
            {t("catalog.includeStock")}
          </Label>
          <Switch
            id="catalog-include-stock"
            checked={catalogIncludeStock}
            onCheckedChange={setCatalogIncludeStock}
          />
        </div>
      </ExportDialog>

      <Dialog
        open={catalogExportProgress !== null}
        onOpenChange={(open) => {
          if (!open && catalogExportProgress?.phase === "complete") setCatalogExportProgress(null);
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onEscapeKeyDown={(event) => {
            if (catalogExportProgress?.phase !== "complete") event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (catalogExportProgress?.phase !== "complete") event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Generando catálogo</DialogTitle>
            <DialogDescription>
              Estamos preparando las referencias y sus imágenes. Puedes seguir aquí el avance de la exportación.
            </DialogDescription>
          </DialogHeader>
          {catalogExportProgress ? (
            <div className="space-y-4 py-2" role="status" aria-live="polite">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {catalogExportProgress.phase === "preparing" ? "Preparando catálogo…" :
                    catalogExportProgress.phase === "images" ? "Cargando imágenes…" :
                      catalogExportProgress.phase === "rendering" ? "Construyendo el documento…" :
                        catalogExportProgress.phase === "saving" ? "Preparando la descarga…" : "Catálogo listo"}
                </span>
                <span className="font-tabular text-sm font-semibold text-primary">{catalogExportProgress.percent}%</span>
              </div>
              <Progress value={catalogExportProgress.percent} className="h-2.5" />
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  {catalogExportProgress.phase === "images"
                    ? `${catalogExportProgress.completed} de ${catalogExportProgress.total} referencias procesadas`
                    : catalogExportProgress.phase === "rendering"
                      ? `${catalogExportProgress.completed} de ${catalogExportProgress.total} fichas generadas`
                      : catalogExportProgress.phase === "complete"
                        ? "Descarga iniciada correctamente"
                        : "No cierres esta ventana mientras se prepara el archivo."}
                </span>
                <span className="shrink-0 tabular-nums">{catalogExportProgress.total} productos</span>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inventario;
