import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity, ArrowLeft, ArrowRight, BatteryCharging, Bluetooth, Boxes,
  Camera, Cpu, Droplets, FileText, Fingerprint, HardDrive,
  Image as ImageIcon, Keyboard, MapPin, Mic, Monitor, Package, PackageCheck,
  Palette, PencilLine, Plug, RefreshCw, Ruler, Search, Settings2, Smartphone,
  Volume2, Wifi, ZoomIn, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ProductThumbnail, getProductReferenceImageFallback } from "@/components/shared/product-thumbnail";
import { swatchForVariant } from "@/lib/product-color-photos";
import { getProductTechnicalSpecFieldsForCategory } from "@/lib/product-specs";
import type { ProductTechnicalSpecKey } from "@/lib/types";
import "./inventory-product-zoom.css";
import "./worker-inventory-table.css";
import { catalogCoverPhoto, type CatalogMedia } from "@/lib/nexora-worker-catalog-media";
import { fetchReferenceStock, type ReferenceStockResult, type ReferenceStockRow } from "@/lib/nexora-reference-stock";
import {
  CUSTODY_LABEL, fetchImeiDirectory, type ImeiDirectoryResponse, type ImeiDirectoryRow,
} from "@/lib/nexora-imei-directory";

const number = (value: number): string => new Intl.NumberFormat("es-CO").format(value);

/** El mismo visor técnico premium que utiliza el inventario administrativo.
 * Los datos provienen de las referencias guardadas: nunca se generan especificaciones.
 */
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

