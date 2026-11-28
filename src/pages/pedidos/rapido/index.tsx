import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, FileText, Package, ScanLine, ShoppingBag, X, Zap } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { OptionSelect } from "@/components/shared/option-select";
import { PageHeader } from "@/components/shared/page-header";
import { SerialScanInput } from "@/components/shared/serial-scan-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import { useApp } from "@/hooks/use-app";
import { currentQuickOrderDraftKey, readQuickOrderDraft, writeQuickOrderDraft, clearConfirmedQuickOrderDraft, emptyQuickOrderDraft, type QuickOrderDraft, type QuickOrderColorBatch } from "@/lib/quick-order-draft";
import { crearPedidoRapidoPorSeriales, previewQuickOrderUnit, type QuickOrderSerialInput } from "@/lib/actions/orders-quick";
import { mayoristaGroupDeProducto, esProductoRepuesto } from "@/lib/products";
import { normalizarColor, variantePorColor } from "@/lib/color-variants";

import "./pedido-rapido.css";

type QuickGroup = {
  key: string;
  productId: string;
  name: string;
  sku: string;
  imageUrl?: string;
  condition: string;
  color: string;
  serials: QuickOrderSerialInput[];
};

/**
 * Escanea primero, guarda una sola vez. El borrador nunca reserva IMEI ni crea
 * pedidos vacíos. Al confirmar, la acción normal crea, serializa y prepara.
 */
const PedidoRapido = () => {
  const { user } = useApp();
  const draftKey = currentQuickOrderDraftKey(user?.id);
  return <PedidoRapidoEditor key={draftKey ?? user?.id ?? "no-storage"} draftKey={draftKey} />;
};

