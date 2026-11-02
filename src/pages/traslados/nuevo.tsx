import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Barcode, CheckCircle2, CircleAlert,
  ClipboardCheck, Layers3, PackagePlus, RefreshCw, ScanLine,
  ShieldCheck, Trash2, Truck, Warehouse,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  groupDispatchSelection, loadDispatchCatalog, loadDispatchSerials,
  type DispatchCatalog, type DispatchSerial,
} from "@/lib/nexora-transfer-dispatch";
import { checkDispatchOperation } from "@/lib/nexora-transfer-dispatch-check";
import { dispatchMultisiteTransfer } from "@/lib/nexora-transfer-api";
import { validateTransferRoute } from "@/lib/nexora-transfer-rules";

type Stage = "editing" | "unknown" | "canRetry" | "confirmed";

const NewTransferPilot = () => {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<DispatchCatalog | null>(null);
  const [initialError, setInitialError] = useState("");
  const [loading, setLoading] = useState(true);
  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [productId, setProductId] = useState("");
  const [productTerm, setProductTerm] = useState("");
  const [searchImei, setSearchImei] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [candidates, setCandidates] = useState<DispatchSerial[]>([]);
  const [selected, setSelected] = useState<Record<string,DispatchSerial>>({});
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [stage, setStage] = useState<Stage>("editing");
  const [working, setWorking] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const busy = useRef(false);

  useEffect(() => {
    let active=true;
    void loadDispatchCatalog().then(rows => {
      if(active) setCatalog(rows);
    }).catch(reason => {
      if(active) setInitialError(reason instanceof Error ? reason.message : "No se pudo cargar el catálogo.");
    }).finally(() => { if(active) setLoading(false); });
    return () => { active=false; };
  }, []);

  const origin = catalog?.sites.find(site=>site.id===originId);
  const destination = catalog?.sites.find(site=>site.id===destinationId);
  const cityById = new Map(catalog?.cities.map(city=>[city.id,city.name]) ?? []);
  const siteLabel=(site:NonNullable<typeof origin>) =>
    `${site.name} · ${cityById.get(site.city_id)??"Ciudad sin identificar"}`;
  const destinations = (catalog?.sites??[]).filter(site =>
    origin && validateTransferRoute(origin,site).allowed);
  const route = origin && destination ? validateTransferRoute(origin,destination) : null;

  const product = catalog?.products.find(row => row.id===productId);
  const productOptions = (catalog?.products??[]).filter(row => {
    const search=productTerm.trim().toLocaleLowerCase("es-CO");
    return !search || `${row.name} ${row.sku}`.toLocaleLowerCase("es-CO").includes(search);
  });
  const selection = Object.values(selected);
  const selectedIds = new Set(selection.map(unit => unit.id));
  const groups = groupDispatchSelection(selection,catalog?.products??[]);
  const valid = !!origin && !!destination && !!route?.allowed && selection.length>0 &&
    selection.length<=500;
  const frozen = stage!=="editing" || working;
  const visibleCandidates = candidates.filter(unit =>
    unit.serial.toUpperCase().includes(searchImei.trim().toUpperCase()) ||
    (unit.color??"").toLocaleLowerCase("es-CO").includes(searchImei.trim().toLocaleLowerCase("es-CO"))
  ).slice(0,120);

  useEffect(() => {
    let active=true;
    setCandidates([]);setCandidateError("");setLoadingUnits(false);
    if(origin && productId) {
      setLoadingUnits(true);
      void loadDispatchSerials(origin,productId).then(rows => {
        if(active) setCandidates(rows);
      }).catch(reason => {
        if(active) setCandidateError(reason instanceof Error ? reason.message : "No se pudieron consultar los IMEI.");
      }).finally(() => { if(active) setLoadingUnits(false); });
    }
    return () => { active=false; };
  // Read only when identifiers change: both values are derived from stable catalog.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[originId,productId,catalog]);

  const chooseOrigin=(id:string) => {
    if(frozen) return;
    setOriginId(id);setDestinationId("");setProductId("");setSelected({});
    setSearchImei("");setScanValue("");setScanMessage("");
  };
  const chooseProduct=(id:string) => {
    if(frozen) return;
    setProductId(id);setSearchImei("");setScanValue("");setScanMessage("");
  };

  const add = (unit:DispatchSerial) => {
    if(frozen) return;
    if(selected[unit.id]) {
      setScanMessage("Este IMEI ya está seleccionado.");
      return;
    }
    if(Object.keys(selected).length>=500) {
      toast.error("Máximo 500 IMEI por documento. Crea un traslado adicional.");
      return;
    }
    setSelected(current=>({ ...current,[unit.id]:unit }));
    setScanMessage(`IMEI ${unit.serial} agregado al despacho.`);
  };
  const scan = () => {
    if(frozen || loadingUnits) return;
    const id=scanValue.trim().toUpperCase();
    if(!id) return;
    const unit=candidates.find(u=>u.serial.trim().toUpperCase()===id);
    if(!unit){
      setScanMessage("El IMEI no está disponible en esta referencia y sede.");
      toast.error("Este IMEI no está disponible en la referencia seleccionada.");
      return;
    }
    add(unit);
    setScanValue("");
  };

  const submit = async () => {
    if(busy.current || !valid || !origin || !destination || stage==="unknown" || stage==="confirmed") return;
    const id=operationId ?? crypto.randomUUID();
    if(!operationId) setOperationId(id);
    busy.current=true;setWorking(true);
    try {
      const result=await dispatchMultisiteTransfer({
        transferId:id,originSiteId:origin.id,destinationSiteId:destination.id,
        unitIds:selection.map(unit=>unit.id),
      });
      if(result.status!=="en_transito" || result.transferId!==id ||
        (result.dispatchedCount!=null && result.dispatchedCount!==selection.length)) {
        throw new Error("La confirmación no coincide con el despacho. Revisa el documento.");
      }
      setStage("confirmed");setConfirmation("Despacho confirmado en tránsito.");
      toast.success("Traslado despachado y registrado por IMEI.");
    } catch(reason) {
      setStage("unknown");
      toast.error(reason instanceof Error ? reason.message : "El despacho no fue confirmado.");
    } finally { setWorking(false);busy.current=false; }
  };

  const verify = async () => {
    if(!operationId || !origin || !destination || busy.current) return;
    busy.current=true;setWorking(true);
    try {
      const result=await checkDispatchOperation({
        transferId:operationId,originId:origin.id,destinationId:destination.id,
        unitIds:selection.map(unit=>unit.id),
      });
      if(result.result==="confirmed"){
        setStage("confirmed");
        setConfirmation(`El servidor confirmó ${result.code} · ${result.status}.`);
      } else {
        setStage("canRetry");
        toast.info("No existe este documento. Puedes repetir el despacho con el mismo identificador.");
      }
    } catch(reason) {
      setStage("unknown");
      toast.error(reason instanceof Error ? reason.message : "No se pudo verificar. No repitas el envío.");
    } finally { setWorking(false);busy.current=false; }
  };

  if(loading) return (
    <div role="status" className="p-8 text-center text-sm text-muted-foreground">
      <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin" /> Preparando traslado...
    </div>
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Nuevo traslado multisede"
        description="Elige origen, destino y confirma los IMEI que salen físicamente."
        actions={<Button variant="outline" onClick={()=>navigate("/traslados-piloto")}>
          <ArrowLeft className="h-4 w-4" /> Volver a traslados
        </Button>}
      />
      <div className="rounded-xl border border-sky-400/25 bg-sky-500/[0.055] p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-sky-500" /> Despacho seguro · Piloto administrativo
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Cada equipo quedará en tránsito hasta su recepción física. No se permite local a local,
          ni seleccionar un IMEI sin ubicación verificada. El servidor volverá a comprobar todo antes de descontar stock.
        </p>
      </div>
      {initialError || !catalog ? (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <CircleAlert className="mb-2 h-5 w-5 text-amber-600" />
          {initialError || "No fue posible cargar el catálogo de sedes."}
          <p className="mt-2 text-xs text-muted-foreground">Los traslados no se pueden realizar hasta que el servidor multisede esté habilitado.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-3 rounded-2xl border bg-card p-5" aria-label="Origen y destino del traslado">
              <div className="flex items-center gap-2 font-semibold">
                <Warehouse className="h-5 w-5 text-primary" /> Ruta del traslado
              </div>
              <div className="space-y-1.5">
                <label htmlFor="transfer-origin" className="text-xs font-semibold">Origen físico</label>
                <select id="transfer-origin" value={originId} onChange={e=>chooseOrigin(e.target.value)}
                  disabled={frozen} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm">
                  <option value="">Selecciona la bodega o local que envía</option>
                  {catalog.sites.map(site=><option key={site.id} value={site.id}>{siteLabel(site)}</option>)}
                </select>
              </div>
              <div className="flex justify-center text-muted-foreground"><ArrowRight className="h-5 w-5 rotate-90" /></div>
              <div className="space-y-1.5">
                <label htmlFor="transfer-destination" className="text-xs font-semibold">Destino permitido</label>
                <select id="transfer-destination" value={destinationId}
                  onChange={e=>setDestinationId(e.target.value)}
                  disabled={frozen || !origin} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm">
                  <option value="">Selecciona el punto que recibirá</option>
                  {destinations.map(site=><option key={site.id} value={site.id}>{siteLabel(site)}</option>)}
                </select>
              </div>
              {origin && !destinations.length ? <p className="text-xs text-amber-600">No hay destinos activos permitidos para este origen.</p> : null}
              {route && !route.allowed ? <p className="text-xs text-amber-600">{route.reason}</p> : null}
            </section>

            <section className="space-y-3 rounded-2xl border bg-card p-5" aria-label="Referencias para traslado">
              <div className="flex items-center gap-2 font-semibold">
                <Layers3 className="h-5 w-5 text-primary" /> Seleccionar referencia
              </div>
              <div className="space-y-1.5">
                <label htmlFor="transfer-product-search" className="text-xs font-semibold">Buscar modelo o código</label>
                <Input id="transfer-product-search" value={productTerm}
                  disabled={frozen || !origin} onChange={e=>setProductTerm(e.target.value)}
                  placeholder="Ej. iPhone 13, SKU..." />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="transfer-product" className="text-xs font-semibold">Referencia de mercancía</label>
                <select id="transfer-product" value={productId} onChange={e=>chooseProduct(e.target.value)}
                  disabled={frozen || !origin} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm">
                  <option value="">Seleccionar referencia</option>
                  {productOptions.slice(0,160).map(row=><option key={row.id} value={row.id}>
                    {row.name} · {row.sku}
                  </option>)}
                  {product && !productOptions.some(row=>row.id===product.id)
                    ? <option value={product.id}>{product.name} · {product.sku}</option> : null}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Consulta únicamente IMEI disponibles y físicamente conciliados en la sede emisora.
                Puedes agregar equipos de varias referencias al mismo documento.
              </p>
            </section>
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.8fr)]">
            <section className="min-w-0 space-y-3 rounded-2xl border bg-card p-4 sm:p-5" aria-label="IMEI disponibles para despachar">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Barcode className="h-5 w-5 text-primary" /> IMEI de la referencia
                </h2>
                <span className="text-xs text-muted-foreground">{loadingUnits?"Cargando...":`${candidates.length} disponibles`}</span>
              </div>
              <form aria-label="Escanear IMEI para despacho"
                onSubmit={e=>{e.preventDefault();scan();}} className="flex flex-wrap gap-2 sm:flex-nowrap">
                <Input aria-label="IMEI que deseas enviar" value={scanValue}
                  onChange={e=>setScanValue(e.target.value)} disabled={frozen || !productId || loadingUnits}
                  autoComplete="off" inputMode="numeric" className="min-w-0 flex-1 font-mono"
                  placeholder="Escanea un IMEI y pulsa Enter" />
                <Button type="submit" variant="outline"
                  disabled={frozen || !scanValue.trim() || loadingUnits}>
                  <ScanLine className="h-4 w-4" /> Agregar IMEI
                </Button>
              </form>
              <p role="status" className="text-xs text-muted-foreground">
                {scanMessage || "Cada IMEI solo puede agregarse una vez. Máximo 500 equipos por traslado."}
              </p>
              <Input aria-label="Filtrar IMEI o color" disabled={frozen || !productId}
                placeholder="Filtrar por serial o color..." value={searchImei}
                onChange={e=>setSearchImei(e.target.value)} />
              {candidateError ? <p role="alert" className="rounded-xl border border-amber-500/25 p-3 text-sm text-amber-600">{candidateError}</p> : null}
              <div className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
                {!productId ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Selecciona una referencia para ver sus IMEI.</p>
                : loadingUnits ? <p className="p-6 text-center text-xs text-muted-foreground">Buscando IMEI del punto físico...</p>
                : !visibleCandidates.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No hay IMEI para mostrar en esta referencia.</p>
                : visibleCandidates.map(unit=>(
                  <div key={unit.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-sm font-semibold">{unit.serial}</p>
                      {unit.color ? <p className="text-xs text-muted-foreground">Color: {unit.color}</p> : null}
                    </div>
                    <Button size="sm" variant={selectedIds.has(unit.id)?"secondary":"outline"}
                      disabled={frozen || selectedIds.has(unit.id) || selection.length>=500}
                      onClick={()=>add(unit)}>
                      {selectedIds.has(unit.id)? <CheckCircle2 className="h-4 w-4" /> : <PackagePlus className="h-4 w-4" />}
                      {selectedIds.has(unit.id)?"Agregado":"Agregar"}
                    </Button>
                  </div>
                ))}
              </div>
              {candidates.length>120 ? <p className="text-xs text-muted-foreground">
                Se muestran hasta 120 equipos a la vez. Filtra o escanea para encontrar otros IMEI.
              </p> : null}
            </section>

            <section className="min-w-0 space-y-3 rounded-2xl border bg-card p-4 sm:p-5" aria-label="Resumen del despacho">
              <div className="flex items-center gap-2 font-semibold">
                <ClipboardCheck className="h-5 w-5 text-primary" /> Resumen del envío
              </div>
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="text-3xl font-bold tabular-nums">{selection.length}</p>
                <p className="text-xs text-muted-foreground">IMEI seleccionados · máximo 500</p>
              </div>
              {groups.length===0 ? (
                <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Escanea o selecciona los celulares que viajarán.</p>
              ) : (
                <div className="space-y-2">
                  {groups.map(group=>(
                    <div key={group.productId} className="flex items-start justify-between gap-2 rounded-xl border p-3">
                      <span className="min-w-0 text-xs font-medium">{group.reference}</span>
                      <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-sm font-bold text-primary">{group.quantity}</span>
                    </div>
                  ))}
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {selection.map(unit=>(
                      <div key={unit.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-muted/30">
                        <span className="break-all font-mono text-[11px]">{unit.serial}</span>
                        <Button type="button" size="icon" variant="ghost" aria-label={`Quitar IMEI ${unit.serial}`}
                          disabled={frozen} onClick={()=>setSelected(current=>{
                            const next={...current};delete next[unit.id];return next;
                          })}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-3 text-xs leading-relaxed text-muted-foreground">
                <Truck className="mb-2 h-4 w-4 text-primary" />
                El despacho marcará estos equipos «En tránsito» en una sola operación. No podrán venderse mientras viajan.
              </div>
              {stage==="unknown" ? (
                <div role="alert" className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                  <p className="font-semibold">Estado del despacho sin confirmar</p>
                  <p>Es posible que el servidor haya guardado el envío. Verifica el identificador antes de cualquier reintento.</p>
                  <Button variant="outline" disabled={working} onClick={()=>void verify()}>
                    <RefreshCw className="h-4 w-4" /> Verificar despacho en servidor
                  </Button>
                </div>
              ) : stage==="canRetry" ? (
                <p role="status" className="rounded-xl border p-3 text-xs">
                  La verificación no encontró un documento. Puedes reintentar con el mismo identificador, sin cambiar los IMEI.
                </p>
              ) : stage==="confirmed" ? (
                <div role="status" className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                  <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5" /> Despacho confirmado</p>
                  <p className="text-xs">{confirmation}</p>
                  <Button onClick={()=>navigate("/traslados-piloto")}>Ver acta de traslado <ArrowRight className="h-4 w-4" /></Button>
                </div>
              ) : null}
              {stage!=="confirmed" && stage!=="unknown" ? (
                <Button className="w-full" disabled={!valid || working || loadingUnits || !!candidateError}
                  onClick={()=>void submit()}>
                  <Truck className="h-4 w-4" />
                  {working ? "Confirmando con el servidor..." : stage==="canRetry" ? "Reintentar el mismo despacho" : "Confirmar despacho físico"}
                </Button>
              ) : null}
            </section>
          </div>
        </>
      )}
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Este módulo está reservado al piloto. No estará disponible para operar la plataforma de producción hasta completar las pruebas de seguridad.
        <Link to="/traslados-piloto" className="font-semibold text-primary underline-offset-4 hover:underline">Volver a documentos</Link>
      </p>
    </div>
  );
};
export default NewTransferPilot;
