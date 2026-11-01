import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Building2, CheckCircle2, CircleAlert, MapPinned,
  Network, Plus, RefreshCw, ShieldCheck, Store, Warehouse,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCity, createSite, listCities, listSites,
  type NexoraCity, type NexoraSite, type SiteKind,
} from "@/lib/nexora-sites";

const KIND_LABELS: Record<SiteKind, string> = {
  principal: "Sede principal",
  bodega: "Bodega regional",
  local: "Local comercial",
};

const KIND_ICONS = { principal: Building2, bodega: Warehouse, local: Store };

/** Reutilizado en todas las secciones: campos accesibles y carga bloqueada en envío. */
const NewCityDialog = ({ onSaved }: { onSaved: () => Promise<unknown> }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [department, setDepartment] = useState("");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const submit = async () => {
    if (lock.current) return;
    lock.current = true; setSaving(true);
    try {
      await createCity({ name, code, department });
      toast.success("Ciudad registrada correctamente");
      setOpen(false); setName(""); setCode(""); setDepartment("");
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear la ciudad");
    } finally { lock.current = false; setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!lock.current) setOpen(next); }}>
      <DialogTrigger asChild><Button variant="outline"><MapPinned className="h-4 w-4" /> Nueva ciudad</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar ciudad</DialogTitle>
          <DialogDescription>Agrega una ciudad donde Nexora tendrá bodegas o locales. No crea inventario.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2"><Label htmlFor="city-name">Nombre de la ciudad</Label>
            <Input id="city-name" value={name} maxLength={100} placeholder="Nombre real de la ciudad" onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="city-code">Código único</Label>
            <Input id="city-code" value={code} maxLength={20} placeholder="Ej. CIUDAD01" onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <p className="text-xs text-muted-foreground">De 2 a 20 caracteres: letras, números, guion y guion bajo.</p></div>
          <div className="space-y-2"><Label htmlFor="city-department">Departamento (opcional)</Label>
            <Input id="city-department" value={department} maxLength={100} onChange={(e) => setDepartment(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button>
          <Button loading={saving} onClick={() => void submit()}>Guardar ciudad</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const NewSiteDialog = ({ cities, sites, onSaved }: {
  cities: NexoraCity[]; sites: NexoraSite[]; onSaved: () => Promise<unknown>;
}) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [cityId, setCityId] = useState("");
  const [kind, setKind] = useState<SiteKind>("bodega");
  const [parentId, setParentId] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const warehouses = useMemo(
    () => sites.filter((s) => s.city_id === cityId && s.is_active && (s.kind === "bodega" || s.kind === "principal")),
    [cityId, sites],
  );
  const hasPrincipal = sites.some((s) => s.kind === "principal");
  const submit = async () => {
    if (lock.current) return;
    lock.current = true; setSaving(true);
    try {
      await createSite({ name, code, cityId, kind, parentWarehouseId: parentId, address });
      toast.success("Punto físico registrado correctamente");
      setOpen(false); setName(""); setCode(""); setCityId(""); setKind("bodega"); setParentId(""); setAddress("");
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el punto físico");
    } finally { lock.current = false; setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!lock.current) setOpen(next); }}>
      <DialogTrigger asChild><Button disabled={cities.filter((c) => c.is_active).length === 0}><Plus className="h-4 w-4" /> Nuevo punto físico</Button></DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Agregar punto físico</DialogTitle>
          <DialogDescription>Define ciudad y relación logística. El inventario se incorporará después de la verificación física.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2"><Label htmlFor="site-city">Ciudad</Label>
            <select id="site-city" value={cityId} onChange={(e) => { setCityId(e.target.value); setParentId(""); }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Selecciona una ciudad</option>
              {cities.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="space-y-2"><Label htmlFor="site-kind">Tipo de punto</Label>
            <select id="site-kind" value={kind} onChange={(e) => { setKind(e.target.value as SiteKind); setParentId(""); }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {!hasPrincipal ? <option value="principal">Sede principal</option> : null}
              <option value="bodega">Bodega regional</option>
              <option value="local">Local comercial</option>
            </select></div>
          <div className="space-y-2"><Label htmlFor="site-name">Nombre del punto</Label>
            <Input id="site-name" maxLength={100} value={name} placeholder="Nombre del establecimiento" onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="site-code">Código único</Label>
            <Input id="site-code" maxLength={24} value={code} placeholder="Ej. BG01" onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
          {kind === "local" ? (
            <div className="space-y-2"><Label htmlFor="site-parent">Bodega que abastece este local</Label>
              <select id="site-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Selecciona la bodega de origen</option>
                {warehouses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {warehouses.length === 0 ? <p className="text-xs text-amber-600">Primero registra una bodega o la sede principal de esta ciudad.</p> : null}
            </div>
          ) : null}
          <div className="space-y-2"><Label htmlFor="site-address">Dirección (opcional)</Label>
            <Input id="site-address" value={address} maxLength={240} onChange={(e) => setAddress(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button>
          <Button loading={saving} disabled={!cityId || (kind === "local" && !parentId)} onClick={() => void submit()}>Crear punto físico</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Panel administrativo de sitios; no presenta un stock ficticio antes del conteo físico. */
export const SedesTab = () => {
  const [cities, setCities] = useState<NexoraCity[]>([]);
  const [sites, setSites] = useState<NexoraSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++latest.current;
    setLoading(true);
    try {
      const [cityRows, siteRows] = await Promise.all([listCities(), listSites()]);
      if (sequence !== latest.current) return;
      setCities(cityRows); setSites(siteRows); setError(null);
    } catch (cause) {
      if (sequence !== latest.current) return;
      setError(cause instanceof Error ? cause.message : "No se pudieron consultar las sedes");
    } finally {
      if (sequence === latest.current) setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); return () => { latest.current++; }; }, [refresh]);

  const activeCities = cities.filter((c) => c.is_active);
  const activeSites = sites.filter((s) => s.is_active);
  const principal = sites.find((s) => s.kind === "principal");
  return (
    <section className="space-y-6" aria-label="Red empresarial multisede">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-5 text-white shadow-lg sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="max-w-xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-xs font-semibold tracking-wide text-sky-200">
              <Network className="h-3.5 w-3.5" /> NEXORA 2.0 · RED EMPRESARIAL
            </div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ciudades y puntos físicos</h2>
            <p className="text-sm leading-relaxed text-slate-300">
              Organiza tu operación por ciudad, bodega y local. Cada local queda vinculado a la bodega que lo abastece.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-sky-300" />
            <span className="text-xs font-semibold text-slate-200">Control central</span>
          </div>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Ciudades", count: activeCities.length },
            { label: "Bodegas", count: activeSites.filter((s) => s.kind === "bodega").length },
            { label: "Locales", count: activeSites.filter((s) => s.kind === "local").length },
            { label: "Sede principal", count: principal ? 1 : 0 },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.07] p-3 backdrop-blur-sm">
              <div className="text-2xl font-bold tabular-nums">{item.count}</div>
              <div className="mt-1 text-xs text-slate-300">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-base font-semibold">Directorio de ubicaciones</h3>
          <p className="text-sm text-muted-foreground">Los datos aparecerán aquí cuando se registren las sedes reales.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Actualizar sedes" disabled={loading} onClick={() => void refresh()}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
          <NewCityDialog onSaved={refresh} />
          <NewSiteDialog cities={cities} sites={sites} onSaved={refresh} />
        </div>
      </div>

      {error ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <CircleAlert className="h-5 w-5 shrink-0 text-amber-600" />
          <div><p className="font-semibold">Catálogo multisede aún no disponible</p>
            <p className="mt-1 text-muted-foreground">Activa y verifica primero la migración multisede en un entorno de pruebas. Detalle: {error}</p></div>
        </div>
      ) : null}
      {loading ? <p role="status" className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Consultando sedes...</p>
      : !error && cities.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
          <MapPinned className="mx-auto h-10 w-10 text-primary" />
          <h3 className="mt-4 font-semibold">Tu red comienza con una ciudad</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Registra la ciudad y luego crea la sede principal, sus bodegas y locales. Ningún IMEI será trasladado o reasignado automáticamente.</p>
          <div className="mt-5"><NewCityDialog onSaved={refresh} /></div>
        </div>
      ) : !error ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {cities.map((city) => {
            const related = sites.filter((site) => site.city_id === city.id);
            return (
              <article key={city.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3 border-b bg-muted/20 px-5 py-4">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MapPinned className="h-5 w-5" /></div>
                    <div className="min-w-0"><h4 className="truncate font-bold">{city.name}</h4>
                      <p className="text-xs text-muted-foreground">{city.department || "Departamento sin registrar"} · {city.code}</p></div>
                  </div>
                  <span className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium">{related.length} puntos</span>
                </div>
                <div className="space-y-2 p-4">
                  {related.length === 0 ? <p className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">Aún no hay bodegas ni locales registrados.</p>
                  : related.map((site) => {
                    const kind = site.kind as SiteKind;
                    const Icon = KIND_ICONS[kind] ?? Building2;
                    const parent = site.parent_warehouse_id ? sites.find((s) => s.id === site.parent_warehouse_id) : null;
                    return (
                      <div key={site.id} className="flex items-center gap-3 rounded-xl border bg-background/60 p-3">
                        <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{site.name}</p>
                          <p className="text-xs text-muted-foreground">{KIND_LABELS[kind] ?? site.kind} · {site.code}</p>
                          {parent ? <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><ArrowRight className="h-3 w-3" /> Abastece: {parent.name}</p> : null}
                        </div>
                        <span title={site.is_active ? "Activo" : "Inactivo"}><CheckCircle2 className={`h-4 w-4 ${site.is_active ? "text-emerald-500" : "text-muted-foreground"}`} /></span>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      <div className="flex gap-3 rounded-xl border bg-muted/25 p-4">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Inventario protegido:</strong> este catálogo no cambia las existencias ni los estados actuales.
          La asignación de cada IMEI a una sede se realizará después mediante verificación física y migración controlada.
        </p>
      </div>
    </section>
  );
};