const PedidoRapidoEditor = ({ draftKey }: { draftKey: string | null }) => {
  const { db } = useStore();
  const { refrescarSerial } = useApp();
  const latestDbRef = useRef(db);
  const renderedDbRef = useRef(db);
  if (renderedDbRef.current !== db) {
    renderedDbRef.current = db;
    latestDbRef.current = db;
  }
  const navigate = useNavigate();
  const runAction = useRunAction();
  const [initial] = useState(() => readQuickOrderDraft(draftKey));
  const [customerId, setCustomerId] = useState(initial.draft.customerId);
  const customerRef = useRef(initial.draft.customerId);
  const [serials, setSerials] = useState<QuickOrderSerialInput[]>(initial.draft.serials);
  const serialsRef = useRef<QuickOrderSerialInput[]>(initial.draft.serials);
  const [draftStatus, setDraftStatus] = useState<"empty" | "restored" | "saved" | "unavailable">(initial.status);
  const [pendingSerial, setPendingSerial] = useState(initial.draft.pendingSerial);
  const pendingRef = useRef(initial.draft.pendingSerial);
  const [colorBatch, setColorBatch] = useState(initial.draft.colorBatch);
  const batchRef = useRef(initial.draft.colorBatch);
  const [batchColor, setBatchColor] = useState("");
  const [batchQuantity, setBatchQuantity] = useState("1");
  const updatePending = (serial?: string) => { pendingRef.current = serial; setPendingSerial(serial); };
  const updateBatch = (batch?: QuickOrderColorBatch) => { batchRef.current = batch; setColorBatch(batch); };
  const saveDraft = (customer: string, entries: QuickOrderSerialInput[]) => {
    const saved = writeQuickOrderDraft(draftKey, { version: 1, customerId: customer, serials: entries, pendingSerial: pendingRef.current, colorBatch: batchRef.current });
    setDraftStatus(saved ? (customer || entries.length ? "saved" : "empty") : "unavailable");
  };
  const changeCustomer = (next: string) => {
    if (confirmingRef.current || pendingRef.current || batchRef.current) return;
    customerRef.current = next;
    setCustomerId(next);
    saveDraft(next, serialsRef.current);
  };
  const [confirming, setConfirming] = useState(false);
  const confirmingRef = useRef(false);

  useEffect(() => {
    if (!(customerId || serials.length) || (draftStatus !== "unavailable" && !confirming)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [customerId, serials.length, draftStatus, confirming]);

  const customers = useMemo(() => db.customers
    .filter((customer) => customer.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, "es")), [db.customers]);
  const customer = customers.find((item) => item.id === customerId);

  const activeReservations = useMemo(() => {
    const orders = new Set(db.orders.filter(o => o.status === "en_preparacion" || o.status === "preparado").map(o => o.id));
    const items = new Set(db.orderItems.filter(i => orders.has(i.orderId)).map(i => i.id));
    return new Set(db.orderItemUnits.filter(a => items.has(a.orderItemId)).map(a => a.unitId));
  }, [db.orders, db.orderItems, db.orderItemUnits]);

  const validateAvailable = (raw: string): string | null => {
    const serial = raw.trim();
    const source = latestDbRef.current;
    const selected = source.customers.find(item => item.id === customerRef.current && item.isActive);
    if (!selected) return "Primero selecciona un cliente activo.";
    if (!serial) return "Escribe o escanea un IMEI.";
    if (serialsRef.current.some((entry) => entry.serial.toLocaleLowerCase("es") === serial.toLocaleLowerCase("es"))) {
      return "Ese serial ya está agregado al pedido.";
    }
    const preview = previewQuickOrderUnit(source, serial);
    if (!preview) return "El serial " + serial + " no existe en inventario.";
    if (!preview.product.isActive) return "Esta referencia no está activa.";
    if (preview.unit.status !== "en_bodega") return "El serial no está disponible en bodega.";
    const reserved = source === db ? activeReservations.has(preview.unit.id) : source.orderItemUnits.some(a => {
      if (a.unitId !== preview.unit.id) return false;
      const line = source.orderItems.find(i => i.id === a.orderItemId);
      const order = line && source.orders.find(o => o.id === line.orderId);
      return order?.status === "en_preparacion" || order?.status === "preparado";
    });
    if (reserved) return "Este serial ya está reservado en otro pedido.";
    if (esProductoRepuesto(source, preview.product)) return "Los repuestos se agregan por cantidad en Pedido normal.";
    if (selected.categoriaMayorista && selected.categoriaMayorista !== "ambos" &&
      mayoristaGroupDeProducto(source, preview.product) !== selected.categoriaMayorista) {
      return "El cliente no tiene habilitada esa categoría de productos.";
    }
    return null;
  };

  const validateSerial = (raw: string): string | null => {
    if (confirmingRef.current) return "Se está confirmando el pedido.";
    if (pendingRef.current) return "Define el color y la cantidad del lote antes de seguir.";
    const problem = validateAvailable(raw);
    if (problem) return problem;
    const batch = batchRef.current;
    if (batch) {
      const preview = previewQuickOrderUnit(latestDbRef.current, raw);
      if (!preview || preview.product.id !== batch.productId || preview.unit.condition !== batch.condition)
        return "Este IMEI no corresponde a la referencia y condición del lote activo.";
      if (!variantePorColor(preview.product, batch.color) || (preview.unit.color &&
          normalizarColor(preview.unit.color).toLocaleLowerCase("es") !== normalizarColor(batch.color).toLocaleLowerCase("es")))
        return "Este IMEI tiene un color diferente al lote activo.";
    }
    return null;
  };

  const recoverValidation = async (serial: string, problem: string): Promise<string | null> => {
    if (!refrescarSerial || !(/no existe en inventario|no está disponible en bodega|reservado en otro pedido/.test(problem))) return problem;
    const actual = await refrescarSerial(serial);
    if (!actual) return problem;
    latestDbRef.current = actual;
    return validateSerial(serial);
  };

  const appendEntry = (entry: QuickOrderSerialInput) => {
    serialsRef.current = [...serialsRef.current, entry];
    setSerials(serialsRef.current);
    saveDraft(customerRef.current, serialsRef.current);
  };

  const addScan = (raw: string) => {
    if (confirmingRef.current) return;
    const serial = raw.trim();
    const problem = validateSerial(serial);
    if (problem) { toast.error(problem); return; }
    const preview = previewQuickOrderUnit(latestDbRef.current, serial);
    if (!preview) return;
    const batch = batchRef.current;
    if (batch) {
      const captured = [...batch.serials, preview.unit.serial];
      const complete = captured.length === batch.quantity;
      updateBatch(complete ? undefined : { ...batch, serials: captured });
      appendEntry({ serial: preview.unit.serial, color: batch.color });
      toast.success(complete ? "Lote completado · " + batch.color : captured.length + "/" + batch.quantity + " · " + batch.color, { duration: 1350 });
      return;
    }
    if (preview.colors.length) {
      updatePending(preview.unit.serial);
      setBatchColor(preview.suggestedColor ?? "");
      setBatchQuantity("1");
      saveDraft(customerRef.current, serialsRef.current);
      return;
    }
    appendEntry({ serial: preview.unit.serial });
    toast.success(preview.product.name + " agregado", { duration: 1350 });
  };

  const pendingPreview = pendingSerial ? previewQuickOrderUnit(db, pendingSerial) : null;
  const chosenColor = batchColor || pendingPreview?.suggestedColor || "";
  const startBatch = () => {
    const serial = pendingRef.current;
    if (!serial || confirmingRef.current) return;
    const problem = validateAvailable(serial);
    const preview = previewQuickOrderUnit(latestDbRef.current, serial);
    const color = variantePorColor(preview?.product, chosenColor)?.color;
    const quantity = Number(batchQuantity);
    if (problem || !preview || !color || !Number.isSafeInteger(quantity) || quantity < 1 ||
        (preview.unit.color && normalizarColor(preview.unit.color).toLocaleLowerCase("es") !== normalizarColor(color).toLocaleLowerCase("es"))) {
      toast.error(problem || "Selecciona un color compatible y una cantidad entera mayor que cero.");
      return;
    }
    updatePending(undefined);
    updateBatch(quantity > 1 ? { productId: preview.product.id, condition: preview.unit.condition, color, quantity, serials: [preview.unit.serial] } : undefined);
    appendEntry({ serial: preview.unit.serial, color });
    toast.success(quantity === 1 ? "Lote completado" : "Primer IMEI incluido · faltan " + (quantity - 1));
  };
  const cancelPending = () => {
    updatePending(undefined);
    saveDraft(customerRef.current, serialsRef.current);
  };
  const finishBatch = () => {
    updateBatch(undefined);
    saveDraft(customerRef.current, serialsRef.current);
  };

  const changeEntries = (next: QuickOrderSerialInput[]) => {
    if (confirmingRef.current) return;
    const batch = batchRef.current;
    if (batch) {
      const remaining = batch.serials.filter((serial) => next.some((entry) => entry.serial === serial && entry.color === batch.color));
      updateBatch(remaining.length ? { ...batch, serials: remaining } : undefined);
    }
    serialsRef.current = next;
    setSerials(next);
    saveDraft(customerRef.current, next);
  };

  const discardDraft = () => {
    if (confirmingRef.current) return;
    updatePending(undefined);
    updateBatch(undefined);
    customerRef.current = "";
    serialsRef.current = [];
    setCustomerId("");
    setSerials([]);
    setDraftStatus(writeQuickOrderDraft(draftKey, emptyQuickOrderDraft()) ? "empty" : "unavailable");
  };

  const copySerial = async (serial: string) => {
    try {
      await navigator.clipboard.writeText(serial);
      toast.success("IMEI copiado", { duration: 1000 });
    } catch {
      toast.error("No se pudo copiar el IMEI.");
    }
  };

  const changeColor = (serial: string, color: string) => {
    changeEntries(serialsRef.current.map((entry) => entry.serial === serial ? { ...entry, color } : entry));
  };

  const groups = useMemo(() => {
    const mapping = new Map<string, QuickGroup>();
    for (const entry of serials) {
      const preview = previewQuickOrderUnit(db, entry.serial);
      if (!preview) continue;
      const color = entry.color ?? preview.suggestedColor ?? "";
      const key = [preview.product.id, preview.unit.condition, color].join("|");
      const prev = mapping.get(key);
      if (prev) prev.serials.push(entry);
      else mapping.set(key, {
        key,
        productId: preview.product.id,
        name: preview.product.name,
        sku: preview.product.sku,
        imageUrl: preview.product.imageUrl,
        condition: preview.unit.condition,
        color,
        serials: [entry],
      });
    }
    return [...mapping.values()];
  }, [db, serials]);

  const missingColors = serials.filter((entry) => {
    const preview = previewQuickOrderUnit(db, entry.serial);
    return Boolean(preview?.colors.length && !normalizarColor(entry.color || preview.suggestedColor));
  }).length;
  const missingEntries = serials.filter((entry) => !previewQuickOrderUnit(db, entry.serial));
  const changedStock = serials.some((entry) => {
    const preview = previewQuickOrderUnit(db, entry.serial);
    return !preview || !preview.product.isActive || preview.unit.status !== "en_bodega" || activeReservations.has(preview.unit.id);
  });
  const canSubmit = Boolean(customer && serials.length && !missingColors && !changedStock && !pendingSerial && !colorBatch && !confirming && !runAction.pending);

  const confirm = async () => {
    if (confirmingRef.current || !canSubmit) return;
    confirmingRef.current = true;
    setConfirming(true);
    const submitted: QuickOrderDraft = { version: 1, customerId: customerRef.current, serials: [...serialsRef.current] };
    try {
      const order = await runAction(
        (latestDb, actor) => crearPedidoRapidoPorSeriales(latestDb, actor, {
          customerId: submitted.customerId,
          serials: submitted.serials,
        }),
        { key: "crear-pedido-rapido", weighty: true, deferOptimistic: true },
      );
      if (order) {
        clearConfirmedQuickOrderDraft(draftKey, submitted);
        toast.success("Pedido preparado. Los IMEI quedaron reservados.");
        navigate("/pedidos/" + order.id);
      }
    } finally {
      confirmingRef.current = false;
      setConfirming(false);
    }
  };

  return (
    <main className="nx-quick-order space-y-3">
      <Button asChild variant="ghost" size="sm" className="nx-quick-back">
        <Link to="/pedidos"><ArrowLeft className="h-4 w-4" /> Volver a pedidos</Link>
      </Button>

      <header className="nx-quick-hero">
        <PageHeader
          className="nx-quick-hero-heading flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          title={<span className="nx-quick-heading-title"><Zap className="h-5 w-5" aria-hidden="true" /> Pedido rápido por seriales</span>}
          description="Selecciona el cliente, escanea los equipos y confirma."
          actions={<Button variant="outline" size="sm" asChild><Link to="/pedidos/nuevo"><ShoppingBag className="h-4 w-4" /> Pedido normal</Link></Button>}
        />
      </header>

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2" aria-label="Borrador del pedido rápido">
        <div role="status" className="min-w-0 text-xs">
          <p className={draftStatus === "unavailable" ? "font-semibold text-warning" : "font-semibold text-primary"}>
            {draftStatus === "restored" ? "Borrador recuperado" : draftStatus === "saved" ? "Borrador guardado en este dispositivo" : draftStatus === "empty" ? "Autoguardado local activo" : "No se pudo recuperar o guardar el borrador"}
          </p>
          <p className="text-muted-foreground">{draftStatus === "unavailable" ? "No salgas ni recargues sin confirmar; el borrador puede no estar guardado." : "Puedes volver a este mismo espacio Next sin perder la captura. No reserva equipos."}</p>
        </div>
        {customerId || serials.length || draftStatus === "unavailable" ? (
          <ConfirmDialog
            trigger={<Button type="button" variant="outline" size="sm" className="text-destructive" disabled={confirming}>Descartar borrador</Button>}
            title="Descartar borrador"
            description="Se eliminarán el cliente y los IMEI capturados en este espacio Next. No se modificará el inventario."
            confirmLabel="Descartar borrador"
            destructive
            onConfirm={discardDraft}
          />
        ) : null}
      </section>

      <section className="nx-quick-customer">
        <div className="nx-quick-section-title">
          <span className="nx-quick-section-number">01</span>
          <div><h2>Cliente del pedido</h2><p>Selecciona el comprador.</p></div>
        </div>
        <OptionSelect
          value={customerId}
          onChange={changeCustomer}
          disabled={confirming || Boolean(pendingSerial || colorBatch)}
          options={customers.map((item) => ({ value: item.id, label: item.name }))}
          placeholder="Selecciona un cliente"
          emptyLabel="Selecciona un cliente"
          triggerClassName="nx-quick-customer-picker"
        />
        {customer?.categoriaMayorista ? <p className="nx-quick-customer-hint">Categoría habilitada: {customer.categoriaMayorista === "ambos" ? "Tecnología y repuestos" : customer.categoriaMayorista}</p> : null}
      </section>

      <div className="nx-quick-workspace">
        <section className="nx-quick-scan-panel">
          <div className="nx-quick-section-title">
            <span className="nx-quick-section-number">02</span>
            <div><h2>Escanear serial</h2><p>Lector, cámara o teclado.</p></div>
          </div>
          {pendingSerial ? (
            <div className="mt-3 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3" aria-label="Configurar lote de color">
              <div>
                <p className="text-sm font-semibold">Configurar lote de color</p>
                <p className="text-xs text-muted-foreground">{pendingPreview?.product.name ?? "Referencia no disponible"} · {pendingPreview?.unit.condition ?? ""}</p>
                <p className="break-all font-mono text-xs">{pendingSerial}</p>
              </div>
              <div className="space-y-1 text-xs font-medium">
                <p>Color del lote</p>
                <OptionSelect value={chosenColor} onChange={setBatchColor}
                  options={(pendingPreview?.colors ?? []).filter((color) => !pendingPreview?.unit.color ||
                    normalizarColor(color).toLocaleLowerCase("es") === normalizarColor(pendingPreview.unit.color).toLocaleLowerCase("es")).map((color) => ({ value: color, label: color }))}
                  placeholder="Seleccionar color" />
              </div>
              <label className="block space-y-1 text-xs font-medium">
                <span>Cantidad total del lote (incluye el primer IMEI)</span>
                <Input type="number" min={1} step={1} value={batchQuantity} onChange={(e) => setBatchQuantity(e.target.value)} />
              </label>
              <Button type="button" className="w-full" onClick={startBatch} disabled={!chosenColor || !pendingPreview || !Number.isSafeInteger(Number(batchQuantity)) || Number(batchQuantity) < 1}>Iniciar lote</Button>
              <Button type="button" variant="outline" className="w-full" onClick={cancelPending}>Cancelar primer IMEI</Button>
            </div>
          ) : (
          <div className="nx-quick-scanner">
            <SerialScanInput
              onScan={addScan}
              validate={validateSerial}
              recoverValidation={recoverValidation}
              autoFocus={Boolean(customer)}
              disabled={!customer || confirming}
              placeholder="Escanea IMEI y presiona Enter"
              hint="Enter o cámara para añadir una unidad."
              stacked
              submitLabel="Agregar serial"
            />
          </div>
          )}
          {colorBatch ? (
            <div className="mt-3 space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3" aria-label="Lote de color activo">
              <p className="text-xs font-medium text-primary">LOTE ACTIVO · {colorBatch.color}</p>
              <p className="text-sm font-semibold">{db.products.find((p) => p.id === colorBatch.productId)?.name ?? "Referencia"} · {colorBatch.condition}</p>
              <p className="text-xl font-bold tabular-nums" role="status">{colorBatch.serials.length} / {colorBatch.quantity}</p>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: (100 * colorBatch.serials.length / colorBatch.quantity) + "%" }} /></div>
              <p className="text-xs text-muted-foreground">Faltan {colorBatch.quantity - colorBatch.serials.length} IMEI de este color.</p>
              <ConfirmDialog trigger={<Button type="button" variant="outline" size="sm" className="w-full">Finalizar lote antes de tiempo</Button>}
                title="Finalizar lote" description="Se conservarán solamente los IMEI ya capturados. El siguiente escaneo iniciará un lote nuevo."
                confirmLabel="Finalizar lote" onConfirm={finishBatch} />
            </div>
          ) : null}
          <p className="nx-quick-scan-footnote"><ScanLine size={14} />Los equipos se reservan solo al confirmar.</p>
        </section>

        <section className="nx-quick-review-panel">
          <div className="nx-quick-review-top">
            <div className="nx-quick-section-title">
              <span className="nx-quick-section-number">03</span>
              <div><h2>Seriales del pedido</h2><p>Agrupados por referencia, condición y color.</p></div>
            </div>
            <div className="nx-quick-review-actions">
              <div className="nx-quick-summary" role="status" aria-live="polite">
                <span><strong>{serials.length}</strong> IMEI</span>
                <span><strong>{groups.length}</strong> {groups.length === 1 ? "referencia" : "referencias"}</span>
              </div>
              {serials.length > 0 && !confirming ? (
                <Button type="button" size="sm" variant="ghost" className="nx-quick-clear" onClick={() => changeEntries([])}>Limpiar lista</Button>
              ) : null}
            </div>
          </div>

          {missingEntries.length > 0 ? (
            <div className="mt-3 rounded-lg border border-warning/40 p-3 text-xs text-warning">
              <p className="font-semibold">IMEI del borrador que ya no aparecen en inventario</p>
              {missingEntries.map((entry) => <div key={entry.serial} className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <span className="break-all font-mono">{entry.serial}</span>
                <Button type="button" variant="ghost" size="sm" disabled={confirming} onClick={() => changeEntries(serialsRef.current.filter((item) => item.serial !== entry.serial))}>Quitar IMEI</Button>
              </div>)}
            </div>
          ) : null}

          {groups.length === 0 ? (
            <div className="nx-quick-empty">
              <span><Package size={27} /></span>
              <h3>Aún no has escaneado equipos</h3>
              <p>Las referencias y cantidades aparecerán aquí automáticamente, agrupadas por modelo, condición y color.</p>
            </div>
          ) : (
            <div className="nx-quick-groups" role="region" aria-label="Seriales agrupados por referencia" tabIndex={0}>
              {groups.map((group) => (
                <article className="nx-quick-group" key={group.key}>
                  <div className="nx-quick-group-head">
                    <div className="nx-quick-thumb">
                      {group.imageUrl ? <img src={group.imageUrl} alt="" loading="lazy" /> : <Package size={22}/>}
                    </div>
                    <div className="nx-quick-product-info">
                      <h3>{group.name}</h3>
                      <p>{group.sku} · {group.condition === "nuevo" ? "Nuevo" : "Seminuevo"}{group.color ? " · " + group.color : ""}</p>
                    </div>
                    <span className="nx-quick-quantity">{group.serials.length} {group.serials.length === 1 ? "unidad" : "unidades"}</span>
                  </div>
                  <ul className="nx-quick-serial-list" aria-label={"IMEI de " + group.name}>
                    {group.serials.map((entry) => {
                      const preview = previewQuickOrderUnit(db, entry.serial);
                      const needsColor = Boolean(preview?.colors.length && !entry.color);
                      return (
                        <li className="nx-quick-serial-chip" key={entry.serial}>
                          <button
                            type="button"
                            className="nx-quick-chip-copy"
                            aria-label={"Copiar serial " + entry.serial}
                            title={"Copiar IMEI " + entry.serial}
                            onClick={() => void copySerial(entry.serial)}
                          >
                            <span className="nx-quick-imei">{entry.serial}</span>
                          </button>
                          <button
                            type="button"
                            className="nx-quick-chip-remove"
                            aria-label={"Quitar serial " + entry.serial}
                            title="Quitar IMEI"
                            disabled={confirming}
                            onClick={() => changeEntries(serialsRef.current.filter((item) => item.serial !== entry.serial))}
                          >
                            <X size={15} aria-hidden="true" />
                          </button>
                          {preview?.colors.length && !preview.unit.color && !entry.color ? (
                            <div className="nx-quick-color-picker">
                              <OptionSelect
                                value={entry.color}
                                onChange={(color) => changeColor(entry.serial, color)}
                                options={preview.colors.map((color) => ({ value: color, label: color }))}
                                placeholder="Seleccionar color"
                                disabled={confirming}
                                triggerClassName={needsColor ? "nx-quick-color-missing" : ""}
                              />
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="nx-quick-confirm-bar">
        <div className="nx-quick-confirm-copy">
          <strong>{serials.length} IMEI · {groups.length} referencias</strong>
          <span>{pendingSerial ? "Define el lote del primer IMEI." : colorBatch ? "Completa o finaliza el lote activo antes de confirmar." : missingColors ? "Selecciona los " + missingColors + " colores pendientes." :
            changedStock ? "Revisa seriales: alguno ya no está disponible." :
            "Al confirmar se crea el pedido y queda preparado, pendiente de despacho."}</span>
        </div>
        <ConfirmDialog
          trigger={<Button size="lg" disabled={!canSubmit} loading={confirming || runAction.pending}><Check /> Confirmar pedido rápido</Button>}
          title="Confirmar pedido rápido"
          description={"Se creará un pedido para " + (customer?.name ?? "el cliente") +
            " con " + serials.length + " seriales agrupados en " + groups.length +
            " referencias. Los IMEI quedarán reservados; el despacho físico se confirma después. Podrás descargar el PDF de relación de seriales desde el detalle."}
          confirmLabel="Crear y confirmar preparación"
          onConfirm={confirm}
        />
      </section>
      <p className="nx-quick-footer-note"><FileText size={14} /> La relación de seriales en PDF y el despacho están disponibles en el detalle del pedido.</p>
    </main>
  );
};

export default PedidoRapido;
