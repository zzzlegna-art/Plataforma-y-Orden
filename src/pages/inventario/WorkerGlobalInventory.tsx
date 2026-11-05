import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, BatteryCharging, Bluetooth, Boxes,
  Camera, Cpu, Droplets, FileText, Fingerprint, HardDrive, History,
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
import {
  catalogCoverPhoto, commercialSiteGroups, type CatalogMedia,
} from "@/lib/nexora-worker-catalog-media";
import { fetchReferenceStock, type ReferenceStockResult, type ReferenceStockRow } from "@/lib/nexora-reference-stock";
import {
  CUSTODY_LABEL, fetchImeiDirectory, type ImeiDirectoryResponse, type ImeiDirectoryRow,
} from "@/lib/nexora-imei-directory";

const number = (value: number): string => new Intl.NumberFormat("es-CO").format(value);
const money = (value: number | null): string => value === null
  ? "Costo pendiente"
  : new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0,
  }).format(value);

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
  name, sku, media, brandName, stock, unit, small = false,
}: {
  name: string; sku: string; media: CatalogMedia; brandName?: string | null;
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
          {brandName ? <span className="nx-inventory-zoom-pill">{brandName}</span> : null}
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
            <h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary"/> Existencias por sede</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border bg-background p-3">
                <strong className="block text-lg tabular-nums">{number(stock.physicallyVerified)}</strong>
                <span className="text-xs text-muted-foreground">En sedes verificadas</span>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <strong className="block text-lg tabular-nums">{number(stock.available)}</strong>
                <span className="text-xs text-muted-foreground">Disponibles para venta</span>
              </div>
            </div>
            {commercialSiteGroups(stock.sites).map(site => <div key={site.siteId}
              className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm">
              <span className="font-medium">{site.siteName}{site.cityName ? ` · ${site.cityName}` : ""}</span>
              <span className="shrink-0 text-xs tabular-nums">{number(site.physicallyVerified)} en sede · {number(site.available)} disponibles</span>
            </div>)}
            {commercialSiteGroups(stock.sites).length===0 ? <p className="text-xs text-muted-foreground">No hay unidades físicas verificadas en sedes.</p> : null}
            {stock.sold>0 || stock.unverified>0 ? <p className="text-xs text-muted-foreground">
              {number(stock.sold)} vendidos históricos · {number(stock.unverified)} sin conciliar.
            </p> : null}
            {stock.inTransit>0 || stock.pendingReturn>0 ? <p className="text-xs text-muted-foreground">
              {number(stock.inTransit)} en tránsito · {number(stock.pendingReturn)} retornos pendientes.
            </p> : null}
          </section> : null}
          {unit ? <section className="space-y-2 rounded-2xl border border-border/80 bg-muted/15 p-4 text-sm">
            <h3 className="flex items-center gap-2 font-semibold"><Fingerprint className="h-4 w-4 text-primary"/> Identificación del equipo</h3>
            <p className="break-all"><span className="text-muted-foreground">IMEI:</span> <strong className="font-mono">{unit.serial}</strong></p>
            <p><span className="text-muted-foreground">Estado:</span> {CUSTODY_LABEL[unit.custodyState]}</p>
            <p><span className="text-muted-foreground">Ubicación:</span> {unit.custodyState==="vendido" ? "Vendido · historial" : unit.siteName ?? "Sin sede verificada"}</p>
            <p><span className="text-muted-foreground">Costo individual:</span> <strong>{money(unit.cost)}</strong></p>
          </section> : null}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
};

/** La tabla conserva el aspecto y las columnas del inventario principal,
 * pero nunca ofrece edición o acceso a los repuestos desde locales. */
