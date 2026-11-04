import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Boxes, Fingerprint, History, ImageIcon,
  MapPin, PackageCheck, RefreshCw, Search, Smartphone, ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ProductThumbnail, getProductReferenceImageFallback } from "@/components/shared/product-thumbnail";
import { swatchForVariant } from "@/lib/product-color-photos";
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

/** Usa únicamente la fotografía guardada en el catálogo de Nexora. */
const CatalogPhoto = ({
  name, sku, media, small = false,
}: {
  name: string; sku: string; media: CatalogMedia; small?: boolean;
}) => {
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const base = catalogCoverPhoto(media) ?? getProductReferenceImageFallback(name);
  const variant = media.colorVariants.find((item) => item.color === selectedColor);
  const selected = variant?.imageUrl ?? base;
  const source = selected === failed ? base : selected;
  const size = small ? "h-12 w-12" : "h-[90px] w-[90px]";

  return <Dialog onOpenChange={(open) => { if (!open) { setSelectedColor(null); setFailed(null); } }}>
    <DialogTrigger asChild>
      <button type="button"
        aria-label={`Ver fotografía de ${name}`}
        className={`group relative grid ${size} shrink-0 place-items-center overflow-hidden rounded-2xl border bg-gradient-to-br from-sky-50 via-white to-blue-50 shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:from-slate-800 dark:via-card dark:to-slate-900`}>
        <Smartphone className="size-8 text-sky-700/50 dark:text-sky-200/50" aria-hidden="true"/>
        {base ? <ProductThumbnail
          src={base} alt={name} size={small ? "lg" : "2xl"}
          className="absolute inset-0 z-10 h-full w-full rounded-2xl border-0 bg-transparent object-contain p-2"
        /> : null}
        {base ? <span className="absolute bottom-1 right-1 z-20 rounded-md bg-background/90 p-1 text-foreground opacity-0 shadow-sm transition group-hover:opacity-100">
          <ZoomIn className="size-3.5" aria-hidden="true"/>
        </span> : null}
      </button>
    </DialogTrigger>
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{name}</DialogTitle>
        <DialogDescription>{sku} · Fotografías de la referencia registradas en Nexora.</DialogDescription>
      </DialogHeader>
      <div className="grid min-h-[250px] place-items-center rounded-xl border bg-gradient-to-br from-slate-50 to-sky-50 p-6 dark:from-slate-900 dark:to-slate-800">
        {source ? <img
          key={source} src={source} alt={selectedColor ? `${name} · ${selectedColor}` : name}
          loading="lazy" onError={() => setFailed(source)}
          className="max-h-[360px] max-w-full object-contain"
        /> : <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <ImageIcon className="size-10"/><span>La referencia no tiene fotografía disponible.</span>
        </div>}
      </div>
      {media.colorVariants.length > 0 ? <div className="space-y-2">
        <p className="text-sm font-semibold">Fotografías por color</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={!selectedColor ? "default" : "outline"}
            onClick={() => { setSelectedColor(null); setFailed(null); }}>Principal</Button>
          {media.colorVariants.map((color) => <button key={color.color} type="button"
            aria-pressed={selectedColor === color.color}
            onClick={() => { setSelectedColor(color.color); setFailed(null); }}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition hover:border-primary ${selectedColor === color.color ? "border-primary bg-primary/10" : "border-border"}`}>
            <span aria-hidden="true" className="size-4 rounded-full border"
              style={{ backgroundColor: swatchForVariant({
                color: color.color, swatchHex: color.swatchHex ?? undefined,
              }) }}/>
            {color.color}{color.imageUrl ? "" : " · foto principal"}
          </button>)}
        </div>
      </div> : null}
      <p className="text-xs text-muted-foreground">
        La fotografía es una referencia visual; el estado, color y costo real se verifican por IMEI.
      </p>
    </DialogContent>
  </Dialog>;
};

const Metric = ({ label, value, tone = "" }: { label: string; value: number; tone?: string }) =>
  <div className="rounded-xl border bg-muted/15 px-3 py-2.5">
    <p className={`text-lg font-bold tabular-nums ${tone}`}>{number(value)}</p>
    <p className="text-[11px] text-muted-foreground">{label}</p>
  </div>;

const ReferenceCard = ({ item }: { item: ReferenceStockRow }) => {
  const activeSites = commercialSiteGroups(item.sites);
  return <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
    <div className="flex items-start gap-4 p-4 sm:p-5">
      <CatalogPhoto name={item.name} sku={item.sku} media={item}/>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold leading-snug tracking-tight sm:text-lg">{item.name}</h2>
        <span className="mt-1.5 inline-flex rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-xs text-muted-foreground">{item.sku}</span>
        <p className="mt-2 text-xs text-muted-foreground">Existencias por sede, sin mezclar equipos vendidos con el stock físico.</p>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:px-5">
      <Metric label="En sedes verificadas" value={item.physicallyVerified}/>
      <Metric label="Disponibles para venta" value={item.available} tone="text-emerald-700 dark:text-emerald-300"/>
      <Metric label="Histórico de vendidos" value={item.sold}/>
      <Metric label="Total histórico registrado" value={item.total}/>
    </div>
    <div className="space-y-2 border-t bg-muted/10 px-4 py-3 sm:px-5">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <MapPin className="size-3.5"/> Distribución física
      </p>
      {activeSites.map((site) => <div key={site.siteId}
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
        <div className="min-w-0">
          <p className="font-medium">{site.siteName}</p>
          {site.cityName ? <p className="text-xs text-muted-foreground">{site.cityName}</p> : null}
        </div>
        <span className="text-xs tabular-nums">
          <strong>{number(site.physicallyVerified)}</strong> en sede · <strong className="text-emerald-700 dark:text-emerald-300">{number(site.available)}</strong> disponibles
        </span>
      </div>)}
      {activeSites.length === 0 ? <p className="text-xs text-muted-foreground">Sin unidades físicas verificadas en sedes.</p> : null}
      {item.unverified > 0 ? <p className="text-xs text-amber-700 dark:text-amber-300">
        {number(item.unverified)} unidades pendientes de conciliación; no están disponibles para vender.
      </p> : null}
      {item.inTransit || item.pendingReturn ? <p className="text-xs text-muted-foreground">
        {number(item.inTransit)} en tránsito · {number(item.pendingReturn)} con retorno pendiente
      </p> : null}
    </div>
  </article>;
};

const ImeiCard = ({ item }: { item: ImeiDirectoryRow }) =>
  <article className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm">
    <CatalogPhoto name={item.productName} sku={item.sku} media={item} small/>
    <div className="min-w-0 flex-1 space-y-1.5">
      <p className="text-sm font-semibold">{item.productName}</p>
      <p className="break-all font-mono text-xs font-semibold text-primary">{item.serial}</p>
      <p className="text-xs text-muted-foreground">{item.sku}</p>
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs">
          {item.custodyState === "vendido" ? <History className="size-3"/> : <MapPin className="size-3"/>}
          {item.custodyState === "vendido"
            ? "Vendido · historial"
            : item.siteName ? `${item.siteName}${item.cityName ? " · " + item.cityName : ""}` : "Sin sede verificada"}
        </span>
        <span className="inline-flex rounded-md border px-2 py-0.5 text-xs">{CUSTODY_LABEL[item.custodyState]}</span>
        {item.commercialCandidate ? <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <BadgeCheck className="size-3"/> Disponible
        </span> : null}
      </div>
      <p className="text-xs font-medium">{money(item.cost)} <span className="font-normal text-muted-foreground">· costo individual</span></p>
    </div>
  </article>;

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
    <header className="rounded-2xl border bg-gradient-to-r from-sky-50 via-card to-cyan-50 p-5 shadow-sm dark:from-slate-900 dark:via-card dark:to-slate-800 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Smartphone className="size-6"/>
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventario global de equipos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulta celulares y tecnología por referencia o IMEI, con fotografías, costos individuales y existencias por sede.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Los repuestos se administran exclusivamente desde la sede principal.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
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
    {kind === "ref" && total > 0 ? <section aria-label="Catálogo de referencias"
      className="grid gap-4 lg:grid-cols-2">
      {reference?.items.map((item) => <ReferenceCard key={item.productId} item={item}/>)}
    </section> : null}
    {kind === "imei" && total > 0 ? <section aria-label="Equipos individuales por IMEI"
      className="grid gap-3 lg:grid-cols-2">
      {imei?.items.map((item) => <ImeiCard key={item.unitId} item={item}/>)}
    </section> : null}
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
