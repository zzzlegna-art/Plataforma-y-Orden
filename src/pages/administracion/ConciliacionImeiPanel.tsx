import { useCallback, useEffect, useRef, useState } from "react";
import { Barcode, CheckCircle2, ClipboardCheck, FileClock, LockKeyhole, MapPin, PackageSearch, RefreshCw, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  canObserveLegacyStatus, findActiveObservationByImei, listPhysicalObservations,
  lookupImeiForPhysicalCount, normalizeScan, registerPhysicalObservation,
  validatePhysicalScan, voidPhysicalObservation,
  type ImeiObservation, type ScannedUnit,
} from "@/lib/nexora-imei-reconciliation";
import type { NexoraCity, NexoraSite } from "@/lib/nexora-sites";
import { PhysicalBatchScanPanel } from "./PhysicalBatchScanPanel";

const selectClass = "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export const ConciliacionImeiPanel = ({
  cities, sites, approvalLocked,
}: {
  cities: readonly NexoraCity[];
  sites: readonly NexoraSite[];
  approvalLocked?: boolean;
}) => {
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [serial, setSerial] = useState("");
  const [notes, setNotes] = useState("");
  const [unit, setUnit] = useState<ScannedUnit | null>(null);
  const [duplicate, setDuplicate] = useState<ImeiObservation | null>(null);
  const [found, setFound] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<ImeiObservation[]>([]);
  const [globalTotal, setGlobalTotal] = useState(0);
  const [siteTotal, setSiteTotal] = useState(0);
  const [voiding, setVoiding] = useState<ImeiObservation | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const latest = useRef(0);
  const lastSearch = useRef(0);
  const busyRef = useRef(false);

  const activeSites = sites.filter((site) => site.isActive);
  const siteId = activeSites.some((site) => site.id === selectedSiteId)
    ? selectedSiteId : activeSites[0]?.id ?? "";
  const chosenSite = sites.find((site) => site.id === siteId);
  const siteName = (id: string) => sites.find((site) => site.id === id)?.name ?? "Sede desconocida";
  const getCity = (id: string) => cities.find((city) => city.id === id)?.name ?? "Sin ciudad";

  const refresh = useCallback(async (id: string) => {
    if (!id) {
      setRecent([]);
      setGlobalTotal(0);
      setSiteTotal(0);
      return;
    }
    const request = ++latest.current;
    setLoading(true);
    try {
      const data = await listPhysicalObservations(id);
      if (request !== latest.current) return;
      setRecent(data.recent);
      setGlobalTotal(data.activeTotal);
      setSiteTotal(data.siteTotal);
    } catch (error) {
      if (request === latest.current)
        toast.error(error instanceof Error ? error.message : "No se pudo cargar la conciliación.");
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(siteId);
    return () => { latest.current += 1; lastSearch.current += 1; };
  }, [refresh, siteId]);

  const changeSite = (value: string) => {
    lastSearch.current += 1;
    setSearching(false);
    setSelectedSiteId(value);
    setUnit(null);
    setDuplicate(null);
    setFound(false);
  };

  const search = async () => {
    const problem = validatePhysicalScan(serial, siteId);
    if (problem) { toast.error(problem); return; }
    const request = ++lastSearch.current;
    setSearching(true);
    setFound(false);
    setUnit(null);
    setDuplicate(null);
    try {
      const matched = await lookupImeiForPhysicalCount(serial);
      if (request !== lastSearch.current) return;
      setFound(true);
      setUnit(matched);
      if (matched) {
        const prev = await findActiveObservationByImei(matched.id);
        if (request === lastSearch.current) setDuplicate(prev);
      }
    } catch (error) {
      if (request === lastSearch.current)
        toast.error(error instanceof Error ? error.message : "No se pudo consultar el serial.");
    } finally {
      if (request === lastSearch.current) setSearching(false);
    }
  };

  const register = async () => {
    if (approvalLocked || !unit || !siteId || duplicate || busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      await registerPhysicalObservation(unit, siteId, notes);
      toast.success("IMEI cotejado; pendiente de aprobación del inventario inicial");
      setSerial("");
      setNotes("");
      setUnit(null);
      setFound(false);
      setDuplicate(null);
      await refresh(siteId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar el cotejo.");
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const voidObservation = async () => {
    if (approvalLocked || !voiding || busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      await voidPhysicalObservation(voiding.id, voidReason);
      toast.success("Cotejo anulado conservando su historial");
      if (duplicate?.id === voiding.id) setDuplicate(null);
      setVoiding(null);
      setVoidReason("");
      await refresh(siteId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo anular el cotejo.");
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const valid = unit && canObserveLegacyStatus(unit.status);
  const canRegister = Boolean(!approvalLocked && valid && !duplicate && !searching && !saving && chosenSite?.isActive);
  return (
    <section className="space-y-5" aria-label="Conciliación física por IMEI">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-5 text-white shadow-lg sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 h-52 w-52 rounded-full bg-blue-400/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-sky-200">
              <Barcode className="h-3.5 w-3.5" /> Control físico · Nexora 2.0
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Conciliación por IMEI</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Registra la presencia física de cada unidad en su sede antes de distribuir oficialmente el inventario.
              Cada cotejo se conserva con responsable y fecha.
            </p>
          </div>
          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
            Aplicación al stock pendiente
          </span>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
            <p className="text-3xl font-bold tabular-nums">{globalTotal.toLocaleString("es-CO")}</p>
            <p className="mt-1 text-xs text-slate-300">Cotejos vigentes globales</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
            <p className="text-3xl font-bold tabular-nums">{siteTotal.toLocaleString("es-CO")}</p>
            <p className="mt-1 text-xs text-slate-300">Cotejos en la sede seleccionada</p>
          </div>
        </div>
      </div>

      <PhysicalBatchScanPanel key={siteId||"no-site"} siteId={siteId}
        siteName={chosenSite?.name??""} approvalLocked={Boolean(approvalLocked)}
        onCompleted={()=>{void refresh(siteId);}} />
      <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p><strong className="text-foreground">No habilita existencias:</strong> un IMEI cotejado no se transfiere, vende ni cambia de ubicación por esta operación. Se conserva íntegro el stock anterior; el Administrador aprobará la distribución después de la conciliación completa.</p>
        </div>
      </div>

      {approvalLocked ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 text-sm text-emerald-700 dark:text-emerald-300">
          El inventario inicial ya fue aprobado. Los cotejos quedaron cerrados y protegidos; las compras y traslados futuros tendrán su propio flujo.
        </div>
      ) : null}

      {activeSites.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-9 text-center">
          <MapPin className="mx-auto h-10 w-10 text-primary" />
          <h3 className="mt-3 font-semibold">Primero registra una sede</h3>
          <p className="mt-2 text-sm text-muted-foreground">Crea la sede principal y los puntos físicos en esta misma pantalla antes de comenzar el escaneo de IMEI.</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-start gap-3">
              <span className="rounded-xl bg-primary/10 p-3 text-primary"><PackageSearch className="h-5 w-5" /></span>
              <div>
                <h3 className="font-semibold">Escanear una unidad</h3>
                <p className="mt-1 text-sm text-muted-foreground">Selecciona el lugar donde estás viendo físicamente el equipo.</p>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(250px,1.3fr)_auto] lg:items-end">
              <div className="space-y-2">
                <Label htmlFor="nexora-physical-site">Sede física</Label>
                <select id="nexora-physical-site" className={selectClass} value={siteId} disabled={saving || approvalLocked}
                  onChange={(event) => changeSite(event.target.value)}>
                  {activeSites.map((site) => (
                    <option value={site.id} key={site.id}>{site.name} · {getCity(site.cityId)}</option>
                  ))}
                </select>
              </div>
              <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void search(); }}>
                <Label htmlFor="nexora-imei-scan">IMEI / Serial</Label>
                <div className="flex gap-2">
                  <Input id="nexora-imei-scan" placeholder="Escanear o escribir el serial exacto" maxLength={160}
                    autoComplete="off" value={serial} disabled={saving || approvalLocked}
                    onChange={(event) => { lastSearch.current += 1; setSearching(false); setSerial(event.target.value); setFound(false); setUnit(null); setDuplicate(null); }} />
                  <Button type="submit" disabled={approvalLocked || searching || saving || !normalizeScan(serial)}>
                    <Search className="h-4 w-4" /> {searching ? "Buscando" : "Buscar"}
                  </Button>
                </div>
              </form>
              <Button variant="outline" size="sm" disabled={loading || saving} onClick={() => void refresh(siteId)}>
                <RefreshCw className="h-4 w-4" /> Actualizar
              </Button>
            </div>

            {found && !unit ? (
              <p role="status" className="mt-5 rounded-xl border border-amber-300/40 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300">
                Este IMEI no aparece en el inventario. Revisa el número; no se registró ninguna unidad.
              </p>
            ) : null}
            {unit ? (
              <div className="mt-5 rounded-xl border bg-muted/15 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Equipo encontrado</p>
                    <h4 className="mt-1 font-semibold">{unit.productName}</h4>
                    <p className="mt-1 break-all font-mono text-sm">{unit.serial}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Estado actual: {unit.status}</p>
                  </div>
                  <span className={valid
                    ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                    : "rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-300"}>
                    {valid ? "Elegible para cotejo" : "Estado no elegible"}
                  </span>
                </div>
                {!valid ? (
                  <p className="mt-4 text-sm text-red-700 dark:text-red-300">
                    No puede cotejarse como mercancía disponible porque está vendido, liberado o entregado.
                  </p>
                ) : null}
                {duplicate ? (
                  <div role="alert" className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm">
                    <strong>IMEI ya cotejado.</strong> Se registró en {siteName(duplicate.siteId)}.
                    Para volver a escanearlo primero anula el cotejo anterior con un motivo.
                    <Button className="mt-3" size="sm" variant="outline" disabled={saving || approvalLocked}
                      onClick={() => { setVoiding(duplicate); setVoidReason(""); }}>
                      <RotateCcw className="h-4 w-4" /> Anular cotejo anterior
                    </Button>
                  </div>
                ) : null}
                {valid && !duplicate ? (
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="nexora-imei-note">Observaciones (opcional)</Label>
                    <Input id="nexora-imei-note" maxLength={300} placeholder="Ej. Caja sellada, verificación física completa"
                      value={notes} onChange={(event) => setNotes(event.target.value)} />
                  </div>
                ) : null}
                <div className="mt-4 flex justify-end">
                  <Button disabled={!canRegister} onClick={() => void register()}>
                    <ClipboardCheck className="h-4 w-4" /> Registrar cotejo físico
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <div>
                <h3 className="flex items-center gap-2 font-semibold"><FileClock className="h-4 w-4 text-primary" /> Últimos cotejos</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {chosenSite?.name ?? "Sede"} · hasta 50 registros vigentes recientes
                </p>
              </div>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Historial protegido
              </span>
            </div>
            {loading && recent.length === 0 ? (
              <p role="status" className="p-6 text-sm text-muted-foreground">Cargando cotejos...</p>
            ) : recent.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Barcode className="mx-auto h-9 w-9 text-primary" />
                <p className="mt-3 font-semibold">Aún no hay IMEI cotejados en esta sede.</p>
                <p className="mt-1 text-sm text-muted-foreground">Escanea el primer equipo para comenzar la verificación física.</p>
              </div>
            ) : (
              <div className="divide-y">
                {recent.map((record) => (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" key={record.id}>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        <span className="break-all font-mono">{record.serial}</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {record.statusAtScan} · {new Date(record.checkedAt).toLocaleString("es-CO")}
                      </p>
                      {record.notes ? <p className="mt-1 text-xs text-muted-foreground">{record.notes}</p> : null}
                    </div>
                    <Button size="sm" variant="outline" disabled={saving || approvalLocked}
                      aria-label={`Anular cotejo de ${record.serial}`}
                      onClick={() => { setVoiding(record); setVoidReason(""); }}>
                      <RotateCcw className="h-4 w-4" /> Anular
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <Dialog open={voiding !== null} onOpenChange={(open) => { if (!open && !saving) setVoiding(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anular cotejo físico</DialogTitle>
            <DialogDescription>
              El registro histórico se conserva y este IMEI podrá volver a verificarse físicamente después de la anulación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <p className="text-sm font-semibold">IMEI: {voiding?.serial}</p>
            <Label htmlFor="nexora-void-reason">Motivo de anulación *</Label>
            <Input id="nexora-void-reason" maxLength={300} value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder="Ej. Equipo ubicado en otra sede" />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setVoiding(null)}>Cancelar</Button>
            <Button disabled={saving || voidReason.trim().length < 5} onClick={() => void voidObservation()}>
              Confirmar anulación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
