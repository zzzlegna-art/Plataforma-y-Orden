import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Boxes, Eye, Fingerprint, History, ImageIcon,
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


/** La tabla conserva el aspecto y las columnas del inventario principal,
 * pero nunca ofrece edición o acceso a los repuestos desde locales. */
const ReferenceTable = ({ items }: { items: ReferenceStockRow[] }) =>
  <section aria-label="Inventario de referencias comerciales" className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] text-sm">
        <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 text-left">Producto</th>
            <th scope="col" className="px-3 py-3 text-left">Marca</th>
            <th scope="col" className="px-3 py-3 text-left">Condición</th>
            <th scope="col" className="px-3 py-3 text-right">Precio de venta</th>
            <th scope="col" className="px-3 py-3 text-right">Costo de referencia</th>
            <th scope="col" className="px-3 py-3 text-right">Disponibles</th>
            <th scope="col" className="px-3 py-3 text-right">En sedes</th>
            <th scope="col" className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.productId} className="border-t border-border/80 transition-colors hover:bg-muted/35">
              <td className="px-4 py-2.5">
                <div className="flex min-w-[220px] items-center gap-3">
                  <CatalogPhoto name={item.name} sku={item.sku} media={item} small/>
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug text-foreground">{item.name}</p>
                    <span className="mt-1 inline-flex rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{item.sku}</span>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.brandName ?? "—"}</td>
              <td className="px-3 py-2.5">
                <div className="flex min-w-[110px] flex-col items-start gap-1">
                  {item.newUnits > 0 ? <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:border-sky-800 dark:bg-sky-500/10 dark:text-sky-200">
                    Nuevo <strong className="ml-1 tabular-nums">{number(item.newUnits)}</strong>
                  </span> : null}
                  {item.usedUnits > 0 ? <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    Seminuevo <strong className="ml-1 tabular-nums">{number(item.usedUnits)}</strong>
                  </span> : null}
                  {item.newUnits === 0 && item.usedUnits === 0 ? <span className="text-xs text-muted-foreground">—</span> : null}
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                {item.salePrice !== null && item.salePrice > 0
                  ? <span className="font-semibold tabular-nums">{money(item.salePrice)}</span>
                  : <span className="text-xs italic text-muted-foreground">Sin precio</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                {item.referenceCost !== null && item.referenceCost > 0
                  ? <span className="rounded-lg border border-border/60 bg-muted/35 px-2 py-1 text-xs font-medium tabular-nums">{money(item.referenceCost)}</span>
                  : <span className="text-xs italic text-muted-foreground">Sin costo</span>}
              </td>
              <td className="px-3 py-2.5 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {item.available > 0 && item.available < 10
                    ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Stock bajo</span>
                    : null}
                  <span className={`min-w-6 font-semibold tabular-nums ${item.available === 0 ? "text-destructive" : "text-foreground"}`}>{number(item.available)}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{number(item.physicallyVerified)}</td>
              <td className="px-4 py-2.5 text-right">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 rounded-full">
                      <Eye className="size-4"/> Ver
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{item.name}</DialogTitle>
                      <DialogDescription>{item.sku} · Resumen de unidades reales y ubicación por sede.</DialogDescription>
                    </DialogHeader>
                    <div className="flex items-start gap-4 rounded-xl border bg-muted/15 p-3">
                      <CatalogPhoto name={item.name} sku={item.sku} media={item}/>
                      <div className="space-y-1 text-sm">
                        <p className="font-semibold">{item.brandName ?? "Referencia comercial"}</p>
                        <p className="text-muted-foreground">Precio: {item.salePrice !== null && item.salePrice > 0 ? money(item.salePrice) : "Sin precio"}</p>
                        <p className="text-muted-foreground">Costo de referencia: {item.referenceCost !== null && item.referenceCost > 0 ? money(item.referenceCost) : "Sin costo"}</p>
                        <p className="text-xs text-muted-foreground">El costo real para vender se comprueba por cada IMEI.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      {[
                        ["En sedes",item.physicallyVerified],
                        ["Disponibles",item.available],
                        ["Vendidos históricos",item.sold],
                        ["Sin conciliar",item.unverified],
                      ].map(([label,value])=><div key={label} className="rounded-xl border bg-muted/10 p-3">
                        <p className="text-xl font-semibold tabular-nums">{number(value as number)}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
                      </div>)}
                    </div>
                    <section className="space-y-2">
                      <h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4"/> Distribución física verificada</h3>
                      {commercialSiteGroups(item.sites).map(site => (
                        <div key={site.siteId} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                          <div>
                            <p className="font-medium">{site.siteName}</p>
                            {site.cityName ? <p className="text-xs text-muted-foreground">{site.cityName}</p> : null}
                          </div>
                          <p className="text-right text-xs tabular-nums">
                            {number(site.physicallyVerified)} en sede · <strong>{number(site.available)}</strong> disponibles
                          </p>
                        </div>
                      ))}
                      {commercialSiteGroups(item.sites).length === 0 ? <p className="rounded-lg border p-3 text-xs text-muted-foreground">Sin unidades físicas verificadas en sedes.</p> : null}
                      {item.inTransit > 0 || item.pendingReturn > 0 ? <p className="text-xs text-muted-foreground">
                        {number(item.inTransit)} en tránsito · {number(item.pendingReturn)} retornos pendientes
                      </p> : null}
                    </section>
                  </DialogContent>
                </Dialog>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>;

