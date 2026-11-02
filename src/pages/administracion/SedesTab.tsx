import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AprobacionInventarioInicialPanel } from "./AprobacionInventarioInicialPanel";
import { TrasladosMultisedePanel } from "./TrasladosMultisedePanel";
import { DisponibilidadPorSedePanel } from "./DisponibilidadPorSedePanel";
import { PosPreflightPanel } from "./PosPreflightPanel";
import { Building2, CheckCircle2, CircleHelp, MapPin, Pencil, Plus, RefreshCw, Store, Warehouse } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonalSedesPanel } from "./PersonalSedesPanel";
import { ConciliacionImeiPanel } from "./ConciliacionImeiPanel";
import {
  allowedParents, createNexoraCity, createNexoraSite, listNexoraNetwork,
  siteTypeLabel, updateNexoraSiteDetails, validateSiteDraft,
  type NexoraCity, type NexoraSite, type SiteDraft, type SiteType,
} from "@/lib/nexora-sites";

const kindIcon = { principal: Building2, bodega: Warehouse, local: Store } as const;
const kindOrder = { principal: 0, bodega: 1, local: 2 } as const;
const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export const SedesTab = () => {
  const [cities, setCities] = useState<NexoraCity[]>([]);
  const [approvalLocked, setApprovalLocked] = useState(false);
  const markApproved = useCallback(() => setApprovalLocked(true), []);
  const [sites, setSites] = useState<NexoraSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityOpen, setCityOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [editSite, setEditSite] = useState<NexoraSite | null>(null);
  const [cityName, setCityName] = useState("");
  const [cityRegion, setCityRegion] = useState("");
  const [siteForm, setSiteForm] = useState<SiteDraft>({
    name: "", cityId: "", siteType: "principal", parentSiteId: null, address: "",
  });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const refreshToken = useRef(0);

  const refresh = useCallback(async () => {
    const token = ++refreshToken.current;
    setLoading(true);
    try {
      const result = await listNexoraNetwork();
      if (token === refreshToken.current) {
        setCities(result.cities);
        setSites(result.sites);
      }
    } catch (error) {
      if (token === refreshToken.current)
        toast.error(error instanceof Error ? error.message : "No fue posible consultar las sedes.");
    } finally {
      if (token === refreshToken.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { refreshToken.current += 1; };
  }, [refresh]);

  const hasPrincipal = sites.some((site) => site.siteType === "principal");
  const parentOptions = useMemo(
    () => allowedParents(siteForm.siteType, siteForm.cityId, sites),
    [siteForm.siteType, siteForm.cityId, sites],
  );
  const validation = validateSiteDraft(siteForm, cities, sites);

  const beginSite = () => {
    const type: SiteType = hasPrincipal ? "bodega" : "principal";
    const cityId = cities[0]?.id ?? "";
    const parentSiteId = allowedParents(type, cityId, sites)[0]?.id ?? null;
    setSiteForm({ name: "", cityId, siteType: type, parentSiteId, address: "" });
    setSiteOpen(true);
  };
  const chooseSiteType = (type: SiteType) => setSiteForm((previous) => ({
    ...previous, siteType: type,
    parentSiteId: allowedParents(type, previous.cityId, sites)[0]?.id ?? null,
  }));
  const chooseCity = (cityId: string) => setSiteForm((previous) => ({
    ...previous, cityId,
    parentSiteId: allowedParents(previous.siteType, cityId, sites)[0]?.id ?? null,
  }));
  const runSave = async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await work();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible guardar los cambios.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const saveCity = () => void runSave(async () => {
    await createNexoraCity(cityName, cityRegion);
    setCityOpen(false);
    setCityName("");
    setCityRegion("");
    toast.success("Ciudad registrada");
  });
  const saveSite = () => void runSave(async () => {
    await createNexoraSite(siteForm, cities, sites);
    setSiteOpen(false);
    toast.success("Punto físico registrado");
  });
  const saveDetails = () => {
    if (!editSite) return;
    void runSave(async () => {
      await updateNexoraSiteDetails(editSite.id, editSite.name, editSite.address ?? "");
      setEditSite(null);
      toast.success("Información del punto actualizada");
    });
  };

  const count = (type: SiteType) => sites.filter((site) => site.siteType === type).length;
  const siteById = new Map(sites.map((site) => [site.id, site]));
  const getCity = (id: string) => cities.find((city) => city.id === id)?.name ?? "Sin ciudad";

  return (
    <section className="space-y-6" aria-label="Red de ciudades y puntos físicos">
      <div className="relative overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-white via-sky-50 to-indigo-100 p-5 text-slate-900 shadow-lg shadow-indigo-950/5 dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 dark:text-white dark:shadow-black/20 sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 dark:border-sky-300/25 bg-sky-100 dark:bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-800 dark:text-sky-200">
              <MapPin className="h-3.5 w-3.5" /> Nexora Multisede 2.0
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Ciudades y puntos físicos</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Construye la red de distribución desde una sede principal hacia bodegas regionales y locales.
              Los nombres y direcciones se configuran aquí, sin estructuras fijas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="bg-white text-slate-950 hover:bg-slate-100" onClick={() => setCityOpen(true)}>
              <Plus className="h-4 w-4" /> Nueva ciudad
            </Button>
            <Button className="border-slate-300 bg-white/80 text-slate-900 hover:bg-white dark:border-white/30 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
              variant="outline" disabled={cities.length === 0} onClick={beginSite}>
              <Plus className="h-4 w-4" /> Nuevo punto
            </Button>
          </div>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Ciudades", value: cities.length },
            { label: "Sede principal", value: count("principal") },
            { label: "Bodegas regionales", value: count("bodega") },
            { label: "Locales", value: count("local") },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white/75 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none px-4 py-3">
              <p className="text-2xl font-bold tabular-nums">{value}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <p className="flex max-w-3xl items-start gap-2 text-sm text-muted-foreground">
          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span><strong className="text-foreground">Etapa de configuración:</strong> crear puntos no mueve inventario, no activa ventas ni cambia IMEI existentes. La asociación de existencias se realizará mediante verificación física y migración controlada.</span>
        </p>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </Button>
      </div>

      {loading && cities.length === 0 ? (
        <div role="status" className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">Cargando red de sedes...</div>
      ) : cities.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-5 py-14 text-center">
          <Building2 className="mx-auto h-12 w-12 text-primary" />
          <h3 className="mt-4 text-lg font-semibold">Comienza registrando la primera ciudad</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Después podrás identificar la sede principal, vincular bodegas y agregar sus locales. No se crean sedes ficticias automáticamente.
          </p>
          <Button className="mt-5" onClick={() => setCityOpen(true)}><Plus className="h-4 w-4" /> Crear ciudad</Button>
        </div>
      ) : (
        <div className="space-y-5">
          {cities.map((city) => {
            const localSites = sites.filter((site) => site.cityId === city.id)
              .sort((a, b) => kindOrder[a.siteType] - kindOrder[b.siteType] || a.name.localeCompare(b.name, "es"));
            return (
              <section key={city.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm"
                aria-label={`Ciudad ${city.name}`}>
                <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-5 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><MapPin className="h-5 w-5" /></div>
                    <div>
                      <h3 className="text-lg font-semibold">{city.name}</h3>
                      <p className="text-xs text-muted-foreground">{city.region || "Región sin especificar"} · {localSites.length} puntos</p>
                    </div>
                  </div>
                </header>
                {localSites.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">Ciudad registrada. Agrega su primera bodega o sede principal para organizar la distribución.</p>
                ) : (
                  <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {localSites.map((site) => {
                      const Icon = kindIcon[site.siteType];
                      const parent = site.parentSiteId ? siteById.get(site.parentSiteId) : null;
                      return (
                        <article key={site.id} className="rounded-xl border bg-background p-4 transition-shadow hover:shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></span>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{siteTypeLabel[site.siteType]}</p>
                                <h4 className="mt-1 break-words font-semibold">{site.name}</h4>
                              </div>
                            </div>
                            <Button size="icon" variant="ghost" aria-label={`Editar ${site.name}`}
                              onClick={() => setEditSite({ ...site })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                            <p className="flex items-start gap-2">
                              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {site.address || "Dirección pendiente"}
                            </p>
                            <p className="flex items-start gap-2">
                              <Warehouse className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              {parent ? `Abastece desde: ${parent.name} · ${getCity(parent.cityId)}` : "Origen de la red empresarial"}
                            </p>
                            <p className="flex items-center gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              {site.isActive ? "Punto configurado" : "Punto inactivo"}
                            </p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <PersonalSedesPanel cities={cities} sites={sites} />
      <ConciliacionImeiPanel cities={cities} sites={sites} approvalLocked={approvalLocked} />
      <AprobacionInventarioInicialPanel onApproved={markApproved} />
      <TrasladosMultisedePanel sites={sites} />
      <DisponibilidadPorSedePanel />
      <PosPreflightPanel sites={sites} />

      <Dialog open={cityOpen} onOpenChange={(open) => { if (!busyRef.current) setCityOpen(open); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva ciudad</DialogTitle>
            <DialogDescription>Agrega una ciudad sin crear existencias automáticamente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nexora-city-name">Ciudad *</Label>
              <Input id="nexora-city-name" maxLength={120} placeholder="Nombre de la ciudad"
                value={cityName} onChange={(event) => setCityName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nexora-city-region">Departamento / región</Label>
              <Input id="nexora-city-region" maxLength={120} value={cityRegion}
                onChange={(event) => setCityRegion(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setCityOpen(false)}>Cancelar</Button>
            <Button disabled={busy || cityName.trim().length < 2} onClick={saveCity}>Guardar ciudad</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={siteOpen} onOpenChange={(open) => { if (!busyRef.current) setSiteOpen(open); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo punto físico</DialogTitle>
            <DialogDescription>Define la ubicación y su ruta fija de abastecimiento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nexora-site-kind">Tipo de punto *</Label>
              <select id="nexora-site-kind" className={selectClass} value={siteForm.siteType}
                onChange={(event) => chooseSiteType(event.target.value as SiteType)}>
                <option value="principal" disabled={hasPrincipal}>Sede principal</option>
                <option value="bodega">Bodega regional</option>
                <option value="local">Local comercial</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nexora-site-city">Ciudad *</Label>
              <select id="nexora-site-city" className={selectClass} value={siteForm.cityId}
                onChange={(event) => chooseCity(event.target.value)}>
                {cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nexora-site-name">Nombre del punto *</Label>
              <Input id="nexora-site-name" maxLength={140} placeholder="Ej. Bodega zona norte"
                value={siteForm.name} onChange={(event) => setSiteForm((previous) => ({ ...previous, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nexora-site-address">Dirección</Label>
              <Input id="nexora-site-address" maxLength={250} value={siteForm.address ?? ""}
                onChange={(event) => setSiteForm((previous) => ({ ...previous, address: event.target.value }))} />
            </div>
            {siteForm.siteType !== "principal" ? (
              <div className="space-y-2">
                <Label htmlFor="nexora-site-parent">Sede que abastece *</Label>
                <select id="nexora-site-parent" className={selectClass} value={siteForm.parentSiteId ?? ""}
                  onChange={(event) => setSiteForm((previous) => ({ ...previous, parentSiteId: event.target.value || null }))}>
                  {parentOptions.length === 0 ? <option value="">No hay orígenes válidos</option> : null}
                  {parentOptions.map((parent) => (
                    <option key={parent.id} value={parent.id}>{parent.name} · {getCity(parent.cityId)}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {siteForm.siteType === "local"
                    ? "El local solo puede depender de una bodega de su ciudad."
                    : "La bodega regional depende de la sede principal."}
                </p>
              </div>
            ) : null}
            {validation && siteForm.name.trim().length >= 2 ? (
              <p role="alert" className="text-xs text-amber-600">{validation}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setSiteOpen(false)}>Cancelar</Button>
            <Button disabled={busy || validation !== null} onClick={saveSite}>Guardar punto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editSite !== null} onOpenChange={(open) => { if (!open && !busyRef.current) setEditSite(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar datos del punto</DialogTitle>
            <DialogDescription>Por seguridad, cambiar de ciudad o de bodega de origen requiere una migración controlada.</DialogDescription>
          </DialogHeader>
          {editSite ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="nexora-edit-name">Nombre *</Label>
                <Input id="nexora-edit-name" maxLength={140} value={editSite.name}
                  onChange={(event) => setEditSite((previous) => previous ? { ...previous, name: event.target.value } : null)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nexora-edit-address">Dirección</Label>
                <Input id="nexora-edit-address" maxLength={250} value={editSite.address ?? ""}
                  onChange={(event) => setEditSite((previous) => previous ? { ...previous, address: event.target.value } : null)} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setEditSite(null)}>Cancelar</Button>
            <Button disabled={busy || !editSite || editSite.name.trim().length < 2} onClick={saveDetails}>Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