const CatalogPhoto = ({
  name, sku, media, stock, unit, small = false,
}: {
  name: string; sku: string; media: CatalogMedia;
  stock?: ReferenceStockRow; unit?: ImeiDirectoryRow; small?: boolean;
}) => {
  const { t } = useTranslation();
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [variantFailed, setVariantFailed] = useState(false);
  const base = catalogCoverPhoto(media) ?? getProductReferenceImageFallback(name);
  const variant = media.colorVariants.find((item) => item.color === selectedColor);
  const selected = variant?.imageUrl && !variantFailed ? variant.imageUrl : base;
  const image = selected === failed ? base : selected;
  const thumbnail = small ? "h-[72px] w-[72px]" : "h-[96px] w-[96px]";
  const fields = getProductTechnicalSpecFieldsForCategory(media.categoryKey ?? undefined);
  const populatedFields = fields.filter((field) => Boolean(media.technicalSpecs?.[field.key]?.trim()));
  const custom = !["celular", "tablet", "reloj", "audifono"].includes(media.categoryKey ?? "")
    ? (media.technicalSpecs?.customFields ?? []).filter((field) => Boolean(field.name && field.value))
    : [];
  const count = populatedFields.length + custom.length;

  return <Dialog onOpenChange={(open) => {
    if (!open) { setSelectedColor(null); setFailed(null); setVariantFailed(false); }
  }}>
    <DialogTrigger asChild>
      <button type="button"
        aria-label={`Ampliar imagen y especificaciones de ${name}`}
        className={`group relative grid ${thumbnail} shrink-0 cursor-zoom-in place-items-center overflow-hidden rounded-2xl border border-border/80 bg-background shadow-sm transition-all hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>
        <Smartphone className="size-7 text-sky-700/50 dark:text-sky-200/50" aria-hidden="true"/>
        {base ? <ProductThumbnail src={base} alt={name} size={small ? "xl" : "2xl"}
          className="absolute inset-0 z-10 h-full w-full rounded-2xl border-0 bg-transparent object-contain p-1.5"/> : null}
        <span className="absolute bottom-1 right-1 z-20 rounded-md bg-background/95 p-1 text-foreground opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <ZoomIn className="size-3.5" aria-hidden="true"/>
        </span>
      </button>
    </DialogTrigger>
    <DialogContent className="nx-inventory-zoom">
      <DialogHeader className="nx-inventory-zoom-header">
        <div className="nx-inventory-zoom-heading">
          <span className="nx-inventory-zoom-mark" aria-hidden="true"><ZoomIn className="h-6 w-6" strokeWidth={1.9}/></span>
          <div className="nx-inventory-zoom-heading-text">
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription className="nx-inventory-zoom-subtitle">
              {sku} · {t("product.imageZoomHint")}
            </DialogDescription>
          </div>
        </div>
        <div className="nx-inventory-zoom-meta" aria-label="Información del producto">
          <span className="nx-inventory-zoom-pill font-tabular">{sku}</span>
        </div>
      </DialogHeader>
      <div className="nx-inventory-zoom-body">
        <section className="nx-inventory-zoom-media" aria-label={t("product.imagePreviewAlt")}>
          <div className="nx-inventory-zoom-media-title">
            <span>Vista del producto</span>
            <span className="nx-inventory-zoom-original"><ImageIcon className="h-3.5 w-3.5" aria-hidden="true"/> Imagen original</span>
          </div>
          <div className="nx-inventory-zoom-stage">
            {image ? <img key={image} src={image}
              alt={variant && selected !== base ? `${name} · ${variant.color}` : name}
              className="nx-inventory-zoom-photo" decoding="async"
              onError={() => {
                if (variant && selected !== base) setVariantFailed(true);
                else setFailed(image);
              }}
            /> : <div className="grid h-full place-items-center text-sm text-muted-foreground">
              <div className="flex flex-col items-center gap-2"><ImageIcon className="size-10"/> Sin fotografía registrada</div>
            </div>}
          </div>
          {media.colorVariants.length ? <div className="nx-inventory-zoom-colors" aria-label="Selecciona el color del producto">
            <div className="nx-inventory-zoom-colors-copy">
              <span>Colores disponibles</span>
              <p>{variant?.color ?? "Vista principal"} · {variant ? (variant.imageUrl ? "Foto del color" : "Se muestra la foto principal") : "Imagen original"}</p>
            </div>
            <div className="nx-inventory-zoom-swatches">
              <button type="button" aria-label="Mostrar imagen principal" title="Imagen principal"
                aria-pressed={!selectedColor} className="nx-inventory-zoom-default-swatch"
                onClick={() => { setSelectedColor(null); setVariantFailed(false); }}>
                <ImageIcon className="h-4 w-4"/>
              </button>
              {media.colorVariants.map((color) => <button key={color.color} type="button"
                aria-label={`Mostrar color ${color.color}`} title={color.color}
                aria-pressed={color.color === selectedColor}
                className="nx-inventory-zoom-swatch"
                onClick={() => { setSelectedColor(color.color); setVariantFailed(false); }}>
                <span style={{ backgroundColor: swatchForVariant({
                  color: color.color, swatchHex: color.swatchHex ?? undefined,
                }) }}/>
              </button>)}
            </div>
          </div> : null}
          <p className="nx-inventory-zoom-image-hint">
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true"/> {t("product.imageZoomHint")}
          </p>
        </section>
        <div className="nx-inventory-zoom-info">
          <section className="nx-inventory-zoom-specs">
            <div className="nx-inventory-zoom-section-header">
              <span className="nx-inventory-zoom-section-icon" aria-hidden="true"><Settings2 className="h-5 w-5" strokeWidth={1.9}/></span>
              <div className="nx-inventory-zoom-section-copy">
                <h3>{t("product.technicalDetails")}</h3>
                <p>{t("product.technicalSpecsSubtitle")}</p>
              </div>
              <span className="nx-inventory-zoom-count font-tabular" aria-label={`${count} características`}>
                {count} <span>especificaciones</span>
              </span>
            </div>
            {count ? <div className="nx-inventory-zoom-spec-grid">
              {populatedFields.map((field) => {
                const SpecIcon = TECHNICAL_SPEC_ICONS[field.key];
                return <div key={field.key} className="nx-inventory-zoom-spec-card">
                  <span className="nx-inventory-zoom-spec-icon" aria-hidden="true"><SpecIcon className="h-4 w-4" strokeWidth={1.9}/></span>
                  <div className="nx-inventory-zoom-spec-copy">
                    <p className="nx-inventory-zoom-spec-label">{t(field.labelKey)}</p>
                    <p className="nx-inventory-zoom-spec-value">{media.technicalSpecs?.[field.key]}</p>
                  </div>
                </div>;
              })}
              {custom.map((field) => <div key={field.id} className="nx-inventory-zoom-spec-card">
                <span className="nx-inventory-zoom-spec-icon" aria-hidden="true"><Package className="h-4 w-4" strokeWidth={1.9}/></span>
                <div className="nx-inventory-zoom-spec-copy">
                  <p className="nx-inventory-zoom-spec-label">{field.name}</p>
                  <p className="nx-inventory-zoom-spec-value">{field.value}</p>
                </div>
              </div>)}
            </div> : <div className="nx-inventory-zoom-no-specs">{t("product.technicalSpecsEmpty")}</div>}
          </section>
          <section className="nx-inventory-zoom-description">
            <div className="nx-inventory-zoom-description-heading">
              <span className="nx-inventory-zoom-section-icon" aria-hidden="true"><FileText className="h-5 w-5" strokeWidth={1.9}/></span>
              <div><h3>{t("product.description")}</h3>
                <p className="whitespace-pre-wrap break-words">{media.description?.trim() || t("product.descriptionEmpty")}</p>
              </div>
            </div>
          </section>
          {stock ? <section className="space-y-3 rounded-2xl border border-border/80 bg-muted/15 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary"/> Inventario de Bodega 6A</h3>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-lg border bg-background p-3"><strong className="block text-lg tabular-nums">{number(stock.total)}</strong><span className="text-xs text-muted-foreground">IMEI registrados</span></div>
              <div className="rounded-lg border bg-background p-3"><strong className="block text-lg tabular-nums">{number(stock.physicallyVerified)}</strong><span className="text-xs text-muted-foreground">Verificados</span></div>
              <div className="rounded-lg border bg-background p-3"><strong className="block text-lg tabular-nums">{number(stock.committedOrders)}</strong><span className="text-xs text-muted-foreground">Asignados a pedidos</span></div>
              <div className="rounded-lg border bg-background p-3"><strong className="block text-lg tabular-nums">{number(stock.unverified)}</strong><span className="text-xs text-muted-foreground">Pendientes</span></div>
            </div>
            {stock.sold>0 ? <p className="text-xs text-muted-foreground">{number(stock.sold)} salidas históricas</p> : null}
          </section> : null}
          {unit ? <section className="space-y-2 rounded-2xl border border-border/80 bg-muted/15 p-4 text-sm">
            <h3 className="flex items-center gap-2 font-semibold"><Fingerprint className="h-4 w-4 text-primary"/> Identificación del equipo</h3>
            <p className="break-all"><span className="text-muted-foreground">IMEI:</span> <strong className="font-mono">{unit.serial}</strong></p>
            <p><span className="text-muted-foreground">Estado físico:</span> {CUSTODY_LABEL[unit.custodyState]}</p>
            <p><span className="text-muted-foreground">Ubicación:</span> {unit.custodyState==="en_sede" ? "Bodega 6A" : unit.historicalLocation ?? "Pendiente de verificar"}</p>
            <p><span className="text-muted-foreground">Pedido:</span> {unit.committedOrder ? "Asignado a un pedido" : "Sin pedido activo"}</p>
          </section> : null}

        </div>
      </div>
    </DialogContent>
  </Dialog>;
};

/** Tabla consolidada por referencia: sin precios ni desglose multisede. */
const ReferenceTable = ({ items }: { items: ReferenceStockRow[] }) =>
  <section aria-label="Existencias por referencia en Bodega 6A"
    className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left">Referencia</th>
            <th className="px-4 py-3 text-right">IMEI registrados</th>
            <th className="px-4 py-3 text-right">En Bodega 6A</th>
            <th className="px-4 py-3 text-right">Asignados a pedidos</th>
            <th className="px-4 py-3 text-right">Sin conciliar</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item=><tr key={item.productId} className="border-t">
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <CatalogPhoto name={item.name} sku={item.sku} media={item} stock={item} small/>
                <div><p className="font-semibold">{item.name}</p><p className="font-mono text-xs text-muted-foreground">{item.sku}</p></div>
              </div>
            </td>
            <td className="px-4 py-3 text-right tabular-nums">{number(item.total)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{number(item.physicallyVerified)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{number(item.committedOrders)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{number(item.unverified)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;

/** Tabla de consulta individual con el vínculo de cada serial a Pedidos. */
const ImeiTable = ({ items }: { items: ImeiDirectoryRow[] }) =>
  <section aria-label="Control individual de seriales"
    className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left">Referencia / IMEI</th>
            <th className="px-4 py-3 text-left">Ubicación</th>
            <th className="px-4 py-3 text-left">Estado físico</th>
            <th className="px-4 py-3 text-left">Pedido</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item=><tr key={item.unitId} className="border-t">
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <CatalogPhoto name={item.productName} sku={item.sku} media={item} unit={item} small/>
                <div><p className="font-semibold">{item.productName}</p><p className="mt-1 break-all font-mono text-xs">{item.serial}</p><p className="text-xs text-muted-foreground">{item.sku}</p></div>
              </div>
            </td>
            <td className="px-4 py-3 text-sm text-muted-foreground">
              {item.custodyState==="en_sede" ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-4"/>Bodega 6A</span> : item.historicalLocation ?? "Pendiente de verificar"}
            </td>
            <td className="px-4 py-3"><span className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium">{CUSTODY_LABEL[item.custodyState]}</span></td>
            <td className="px-4 py-3 text-xs">{item.committedOrder ? "Asignado a un pedido" : "Sin pedido activo"}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;

export const WorkerGlobalInventory = ({ serials = false }: { serials?: boolean }) => {
  const [kind, setKind] = useState<"imei" | "ref">(serials ? "imei" : "ref");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [reference, setReference] = useState<ReferenceStockResult | null>(null);
  const [imei, setImei] = useState<ImeiDirectoryResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => { setKind(serials ? "imei" : "ref"); setPage(1); }, [serials]);
  useEffect(() => {
    const current = ++seq.current;
    setLoading(true); setError("");
    const task = kind === "imei"
      ? fetchImeiDirectory({ query, page, pageSize: 25 })
      : fetchReferenceStock({ query, page, pageSize: 20 });
    void task.then((value) => {
      if (current !== seq.current) return;
      if (kind === "imei") setImei(value as ImeiDirectoryResponse);
      else setReference(value as ReferenceStockResult);
    }).catch((reason: unknown) => {
      if (current === seq.current)
        setError(reason instanceof Error ? reason.message : "No se pudo consultar el inventario.");
    }).finally(() => { if (current === seq.current) setLoading(false); });
    return () => { seq.current++; };
  }, [kind, query, page, reload]);

  const total = kind === "imei" ? imei?.matched ?? 0 : reference?.matched ?? 0;
  const perPage = kind === "imei" ? 25 : 20;
  const pages = Math.max(1, Math.ceil(total / perPage));

  return <main className="space-y-5">
    <header className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventario global</h1>
        <p className="mt-1 text-sm text-muted-foreground">Fotografías, especificaciones y control de existencias de la bodega principal. Los IMEI asignados a pedidos se identifican por separado.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="rounded-full" variant={kind === "ref" ? "default" : "outline"}
          onClick={() => { setKind("ref"); setPage(1); }}><Boxes className="size-4"/> Referencias</Button>
        <Button className="rounded-full" variant={kind === "imei" ? "default" : "outline"}
          onClick={() => { setKind("imei"); setPage(1); }}><Fingerprint className="size-4"/> Seriales / IMEI</Button>
      </div>
    </header>
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"/>
        <Input aria-label="Buscar referencia o IMEI" className="pl-9" value={query} maxLength={100}
          placeholder="Buscar modelo, SKU o IMEI"
          onChange={(event) => { setQuery(event.target.value); setPage(1); }}/>
      </div>
      <Button variant="outline" onClick={() => setReload((value) => value + 1)} disabled={loading}>
        <RefreshCw className="size-4"/> Actualizar
      </Button>
    </div>
    {error ? <p role="alert" className="rounded-xl border border-destructive p-4 text-sm">{error}</p> : null}
    {loading ? <p role="status" className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
      Consultando inventario de Bodega 6A...
    </p> : null}
    {!loading && total === 0 && !error ? <div className="rounded-2xl border bg-card p-8 text-center">
      <PackageCheck className="mx-auto size-10 text-muted-foreground"/>
      <p className="mt-2 font-semibold">No se encontraron equipos.</p>
      <p className="mt-1 text-sm text-muted-foreground">Revisa el nombre del modelo, el IMEI o la referencia buscada.</p>
    </div> : null}
    {kind === "ref" ? <p className="text-xs text-muted-foreground">La consulta distingue los seriales verificados en Bodega 6A, los pendientes de conciliación y los asignados a pedidos.</p> : null}
    {kind === "ref" && reference?.items.length ? <ReferenceTable items={reference.items}/> : null}
    {kind === "imei" && imei?.items.length ? <ImeiTable items={imei.items}/> : null}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
      <p className="text-muted-foreground">
        {number(total)} {kind === "ref" ? "referencias de equipos" : "seriales / IMEI"} · página {page} de {pages}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={loading || page <= 1}
          onClick={() => setPage((n) => Math.max(1, n - 1))}><ArrowLeft className="size-4"/> Anterior</Button>
        <Button size="sm" variant="outline" disabled={loading || page >= pages}
          onClick={() => setPage((n) => n + 1)}>Siguiente <ArrowRight className="size-4"/></Button>
      </div>
    </div>
  </main>;
};
