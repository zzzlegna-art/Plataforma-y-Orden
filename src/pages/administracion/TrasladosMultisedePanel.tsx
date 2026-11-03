import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Barcode, CheckCircle2, ClipboardList, FileClock, PackageCheck, Plus, RefreshCw, RotateCcw, ShieldCheck, Truck, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getInitialInventoryProgress } from "@/lib/nexora-initial-approval";
import {
  getMissingReceiptSerials, getNexoraTransferDetail, getReceivingSummary, lineStatusLabel,
  listNexoraTransfers, parseTransferSerials, runNexoraTransferAction,
  transferStatusLabel, validateTransferSerials,
  type NexoraTransfer, type NexoraTransferLine, type TransferDetail, type TransferAction,
} from "@/lib/nexora-transfers";
import type { NexoraSite } from "@/lib/nexora-sites";

const selectStyle = "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const nr = (n: number) => new Intl.NumberFormat("es-CO").format(n);

export const TrasladosMultisedePanel = ({ sites }: { sites: readonly NexoraSite[] }) => {
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [transfers, setTransfers] = useState<NexoraTransfer[]>([]);
  const [activeId, setActiveId] = useState("");
  const [detail, setDetail] = useState<TransferDetail | null>(null);
  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [manifest, setManifest] = useState("");
  const [note, setNote] = useState("");
  const [receiveText, setReceiveText] = useState("");
  const [returnText, setReturnText] = useState("");
  const [confirmReceive, setConfirmReceive] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [confirmDispatch, setConfirmDispatch] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const req = useRef(0);
  const detailReq = useRef(0);
  const locked = useRef(false);

  const network = sites.filter((s) => s.isActive);
  const fromSites = network.filter((s) => network.some((d) => d.parentSiteId === s.id));
  const actualOrigin = fromSites.some((s) => s.id === originId) ? originId : fromSites[0]?.id ?? "";
  const destinations = network.filter((s) => s.parentSiteId === actualOrigin);
  const actualDestination = destinations.some((s) => s.id === destinationId)
    ? destinationId : destinations[0]?.id ?? "";
  const label = (id: string) => sites.find((s) => s.id === id)?.name ?? "Sede no disponible";
  const selected = transfers.find((t) => t.id === activeId) ?? null;

  const load = useCallback(async () => {
    const request = ++req.current;
    setLoading(true);
    try {
      const [progress, records] = await Promise.all([
        getInitialInventoryProgress(), listNexoraTransfers(),
      ]);
      if (request !== req.current) return;
      setApproved(progress.isApproved);
      setTransfers(records);
    } catch (error) {
      if (request === req.current) {
        setApproved(false);
        toast.error(error instanceof Error ? error.message : "No se pudieron consultar los traslados.");
      }
    } finally {
      if (request === req.current) setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) { setDetail(null); return; }
    const request = ++detailReq.current;
    setDetail(null);
    try {
      const record = await getNexoraTransferDetail(id);
      if (request === detailReq.current) setDetail(record);
    } catch (error) {
      if (request === detailReq.current)
        toast.error(error instanceof Error ? error.message : "No fue posible abrir el manifiesto.");
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { req.current += 1; };
  }, [load]);
  useEffect(() => {
    void loadDetail(activeId);
    setReceiveText("");
    setReturnText("");
    setConfirmReceive(false);
    setConfirmReturn(false);
    setConfirmDispatch(false);
    setConfirmCancel(false);
    return () => { detailReq.current += 1; };
  }, [activeId, loadDetail]);

  const operate = async (action: TransferAction, serials: string[] = []) => {
    if (!approved || locked.current) return;
    locked.current = true;
    setWorking(true);
    try {
      const result = await runNexoraTransferAction({
        action,
        transferId: activeId || undefined,
        origin: action === "create" ? actualOrigin : undefined,
        destination: action === "create" ? actualDestination : undefined,
        serials,
        note: action === "create" ? note : undefined,
      });
      if (action === "create") {
        setManifest(""); setNote("");
        setActiveId(result.transferId);
        toast.success(`Traslado TR-${String(result.number ?? "").padStart(6, "0")} creado con ${result.units} IMEI`);
      } else if (action === "receive") {
        toast.success(result.missing
          ? `${result.received} recibidos; ${result.missing} faltantes con documento de retorno pendiente`
          : `Recepción completa: ${result.received} IMEI confirmados`);
      } else if (action === "return") {
        toast.success(`Retorno físico confirmado: ${result.returnedNow} IMEI; faltan ${result.remaining}`);
      } else if (action === "dispatch") {
        toast.success(`${result.sent} IMEI despachados; ninguno disponible en las sedes durante el tránsito`);
      } else {
        toast.success("Borrador cancelado sin mover equipos");
      }
      setReceiveText(""); setReturnText("");
      setConfirmReceive(false); setConfirmReturn(false);
      setConfirmDispatch(false); setConfirmCancel(false);
      await load();
      if (action !== "create") await loadDetail(result.transferId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo ejecutar el traslado.");
    } finally {
      locked.current = false;
      setWorking(false);
    }
  };

  const createSerials = useMemo(() => parseTransferSerials(manifest), [manifest]);
  const receiveSerials = useMemo(() => parseTransferSerials(receiveText), [receiveText]);
  const returnSerials = useMemo(() => parseTransferSerials(returnText), [returnText]);
  const createError = validateTransferSerials(createSerials);
  const receipt = detail ? getReceivingSummary(detail.lines, receiveSerials) : null;
  const receiveError = validateTransferSerials(receiveSerials, true);
  const missingPreview = detail && !receiveError && (receipt?.invalidSerials.length ?? 0)===0
    && (receiveSerials.length>0 || confirmReceive)
    ? getMissingReceiptSerials(detail.lines,receiveSerials) : [];
  const pendingReturns = detail?.lines.filter((l) => l.state === "return_pending") ?? [];
  const returnError = validateTransferSerials(returnSerials);
  const matchingReturnSet = new Set(pendingReturns.map((l) => l.serial.toLowerCase()));
  const wrongReturns = returnSerials.filter((s) => !matchingReturnSet.has(s.toLowerCase()));

  const counts = {
    open: transfers.filter((t) => t.status === "draft" || t.status === "in_transit").length,
    pending: transfers.filter((t) => t.status === "awaiting_returns").length,
    closed: transfers.filter((t) => t.status === "closed").length,
  };

  return (
    <section className="space-y-5" aria-label="Traslados entre sedes">
      <div className="relative overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-white via-cyan-50 to-sky-100 p-5 text-slate-900 shadow-lg shadow-cyan-950/5 dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-cyan-950 dark:text-white dark:shadow-black/20 sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 top-0 h-52 w-52 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-200 dark:border-cyan-400/25 bg-cyan-100 dark:bg-cyan-400/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-cyan-800 dark:text-cyan-200">
              <Truck className="h-3.5 w-3.5" /> Logística multisede
            </p>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">Traslados y recepciones</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Manifiestos por IMEI, despacho verificable, recepción parcial y documentos de retorno físico,
              con trazabilidad independiente del stock comercial actual.
            </p>
          </div>
          <Button variant="outline" className="border-slate-300 bg-white/80 text-slate-900 hover:bg-white dark:border-white/30 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            disabled={working || loading} onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        </div>
        <div className="relative mt-6 grid grid-cols-3 gap-3">
          {[
            ["En preparación / tránsito", counts.open],
            ["Con retorno pendiente", counts.pending],
            ["Cerrados", counts.closed],
          ].map(([title, value]) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white/75 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none p-3 sm:p-4">
              <p className="text-2xl font-bold tabular-nums">{nr(Number(value))}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{title}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span><strong className="text-foreground">Control físico, no disponibilidad comercial.</strong> Los faltantes quedan en retorno pendiente y no vuelven a ninguna sede hasta escanearse en origen. Esta etapa no modifica ventas, pedidos, costos ni estados del inventario anterior.</span>
        </p>
      </div>

      {!approved ? (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <Warehouse className="mx-auto h-11 w-11 text-primary" />
          <h3 className="mt-3 font-bold">Primero debe aprobarse el inventario inicial</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Registra tus ciudades y sedes, coteja físicamente todos los IMEI y firma el acta.
            Ningún traslado podrá despacharse antes de ese control, tampoco mediante la base de datos.
          </p>
          <Button size="sm" className="mt-4" variant="outline" disabled={loading} onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Comprobar aprobación
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Plus className="h-5 w-5" /></span>
              <div>
                <h3 className="font-semibold">Nuevo manifiesto de traslado</h3>
                <p className="mt-1 text-xs text-muted-foreground">Cada operación admite hasta 100 seriales únicos. Solo rutas de abastecimiento configuradas.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nexora-transfer-from">Bodega de origen</Label>
                <select className={selectStyle} id="nexora-transfer-from" value={actualOrigin} disabled={working}
                  onChange={(event) => { setOriginId(event.target.value); setDestinationId(""); }}>
                  {fromSites.length === 0 ? <option value="">Sin rutas configuradas</option> : null}
                  {fromSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nexora-transfer-to">Punto de destino</Label>
                <select className={selectStyle} id="nexora-transfer-to" value={actualDestination} disabled={working}
                  onChange={(event) => setDestinationId(event.target.value)}>
                  {destinations.length === 0 ? <option value="">Sin destinos dependientes</option> : null}
                  {destinations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="nexora-transfer-serials">IMEI / Serial (uno por línea)</Label>
                <Textarea id="nexora-transfer-serials" rows={5} value={manifest} disabled={working}
                  placeholder={"356789012345678\n356789012345679\n356789012345680"}
                  onChange={(event) => setManifest(event.target.value)} />
                <p className="text-xs text-muted-foreground">{createSerials.length} equipos. {createError ?? "Cada IMEI se comprobará contra la sede de origen."}</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="nexora-transfer-note">Observación del traslado (opcional)</Label>
                <Input id="nexora-transfer-note" maxLength={300} value={note} disabled={working}
                  onChange={(event) => setNote(event.target.value)} placeholder="Ej. Abastecimiento del local" />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button disabled={working || Boolean(createError) || !actualOrigin || !actualDestination}
                onClick={() => void operate("create", createSerials)}>
                <Plus className="h-4 w-4" /> Crear manifiesto
              </Button>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)]">
            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="border-b p-4">
                <h3 className="flex items-center gap-2 font-semibold"><ClipboardList className="h-4 w-4 text-primary" /> Traslados recientes</h3>
                <p className="mt-1 text-xs text-muted-foreground">Últimos 40 manifiestos. Selecciona uno para procesarlo.</p>
              </div>
              {transfers.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">Todavía no hay traslados registrados.</p>
              ) : (
                <div className="max-h-[610px] space-y-2 overflow-y-auto p-3">
                  {transfers.map((t) => (
                    <button key={t.id} type="button" disabled={working}
                      onClick={() => setActiveId(t.id)}
                      className={`w-full rounded-xl border p-3 text-left transition hover:border-primary/50 hover:bg-muted/30 ${activeId === t.id ? "border-primary bg-primary/5" : "border-border"}`}>
                      <p className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">TR-{String(t.number).padStart(6, "0")}</span>
                        <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium">{transferStatusLabel[t.status]}</span>
                      </p>
                      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        {label(t.originSiteId)} <ArrowRight className="h-3.5 w-3.5 shrink-0" /> {label(t.destinationSiteId)}
                      </p>
                      <p className="mt-2 text-[11px] text-muted-foreground">{new Date(t.createdAt).toLocaleString("es-CO")}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              {!selected ? (
                <div className="grid min-h-64 place-content-center p-8 text-center">
                  <Truck className="mx-auto h-10 w-10 text-primary" />
                  <h3 className="mt-3 font-semibold">Selecciona un manifiesto</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Aquí aparecerán sus IMEI, el despacho, la recepción y el retorno.</p>
                </div>
              ) : !detail ? (
                <p role="status" className="p-6 text-sm text-muted-foreground">Cargando detalle del traslado...</p>
              ) : (
                <div className="space-y-5 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Manifiesto</p>
                      <h3 className="mt-1 text-xl font-bold">TR-{String(selected.number).padStart(6, "0")}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {label(selected.originSiteId)} → {label(selected.destinationSiteId)}
                      </p>
                    </div>
                    <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">{transferStatusLabel[selected.status]}</span>
                  </div>
                  {selected.note ? <p className="rounded-lg bg-muted/30 p-3 text-sm">{selected.note}</p> : null}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {[
                      ["Enviados", detail.lines.length],
                      ["En destino", detail.lines.filter((l) => l.state === "received").length],
                      ["Retorno pendiente", pendingReturns.length],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xl font-bold tabular-nums">{value}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-xl border">
                    <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-2">
                      <p className="text-sm font-semibold">IMEI del manifiesto</p>
                      <p className="text-xs text-muted-foreground">{detail.lines.length} seriales</p>
                    </div>
                    <div className="max-h-64 divide-y overflow-y-auto">
                      {detail.lines.map((l: NexoraTransferLine) => (
                        <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                          <span className="flex items-center gap-2 break-all font-mono"><Barcode className="h-3.5 w-3.5 shrink-0 text-primary" /> {l.serial}</span>
                          <span className={l.state === "return_pending"
                            ? "font-semibold text-amber-700 dark:text-amber-300"
                            : "text-muted-foreground"}>{lineStatusLabel[l.state]}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selected.status === "draft" ? (
                    <div className="space-y-3 rounded-xl border bg-muted/15 p-4">
                      <h4 className="font-semibold">Confirmar despacho</h4>
                      <p className="text-sm text-muted-foreground">Comprueba físicamente los {detail.lines.length} equipos antes de enviarlos. Al despachar pasan a custodia «en tránsito».</p>
                      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmDispatch}
                        onChange={(e) => setConfirmDispatch(e.target.checked)} /> Confirmo que todos los IMEI están preparados y saldrán del origen.</label>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={working || !confirmCancel}
                          onClick={() => void operate("cancel")}>Cancelar borrador</Button>
                        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={confirmCancel}
                          onChange={(e) => setConfirmCancel(e.target.checked)} /> Anular</label>
                        <Button disabled={working || !confirmDispatch} onClick={() => void operate("dispatch")}>
                          <Truck className="h-4 w-4" /> Despachar {detail.lines.length} equipos
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {selected.status === "in_transit" ? (
                    <div className="space-y-3 rounded-xl border bg-muted/15 p-4">
                      <h4 className="flex items-center gap-2 font-semibold"><PackageCheck className="h-4 w-4 text-primary" /> Recepción por IMEI</h4>
                      <p className="text-sm text-muted-foreground">
                        Introduce exclusivamente los IMEI <strong>recibidos físicamente en destino</strong>.
                        Los que falten generarán automáticamente un documento de devolución pendiente.
                      </p>
                      <Textarea rows={5} value={receiveText} disabled={working} placeholder="Un IMEI recibido por línea"
                        onChange={(event) => { setReceiveText(event.target.value); setConfirmReceive(false); }} />
                      <div className="flex flex-wrap gap-3 text-sm">
                        <p className="font-semibold text-emerald-700 dark:text-emerald-300">{receipt?.received ?? 0} recibidos</p>
                        <p className="font-semibold text-amber-700 dark:text-amber-300">{receipt?.missing ?? 0} faltantes / retorno pendiente</p>
                      </div>
                      {receiveError || (receipt?.invalidSerials.length ?? 0) > 0 ? (
                        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
                          {receiveError ?? "Hay IMEI que no pertenecen al manifiesto."}
                        </p>
                      ) : null}
                      {missingPreview.length > 0 ? (
                        <div className="rounded-lg border border-amber-300/50 bg-amber-50/50 p-3 text-sm dark:bg-amber-500/5">
                          <p className="font-semibold text-amber-800 dark:text-amber-300">
                            Vista previa: {missingPreview.length} IMEI sin confirmar en destino
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            No llegaron según el cotejo actual. Esta lista es provisional hasta confirmar
                            la recepción; no certifica una pérdida ni registra observaciones individuales.
                          </p>
                          <ul className="mt-2 max-h-36 list-disc space-y-1 overflow-y-auto pl-5 text-xs">
                            {missingPreview.map((serial)=><li key={serial} className="font-mono">{serial}</li>)}
                          </ul>
                        </div>
                      ) : null}
                      <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1" checked={confirmReceive}
                          onChange={(e) => setConfirmReceive(e.target.checked)} />
                        Confirmo que he comprobado físicamente estos IMEI en el destino.
                      </label>
                      <Button className="w-full" disabled={working || !confirmReceive || Boolean(receiveError) || (receipt?.invalidSerials.length ?? 0)>0}
                        onClick={() => void operate("receive", receiveSerials)}>
                        <CheckCircle2 className="h-4 w-4" /> Registrar recepción y documentar faltantes
                      </Button>
                    </div>
                  ) : null}

                  {detail.returnDocument ? (
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                      <h4 className="flex items-center gap-2 font-semibold"><FileClock className="h-4 w-4 text-amber-600" /> Documento de devolución pendiente</h4>
                      <p className="mt-1 text-xs text-muted-foreground">DEV-{String(selected.number).padStart(6, "0")} · {detail.returnDocument.expectedCount} IMEI reportados como faltantes · {detail.returnDocument.status === "pending" ? "Sin cerrar" : "Completado"}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Ningún faltante regresa a stock de origen hasta cotejar su llegada física.</p>
                      {detail.missingAudit.state === "verified" ? (
                        <div className="mt-3 rounded-lg border border-emerald-300/50 bg-emerald-50/40 p-3 dark:bg-emerald-500/5">
                          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                            Historial auditado en Supabase: {detail.missingAudit.entries.length} IMEI
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Observación individual «No llegó», usuario y fecha guardados al registrar la recepción.
                            El incidente permanece aunque su retorno físico se confirme después.
                          </p>
                          <ul className="mt-2 max-h-44 list-disc space-y-2 overflow-y-auto pl-5 text-xs">
                            {detail.missingAudit.entries.map((item) => (
                              <li key={item.lineId}>
                                <span className="font-mono font-semibold">{item.serial}</span>
                                {" · No llegó · "}
                                <time dateTime={item.reportedAt}>
                                  {new Date(item.reportedAt).toLocaleString("es-CO",{
                                    dateStyle:"medium",timeStyle:"short",timeZone:"America/Bogota",
                                  })}
                                </time>
                                <span className="block text-muted-foreground">
                                  Usuario que registró: <span className="font-mono">{item.reportedBy}</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p role="status" className="mt-3 rounded-lg border border-amber-300/50 bg-amber-50/50 p-3 text-xs text-amber-900 dark:bg-amber-500/5 dark:text-amber-200">
                          {detail.missingAudit.state === "unavailable"
                            ? "Historial individual pendiente de desplegar en Supabase. La lista de IMEI pendientes es informativa, no una certificación de auditoría."
                            : "Historial incompleto o inconsistente con el manifiesto. No se puede certificar la observación individual hasta corregir los registros del servidor."}
                        </p>
                      )}
                      {pendingReturns.length>0 ? (
                        <div className="mt-3 rounded-lg border bg-background/70 p-3">
                          <p className="text-xs font-semibold">IMEI con estado «No llegó» / retorno pendiente</p>
                          <ul className="mt-2 max-h-36 list-disc space-y-1 overflow-y-auto pl-5 text-xs">
                            {pendingReturns.map((line)=><li key={line.id} className="font-mono">{line.serial}</li>)}
                          </ul>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Estado derivado de custodia pendiente; la observación individual «No llegó»
                            aún requiere persistencia auditada en el servidor.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {selected.status === "awaiting_returns" ? (
                    <div className="space-y-3 rounded-xl border bg-muted/15 p-4">
                      <h4 className="flex items-center gap-2 font-semibold"><RotateCcw className="h-4 w-4 text-primary" /> Comprobar retorno físico al origen</h4>
                      <p className="text-sm text-muted-foreground">Escanea solo los IMEI faltantes que efectivamente hayan regresado a {label(selected.originSiteId)}.</p>
                      <Textarea rows={4} value={returnText} disabled={working} placeholder="IMEI recibido nuevamente en origen, uno por línea"
                        onChange={(event) => { setReturnText(event.target.value); setConfirmReturn(false); }} />
                      {returnError || wrongReturns.length > 0 ? (
                        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
                          {returnError ?? "Hay IMEI que no corresponden a los faltantes."}
                        </p>
                      ) : null}
                      <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1" checked={confirmReturn}
                          onChange={(e) => setConfirmReturn(e.target.checked)} />
                        Confirmo que estos IMEI están físicamente en el origen.
                      </label>
                      <Button className="w-full" disabled={working || !confirmReturn || Boolean(returnError) || wrongReturns.length>0}
                        onClick={() => void operate("return", returnSerials)}>
                        <RotateCcw className="h-4 w-4" /> Registrar retorno comprobado
                      </Button>
                    </div>
                  ) : null}

                  {selected.status === "closed" ? (
                    <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" /> Traslado finalizado y todos los IMEI resueltos.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
};