const ImeiTable = ({ items }: { items: ImeiDirectoryRow[] }) =>
  <section aria-label="Inventario individual por IMEI" className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] text-sm">
        <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 text-left">Producto / IMEI</th>
            <th scope="col" className="px-3 py-3 text-left">Sede o historial</th>
            <th scope="col" className="px-3 py-3 text-left">Estado</th>
            <th scope="col" className="px-3 py-3 text-right">Costo individual</th>
            <th scope="col" className="px-3 py-3 text-right">Disponibilidad</th>
            <th scope="col" className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => <tr key={item.unitId} className="border-t border-border/80 transition-colors hover:bg-muted/35">
            <td className="px-4 py-2.5">
              <div className="flex min-w-[240px] items-center gap-3">
                <CatalogPhoto name={item.productName} sku={item.sku} media={item} small/>
                <div className="min-w-0">
                  <p className="font-semibold leading-snug">{item.productName}</p>
                  <p className="mt-0.5 font-mono text-[11px] font-semibold text-primary">{item.serial}</p>
                  <span className="mt-0.5 inline-flex rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{item.sku}</span>
                </div>
              </div>
            </td>
            <td className="px-3 py-2.5 text-xs text-muted-foreground">
              {item.custodyState === "vendido" ? <span className="flex items-center gap-1"><History className="size-3.5"/> Vendido · historial</span> :
                item.siteName ? <span className="flex items-center gap-1"><MapPin className="size-3.5"/>{item.siteName}</span> : "Sin sede verificada"}
            </td>
            <td className="px-3 py-2.5"><span className="rounded-full border bg-muted/50 px-2 py-1 text-xs">{CUSTODY_LABEL[item.custodyState]}</span></td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">{money(item.cost)}</td>
            <td className="px-3 py-2.5 text-right">
              {item.commercialCandidate ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"><BadgeCheck className="size-3.5"/> Disponible</span> : <span className="text-xs text-muted-foreground">No disponible</span>}
            </td>
            <td className="px-4 py-2.5 text-right">
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 rounded-full"><Eye className="size-4"/> Ver</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{item.productName}</DialogTitle>
                    <DialogDescription>{item.sku} · Detalle individual del equipo</DialogDescription>
                  </DialogHeader>
                  <div className="flex items-start gap-3">
                    <CatalogPhoto name={item.productName} sku={item.sku} media={item}/>
                    <div className="space-y-2 text-sm">
                      <p><span className="text-muted-foreground">IMEI:</span> <strong className="break-all font-mono">{item.serial}</strong></p>
                      <p><span className="text-muted-foreground">Estado:</span> {CUSTODY_LABEL[item.custodyState]}</p>
                      <p><span className="text-muted-foreground">Ubicación:</span> {item.custodyState==="vendido" ? "Vendido · historial" : item.siteName ?? "Sin sede verificada"}</p>
                      <p><span className="text-muted-foreground">Costo del IMEI:</span> <strong>{money(item.cost)}</strong></p>
                      <p className="text-xs text-muted-foreground">{item.commercialCandidate ? "Candidato a disponibilidad comercial." : "No disponible para venta."}</p>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
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
        <p className="mt-1 text-sm text-muted-foreground">Referencias, fotografías y existencias de equipos, con el mismo formato del inventario principal.</p>
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
