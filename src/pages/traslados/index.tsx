import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight, ArrowRight, CircleAlert, ClipboardCheck, Clock3,
  PackageCheck, PackageSearch, RefreshCw, Search, ShieldCheck, Truck, Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TransferReceiptChecklist } from "@/components/transfers/TransferReceiptChecklist";
import { OriginReturnChecklist } from "@/components/transfers/OriginReturnChecklist";
import { receiveMultisiteTransfer, verifyMultisiteOriginReturn } from "@/lib/nexora-transfer-api";
import {
  loadTransferDetail, loadTransferInbox,
  TransferModuleUnavailableError, type TransferDetail, type TransferView,
} from "@/lib/nexora-transfer-inbox";
import type { TransferReceiptPlan } from "@/lib/nexora-transfer-rules";
import type { OriginReturnReview } from "@/lib/nexora-transfer-rpc";

type ViewFilter = "pendientes" | "envios" | "devoluciones" | "todos";

const statusText: Record<string, string> = {
  borrador: "Borrador",
  en_transito: "En tránsito",
  pendiente_recepcion: "Por verificar",
  recibido: "Recibido",
  recepcion_parcial: "Recibido con faltantes",
  incidencia: "Incidencia pendiente",
  cancelado: "Cancelado",
};

const statusTone = (status: string) => (
  status === "incidencia" || status === "recepcion_parcial" ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : status === "recibido" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300"
);

const isPending = (transfer: TransferView) =>
  (transfer.kind === "envio" && transfer.status === "en_transito")
  || (transfer.kind === "retorno_faltantes" && transfer.status === "pendiente_recepcion")
  || transfer.status === "incidencia";

