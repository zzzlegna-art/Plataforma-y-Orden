import { useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, FileText, Package, ScanLine, ShoppingBag, X, Zap } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { OptionSelect } from "@/components/shared/option-select";
import { PageHeader } from "@/components/shared/page-header";
import { SerialScanInput } from "@/components/shared/serial-scan-input";
import { Button } from "@/components/ui/button";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import { crearPedidoRapidoPorSeriales, previewQuickOrderUnit, type QuickOrderSerialInput } from "@/lib/actions/orders-quick";
import { mayoristaGroupDeProducto, esProductoRepuesto } from "@/lib/products";
import { normalizarColor } from "@/lib/color-variants";

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
  const { db } = useStore();
  const navigate = useNavigate();
  const runAction = useRunAction();
  const [customerId, setCustomerId] = useState("");
  const [serials, setSerials] = useState<QuickOrderSerialInput[]>([]);
  const serialsRef = useRef<QuickOrderSerialInput[]>([]);
  const [confirming, setConfirming] = useState(false);
  const confirmingRef = useRef(false);

  const customers = useMemo(() => db.customers
    .filter((customer) => customer.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, "es")), [db.customers]);
  const customer = customers.find((item) => item.id === customerId);

  const activeReservations = useMemo(() => {
    const reserved = new Set<string>();
    for (const assignment of db.orderItemUnits) {
      const item = db.orderItems.find((candidate) => candidate.id === assignment.orderItemId);
      const order = item && db.orders.find((candidate) => candidate.id === item.orderId);
      if (order?.status === "en_preparacion" || order?.status === "preparado") {
        reserved.add(assignment.unitId);
      }
    }
    return reserved;
  }, [db]);

  const validateSerial = (raw: string): string | null => {
    const serial = raw.trim();
    if (!customerId || !customer) return "Primero selecciona un cliente activo.";
    if (!serial) return "Escribe o escanea un IMEI.";
    if (serialsRef.current.some((entry) => entry.serial.toLocaleLowerCase("es") === serial.toLocaleLowerCase("es"))) {
      return "Ese serial ya está agregado al pedido.";
    }
    const preview = previewQuickOrderUnit(db, serial);
    if (!preview) return "El serial " + serial + " no existe en inventario.";
    if (!preview.product.isActive) return "Esta referencia no está activa.";
    if (preview.unit.status !== "en_bodega") return "El serial no está disponible en bodega.";
    if (activeReservations.has(preview.unit.id)) return "Este serial ya está reservado en otro pedido.";
    if (esProductoRepuesto(db, preview.product)) return "Los repuestos se agregan por cantidad en Pedido normal.";
    if (customer.categoriaMayorista && customer.categoriaMayorista !== "ambos" &&
      mayoristaGroupDeProducto(db, preview.product) !== customer.categoriaMayorista) {
      return "El cliente no tiene habilitada esa categoría de productos.";
    }
    return null;
  };

  const addScan = (raw: string) => {
    const serial = raw.trim();
    const problem = validateSerial(serial);
    if (problem) { toast.error(problem); return; }
    const preview = previewQuickOrderUnit(db, serial);
    if (!preview) return;
    const entry: QuickOrderSerialInput = {
      serial: preview.unit.serial,
      color: preview.suggestedColor,
    };
    // El ref bloquea duplicados del lector que lleguen antes del siguiente render.
    serialsRef.current = [...serialsRef.current, entry];
    setSerials(serialsRef.current);
    toast.success(preview.product.name + " agregado", { duration: 1350 });
  };

  const changeEntries = (next: QuickOrderSerialInput[]) => {
    if (confirmingRef.current) return;
    serialsRef.current = next;
    setSerials(next);
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
  const changedStock = serials.some((entry) => {
    const preview = previewQuickOrderUnit(db, entry.serial);
    return !preview || preview.unit.status !== "en_bodega" || activeReservations.has(preview.unit.id);
  });
  const canSubmit = Boolean(customer && serials.length && !missingColors && !changedStock && !confirming && !runAction.pending);

  const confirm = async () => {
    if (confirmingRef.current || !canSubmit) return;
    confirmingRef.current = true;
    setConfirming(true);
    try {
      const order = await runAction(
        (latestDb, actor) => crearPedidoRapidoPorSeriales(latestDb, actor, {
          customerId,
          serials: [...serialsRef.current],
        }),
        { key: "crear-pedido-rapido", weighty: true },
      );
      if (order) {
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

      <section className="nx-quick-customer">
        <div className="nx-quick-section-title">
          <span className="nx-quick-section-number">01</span>
          <div><h2>Cliente del pedido</h2><p>Selecciona el comprador.</p></div>
        </div>
        <OptionSelect
          value={customerId}
          onChange={setCustomerId}
          disabled={confirming}
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
          <div className="nx-quick-scanner">
            <SerialScanInput
              onScan={addScan}
              validate={validateSerial}
              autoFocus={Boolean(customer)}
              disabled={!customer || confirming}
              placeholder="Escanea IMEI y presiona Enter"
              hint="Enter o cámara para añadir una unidad."
              stacked
              submitLabel="Agregar serial"
            />
          </div>
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
                          {preview?.colors.length && !preview.unit.color ? (
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
          <span>{missingColors ? "Selecciona los " + missingColors + " colores pendientes." :
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