const ReferenceTable = ({ items }: { items: ReferenceStockRow[] }) =>
  <section aria-label="Inventario de referencias comerciales" className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[995px] text-[15px]">
        <thead className="bg-muted/40 text-[13px] font-semibold text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 text-left">Producto</th>
            <th scope="col" className="px-3 py-3 text-left">Marca</th>
            <th scope="col" className="px-3 py-3 text-left">Condición</th>
            <th scope="col" className="px-3 py-3 text-right">Precio de venta</th>
            <th scope="col" className="px-3 py-3 text-right">Costo de referencia</th>
            <th scope="col" className="px-3 py-3 text-right">Disponibles</th>
            <th scope="col" className="px-3 py-3 text-right">En sedes</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.productId} className="border-t border-border/80 transition-colors hover:bg-muted/35">
              <td className="px-4 py-4">
                <div className="flex min-w-[265px] items-center gap-4">
                  <CatalogPhoto name={item.name} sku={item.sku} media={item} brandName={item.brandName} stock={item} small/>
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-snug text-foreground">{item.name}</p>
                    <span className="mt-1.5 inline-flex rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-xs text-muted-foreground">{item.sku}</span>
                  </div>
                </div>
              </td>
              <td className="px-3 py-4 text-sm text-muted-foreground">{item.brandName ?? "—"}</td>
              <td className="px-3 py-4">
                <div className="flex min-w-[116px] flex-col items-start gap-1.5">
                  {item.newUnits > 0 ? <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 dark:border-sky-800 dark:bg-sky-500/10 dark:text-sky-200">
                    Nuevo <strong className="ml-1 tabular-nums">{number(item.newUnits)}</strong>
                  </span> : null}
                  {item.usedUnits > 0 ? <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    Seminuevo <strong className="ml-1 tabular-nums">{number(item.usedUnits)}</strong>
                  </span> : null}
                  {item.newUnits === 0 && item.usedUnits === 0 ? <span className="text-xs text-muted-foreground">—</span> : null}
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-right">
                {item.salePrice !== null && item.salePrice > 0
                  ? <span className="font-semibold tabular-nums">{money(item.salePrice)}</span>
                  : <span className="text-sm italic text-muted-foreground">Sin precio</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-right">
                {item.referenceCost !== null && item.referenceCost > 0
                  ? <span className="rounded-lg border border-border/60 bg-muted/35 px-2 py-1 text-sm font-medium tabular-nums">{money(item.referenceCost)}</span>
                  : <span className="text-sm italic text-muted-foreground">Sin costo</span>}
              </td>
              <td className="px-3 py-2.5 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {item.available > 0 && item.available < 10
                    ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Stock bajo</span>
                    : null}
                  <span className={`min-w-6 text-base font-semibold tabular-nums ${item.available === 0 ? "text-destructive" : "text-foreground"}`}>{number(item.available)}</span>
                </div>
              </td>
              <td className="px-3 py-4 text-right text-base font-medium tabular-nums text-muted-foreground">{number(item.physicallyVerified)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>;

const ImeiTable = ({ items }: { items: ImeiDirectoryRow[] }) =>
  <section aria-label="Inventario individual por IMEI" className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] text-[15px]">
        <thead className="bg-muted/40 text-[13px] font-semibold text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 text-left">Producto / IMEI</th>
            <th scope="col" className="px-3 py-3 text-left">Sede o historial</th>
            <th scope="col" className="px-3 py-3 text-left">Estado</th>
            <th scope="col" className="px-3 py-3 text-right">Costo individual</th>
            <th scope="col" className="px-3 py-3 text-right">Disponibilidad</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => <tr key={item.unitId} className="border-t border-border/80 transition-colors hover:bg-muted/35">
            <td className="px-4 py-4">
              <div className="flex min-w-[260px] items-center gap-4">
                <CatalogPhoto name={item.productName} sku={item.sku} media={item} unit={item} small/>
                <div className="min-w-0">
                  <p className="text-base font-semibold leading-snug">{item.productName}</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold text-primary">{item.serial}</p>
                  <span className="mt-0.5 inline-flex rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-sm text-muted-foreground">{item.sku}</span>
                </div>
              </div>
            </td>
            <td className="px-3 py-4 text-xs text-muted-foreground">
              {item.custodyState === "vendido" ? <span className="flex items-center gap-1"><History className="size-3.5"/> Vendido · historial</span> :
                item.siteName ? <span className="flex items-center gap-1"><MapPin className="size-3.5"/>{item.siteName}</span> : "Sin sede verificada"}
            </td>
            <td className="px-3 py-4"><span className="rounded-full border bg-muted/50 px-2 py-1 text-sm">{CUSTODY_LABEL[item.custodyState]}</span></td>
            <td className="whitespace-nowrap px-3 py-4 text-right font-medium tabular-nums">{money(item.cost)}</td>
            <td className="px-3 py-4 text-right">
              {item.commercialCandidate ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"><BadgeCheck className="size-3.5"/> Disponible</span> : <span className="text-xs text-muted-foreground">No disponible</span>}
            </td>
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
        <p className="mt-1 text-sm text-muted-foreground">Fotografías ampliables, especificaciones y existencias por sede. Pulsa la imagen del equipo para ver su ficha.</p>
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
        <Input aria-label="Buscar referencia, IMEI o sede" className="pl-9" value={query} maxLength={100}
          placeholder="Buscar modelo, SKU, IMEI o sede"
          onChange={(event) => { setQuery(event.target.value); setPage(1); }}/>
      </div>
      <Button variant="outline" onClick={() => setReload((value) => value + 1)} disabled={loading}>
        <RefreshCw className="size-4"/> Actualizar
      </Button>
    </div>
    {error ? <p role="alert" className="rounded-xl border border-destructive p-4 text-sm">{error}</p> : null}
    {loading ? <p role="status" className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
      Consultando equipos por sede...
    </p> : null}
    {!loading && total === 0 && !error ? <div className="rounded-2xl border bg-card p-8 text-center">
      <PackageCheck className="mx-auto size-10 text-muted-foreground"/>
      <p className="mt-2 font-semibold">No se encontraron equipos.</p>
      <p className="mt-1 text-sm text-muted-foreground">Revisa el nombre del modelo, el IMEI o la referencia buscada.</p>
    </div> : null}
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