const TransferListRow = ({
  transfer, selected, onSelect,
}: { transfer: TransferView; selected: boolean; onSelect: () => void }) => (
  <button type="button" onClick={onSelect}
    aria-pressed={selected}
    className={`w-full rounded-xl border p-3.5 text-left transition-all hover:border-primary/35 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-primary/45 bg-primary/[0.06] shadow-sm" : "bg-background/60"}`}
  >
    <div className="flex flex-wrap items-start justify-between gap-2">
      <span className="font-mono text-xs font-semibold">{transfer.code}</span>
      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(transfer.status)}`}>
        {statusText[transfer.status] ?? transfer.status}
      </span>
    </div>
    <div className="mt-3 flex items-center gap-2 text-sm">
      <Warehouse className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 truncate">{transfer.originLabel}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{transfer.destinationLabel}</span>
    </div>
    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span>{transfer.kind === "retorno_faltantes" ? "Devolución de faltantes" : "Traslado de mercancía"}</span>
      <span>{new Date(transfer.created_at).toLocaleDateString("es-CO")}</span>
    </div>
  </button>
);

/** Piloto de administración. No se publica en main hasta validar staging y RLS. */
const TrasladosPiloto = () => {
  const [items, setItems] = useState<TransferView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TransferDetail | null>(null);
  const [filter, setFilter] = useState<ViewFilter>("pendientes");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const rows = await loadTransferInbox();
    setItems(rows);
    setSelectedId(current => current && rows.some(row => row.id === current) ? current : (rows[0]?.id ?? null));
    setError(null);
  };

  useEffect(() => {
    let active = true;
    void loadTransferInbox().then(rows => {
      if (active) {
        setItems(rows);
        setSelectedId(rows[0]?.id ?? null);
        setError(null);
      }
    }).catch(reason => {
      if (active) setError(reason instanceof TransferModuleUnavailableError
        ? reason.message : reason instanceof Error ? reason.message : "No se pudieron cargar los traslados.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const selected = items.find(item => item.id === selectedId);
  useEffect(() => {
    let active = true;
    if (!selected) { setDetail(null); return; }
    setDetail(null);
    setDetailLoading(true);
    void loadTransferDetail(selected).then(value => {
      if (active) setDetail(value);
    }).catch(reason => {
      if (active) toast.error(reason instanceof Error ? reason.message : "No se pudo cargar el acta.");
    }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selected]);

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-CO");
    return items.filter(item => {
      const typeMatches = filter === "todos"
        || (filter === "pendientes" && isPending(item))
        || (filter === "envios" && item.kind === "envio")
        || (filter === "devoluciones" && item.kind === "retorno_faltantes");
      return typeMatches && (!term || [item.code,item.originLabel,item.destinationLabel,item.status]
        .some(field => field.toLocaleLowerCase("es-CO").includes(term)));
    });
  }, [items,filter,search]);

  const refreshAfterSave = async () => {
    try { await reload(); }
    catch {
      // La RPC ya confirmó. No indicar fallo ni reejecutar un movimiento
      // solamente porque la consulta posterior no tuvo conexión.
      toast.warning("Operación confirmada. Actualiza el panel para ver su estado.");
    }
  };

  const confirmReceipt = async (plan: TransferReceiptPlan) => {
    if (!detail || detail.transfer.kind !== "envio" || detail.transfer.status !== "en_transito") {
      throw new Error("Este traslado no está pendiente de recepción.");
    }
    await receiveMultisiteTransfer({
      transferId: detail.transfer.id,
      dispatched: detail.units.map(unit => ({ unitId:unit.unitId, serial:unit.serial })),
      plan,
    });
    await refreshAfterSave();
  };

  const confirmReturn = async (review: OriginReturnReview[]) => {
    if (!detail || detail.transfer.kind !== "retorno_faltantes"
      || detail.transfer.status !== "pendiente_recepcion") {
      throw new Error("Esta devolución ya no está pendiente.");
    }
    await verifyMultisiteOriginReturn({
      returnId: detail.transfer.id,
      pendingUnits: detail.units.map(unit => ({ unitId:unit.unitId, serial:unit.serial })),
      review,
    });
    await refreshAfterSave();
  };

  const pendingCount = items.filter(isPending).length;
  const inTransitCount = items.filter(item => item.status === "en_transito").length;
  const incidents = items.filter(item => item.status === "incidencia").length;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Traslados multisede" description="Control físico de envíos, recepciones e incidencias por IMEI."
        actions={<Button variant="outline" disabled={loading} onClick={() => void reload().catch(e =>
          toast.error(e instanceof Error ? e.message : "No se pudo actualizar."))}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </Button>}
      />
      <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-sky-500" /> Módulo piloto · Operaciones protegidas</div>
        <p className="mt-1">Solo Administrador durante las pruebas. La activación definitiva depende de la migración de permisos por sede.</p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label:"Por atender",value:pendingCount,Icon:ClipboardCheck },
          { label:"En tránsito",value:inTransitCount,Icon:Truck },
          { label:"Con incidencias",value:incidents,Icon:CircleAlert },
        ].map(({label,value,Icon}) => (
          <div key={label} className="rounded-xl border bg-card p-3.5 sm:p-5">
            <Icon className="h-4 w-4 text-primary" />
            <p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {error ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm">
          <CircleAlert className="h-5 w-5 shrink-0 text-amber-600" />
          <div><p className="font-semibold">No se puede abrir el módulo</p><p className="mt-1">{error}</p></div>
        </div>
      ) : loading ? (
        <div role="status" className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
          <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin" /> Cargando traslados...
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.6fr)]">
          <section aria-label="Bandeja de traslados" className="min-w-0 space-y-3 rounded-2xl border bg-card p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <PackageSearch className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Documentos</h2>
              <span className="ml-auto text-xs text-muted-foreground">Últimos 100</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input aria-label="Buscar traslado por código o sede" value={search}
                onChange={e => setSearch(e.target.value)} placeholder="Buscar código, ciudad o sede..."
                className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="Filtrar traslados">
              {([
                ["pendientes","Por atender"],["envios","Envíos"],
                ["devoluciones","Devoluciones"],["todos","Todos"],
              ] as const).map(([key,label]) => (
                <button key={key} type="button" aria-pressed={filter===key}
                  onClick={() => setFilter(key)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${filter===key ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
              {rows.length ? rows.map(transfer => (
                <TransferListRow key={transfer.id} transfer={transfer}
                  selected={transfer.id === selectedId}
                  onSelect={() => setSelectedId(transfer.id)} />
              )) : (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No hay traslados que coincidan con este filtro.
                </div>
              )}
            </div>
          </section>

          <section aria-label="Detalle del traslado" className="min-w-0">
            {!selected ? (
              <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
                <ArrowLeftRight className="mx-auto mb-3 h-7 w-7 text-primary" />
                <p className="font-semibold text-foreground">Selecciona un traslado</p>
                <p className="mt-1 text-sm">Aquí podrás consultar la recepción física y su historial.</p>
              </div>
            ) : detailLoading || !detail || detail.transfer.id !== selected.id ? (
              <div role="status" className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
                <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin" /> Cargando IMEI del documento...
              </div>
            ) : detail.units.length === 0 ? (
              <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
                Este traslado no tiene IMEI verificados. No es posible confirmar una recepción vacía.
              </div>
            ) : detail.transfer.kind === "envio" && detail.transfer.status === "en_transito" ? (
              <TransferReceiptChecklist key={detail.transfer.id} transferCode={detail.transfer.code}
                originName={detail.transfer.originLabel} destinationName={detail.transfer.destinationLabel}
                dispatched={detail.units.map(unit => ({ unitId:unit.unitId,serial:unit.serial }))}
                onConfirm={confirmReceipt} />
            ) : detail.transfer.kind === "retorno_faltantes" && detail.transfer.status === "pendiente_recepcion" ? (
              <OriginReturnChecklist key={detail.transfer.id} returnId={detail.transfer.id}
                returnCode={detail.transfer.code} warehouseName={detail.transfer.destinationLabel}
                units={detail.units.map(unit => ({ unitId:unit.unitId,serial:unit.serial }))}
                onConfirm={confirmReturn} />
            ) : (
              <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <div className="bg-gradient-to-br from-slate-950 to-sky-950 p-5 text-white sm:p-6">
                  <span className="text-xs font-semibold text-sky-200">ACTA DE TRASLADO</span>
                  <h2 className="mt-2 break-all font-mono text-xl font-bold">{detail.transfer.code}</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {detail.transfer.originLabel} → {detail.transfer.destinationLabel}
                  </p>
                </div>
                <div className="space-y-4 p-4 sm:p-6">
                  <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(detail.transfer.status)}`}>
                    {statusText[detail.transfer.status] ?? detail.transfer.status}
                  </span>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock3 className="h-4 w-4" /> {detail.units.length} IMEI registrados
                  </div>
                  <div className="max-h-[500px] space-y-2 overflow-y-auto">
                    {detail.units.map(unit => (
                      <div key={unit.unitId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                        <span className="break-all font-mono text-sm font-semibold">{unit.serial}</span>
                        <span className="text-xs text-muted-foreground">
                          {unit.receiptStatus === "recibido" ? "Recibido" : unit.receiptStatus === "no_llego" ? "No llegó" : "Por verificar"}
                        </span>
                        {unit.observation ? <p className="basis-full text-xs text-amber-600">{unit.observation}</p> : null}
                      </div>
                    ))}
                  </div>
                  {detail.transfer.status === "incidencia" ? (
                    <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs">
                      Las unidades que no aparecen físicamente continúan bloqueadas.
                      Su recuperación requiere un registro individual y autorización del servidor.
                    </p>
                  ) : (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <PackageCheck className="h-4 w-4" /> Acta consultable sin modificar inventario.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default TrasladosPiloto;
