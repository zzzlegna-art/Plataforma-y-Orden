import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, Check, FileSpreadsheet, FileText, PackagePlus, Save, Undo2, Wrench } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ProductPicker } from "@/components/shared/product-picker";
import { OptionSelect } from "@/components/shared/option-select";
import { OrderStatusBadge, ConditionBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/use-permissions";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import {
  agregarReferenciaPedido,
  agregarSerialDespachado,
  cancelarPedido,
  cancelarPedidoDespachado,
  actualizarPreciosPedido,
  confirmarPreparacionPedido,
  costoRealUnidad,
  editarCantidadReferencia,
  finalizarPedido,
  MARGEN_MINIMO_BRUTO,
  margenBrutoPorcentaje,
  quitarImeiPedido,
  quitarReferenciaPedido,
  quitarSerialDespachado,
  serializarImeiPedido,
  unidadesLibres,
} from "@/lib/actions/orders";
import { formatCurrency, formatDate, formatDateTime, todayIso } from "@/lib/format";
import { exportCompanyName, exportExcel, exportPedidosHistorialPdf, exportSubtitle } from "@/lib/export";
import { findUnitBySerial, getOrderView } from "@/lib/selectors";
import type { UnitCondition } from "@/lib/types";
import { OrderLineCard } from "./OrderLineCard";

/** Orden de pedido: serialización de IMEIs por referencia con progreso. */
const PedidoDetalle = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const { isAdmin } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId } = useParams();

  const view = useMemo(() => (orderId ? getOrderView(db, orderId) : undefined), [db, orderId]);
  const [addOpen, setAddOpen] = useState(false);
  const [addProductId, setAddProductId] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [addCondition, setAddCondition] = useState<UnitCondition>("nuevo");
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [margenBajoOpen, setMargenBajoOpen] = useState(false);

  useEffect(() => setPriceDrafts({}), [orderId]);

  // Edición de pedidos despachados: agregar/quitar seriales con validación.
  const [agregarLinea, setAgregarLinea] = useState<string | null>(null);
  const [serialNuevo, setSerialNuevo] = useState("");
  const [quitarAbierto, setQuitarAbierto] = useState<{ orderItemId: string; serial?: string } | null>(
    null,
  );
  const [serialAQuitar, setSerialAQuitar] = useState("");
  const [observacion, setObservacion] = useState("");

  // Referencia donde acaba de caer un serial escaneado en otra tarjeta: se resalta un momento.
  const [lineaDestacada, setLineaDestacada] = useState<string | null>(null);
  const temporizadorDestacada = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (temporizadorDestacada.current) window.clearTimeout(temporizadorDestacada.current);
    },
    [],
  );

  if (!view) {
    return (
      <EmptyState
        title={t("order.notFound")}
        description={t("order.notFoundDescription")}
        action={
          <Button asChild>
            <Link to="/pedidos">{t("order.backToList")}</Link>
          </Button>
        }
      />
    );
  }

  const { order, customer, lines, requested } = view;
  // Los repuestos no llevan serial (se descuentan solos al finalizar): el progreso y lo que falta
  // por asignar solo cuentan las referencias que sí se escanean.
  const lineasConSerial = lines.filter((line) => !line.esRepuesto);
  const requestedSerial = lineasConSerial.reduce((suma, line) => suma + line.item.quantity, 0);
  const assigned = lineasConSerial.reduce((suma, line) => suma + line.serializados, 0);
  const pending = requestedSerial - assigned;
  const editable = order.status === "en_preparacion";
  // El administrador puede ajustar (agregar/quitar unidades) y anular pedidos ya despachados.
  const edicionDespachado = isAdmin && order.status === "despachado";
  const addProduct = db.products.find((p) => p.id === addProductId);
  const lineaQuitar = quitarAbierto
    ? lines.find((l) => l.item.id === quitarAbierto.orderItemId)
    : undefined;
  const preparado = order.status === "preparado";
  const documentosDisponibles = preparado || order.status === "despachado";
  const precioDraft = (line: (typeof lines)[number]) => {
    const value = priceDrafts[line.item.id];
    return value === undefined ? line.item.unitPrice : Number(value);
  };
  const metricasLinea = (line: (typeof lines)[number], precio = precioDraft(line)) => {
    if (!Number.isFinite(precio) || precio <= 0 || line.units.length !== line.item.quantity) return undefined;
    const costos = line.units.map((unit) => costoRealUnidad(unit, line.product));
    if (costos.some((cost) => cost === undefined)) return undefined;
    const totalCosto = (costos as number[]).reduce((sum, cost) => sum + cost, 0);
    const totalVenta = precio * line.item.quantity;
    return { ganancia: totalVenta - totalCosto, margen: margenBrutoPorcentaje(totalVenta, totalCosto) };
  };
  const hayMargenBajo = lines.some((line) => {
    const metricas = metricasLinea(line);
    return Boolean(metricas && metricas.margen < MARGEN_MINIMO_BRUTO);
  });
  const precioBajoCosto = lines.some((line) => {
    const precio = precioDraft(line);
    return line.units.some((unit) => {
      const cost = costoRealUnidad(unit, line.product);
      return cost !== undefined && precio < cost;
    });
  });

  /**
   * Serializa un serial. `desdeLineaId` es la tarjeta donde se escaneó: la acción lo asigna a
   * la referencia que le corresponde (por producto y condición), que puede ser otra. En ese
   * caso se avisa claramente en cuál quedó y se resalta esa tarjeta.
   */
  const serializar = async (serial: string, desdeLineaId?: string) => {
    const unit = findUnitBySerial(db, serial);
    if (!unit) {
      toast.error(t("errors.unitNotFound", { serial }));
      return;
    }
    const result = await runAction((db2, actor) =>
      serializarImeiPedido(db2, actor, { orderId: order.id, imei: serial }),
    );
    if (!result) return;
    if (!desdeLineaId || result.orderItemId === desdeLineaId) {
      toast.success(t("order.unitAssigned"));
      return;
    }
    const referencia = `${result.producto} · ${t(`condition.${result.condicion ?? "nuevo"}`)}`;
    toast.warning(t("order.serialOtraReferencia", { serial, referencia }), { duration: 7000 });
    setLineaDestacada(result.orderItemId);
    if (temporizadorDestacada.current) window.clearTimeout(temporizadorDestacada.current);
    temporizadorDestacada.current = window.setTimeout(() => setLineaDestacada(null), 4000);
    document.getElementById(`linea-${result.orderItemId}`)?.scrollIntoView?.({
      behavior: "smooth",
      block: "center",
    });
  };

  const quitarSerial = (serial: string) =>
    void runAction(
      (db2, actor) => quitarImeiPedido(db2, actor, { orderId: order.id, imei: serial }),
      { success: "order.unitReleased", key: `pedido-quitar-serial:${serial}` },
    );

  const abrirAgregar = (orderItemId: string) => {
    setSerialNuevo("");
    setAgregarLinea(orderItemId);
  };

  const abrirQuitar = (orderItemId: string, serial?: string) => {
    const line = lines.find((l) => l.item.id === orderItemId);
    setSerialAQuitar(serial ?? line?.units[line.units.length - 1]?.serial ?? "");
    setObservacion("");
    setQuitarAbierto({ orderItemId, serial });
  };

  const agregarSerialEdicion = async () => {
    if (!agregarLinea) return;
    if (!serialNuevo.trim()) {
      toast.error(t("errors.serialRequired"));
      return;
    }
    const ok = await runAction(
      (db2, actor) =>
        agregarSerialDespachado(db2, actor, {
          orderId: order.id,
          orderItemId: agregarLinea,
          imei: serialNuevo,
        }),
      { success: "order.updated" },
    );
    if (ok) {
      setAgregarLinea(null);
      setSerialNuevo("");
    }
  };

  const quitarSerialEdicion = async () => {
    if (!quitarAbierto) return;
    if (!serialAQuitar.trim()) {
      toast.error(t("order.chooseSerialError"));
      return;
    }
    if (!observacion.trim()) {
      toast.error(t("errors.observacionRequired"));
      return;
    }
    const ok = await runAction(
      (db2, actor) =>
        quitarSerialDespachado(db2, actor, {
          orderId: order.id,
          imei: serialAQuitar,
          observacion,
        }),
      { success: "order.updated" },
    );
    if (ok !== null) {
      setQuitarAbierto(null);
      setSerialAQuitar("");
      setObservacion("");
    }
  };

  const cancelarDespachado = async () => {
    const result = await runAction(
      (db2, actor) => cancelarPedidoDespachado(db2, actor, { orderId: order.id }),
      { success: "order.cancelled" },
    );
    if (result) navigate("/pedidos");
  };

  const cambiarCantidad = (orderItemId: string, delta: number) => {
    void runAction(
      (db2, actor) =>
        editarCantidadReferencia(db2, actor, {
          orderItemId,
          // Se parte de la cantidad real en este momento: dos clics seguidos suman 2, no 1.
          nuevaCantidad: (db2.orderItems.find((row) => row.id === orderItemId)?.quantity ?? 0) + delta,
        }),
      { success: "order.updated" },
    );
  };

  const quitarLinea = (orderItemId: string) =>
    void runAction(
      (db2, actor) => quitarReferenciaPedido(db2, actor, { orderItemId }),
      { success: "order.updated", key: `pedido-quitar-linea:${orderItemId}` },
    );

  const agregarReferencia = async () => {
    const result = await runAction(
      (db2, actor) =>
        agregarReferenciaPedido(db2, actor, {
          orderId: order.id,
          productId: addProductId,
          quantity: Number(addQty),
          condition: addProduct?.categoria === "repuesto" ? undefined : addCondition,
        }),
      { success: "order.updated" },
    );
    if (result) {
      setAddOpen(false);
      setAddProductId("");
      setAddQty("1");
      setAddCondition("nuevo");
    }
  };

  const confirmarPreparacion = async () => {
    await runAction((db2, actor) => confirmarPreparacionPedido(db2, actor, { orderId: order.id }), {
      success: "order.prepared",
      weighty: true,
      key: "pedido-preparar:" + order.id,
    });
  };

  const guardarPrecios = async (mostrarExito = true) => {
    const precios = lines.map((line) => ({ orderItemId: line.item.id, unitPrice: precioDraft(line) }));
    if (precios.some((entry) => !Number.isFinite(entry.unitPrice) || entry.unitPrice <= 0)) {
      toast.error(t("errors.invalidPrice"));
      return false;
    }
    const result = await runAction(
      (db2, actor) => actualizarPreciosPedido(db2, actor, { orderId: order.id, precios }),
      { ...(mostrarExito ? { success: "order.pricesSaved" } : {}), key: "pedido-precios:" + order.id },
    );
    return Boolean(result);
  };

  const confirmarVenta = async (aceptarMargenBajo: boolean) => {
    const preciosGuardados = await guardarPrecios(false);
    if (!preciosGuardados) return;
    const result = await runAction(
      (db2, actor) => finalizarPedido(db2, actor, { orderId: order.id, aceptarMargenBajo }),
      { success: "order.dispatched", weighty: true, key: "pedido-venta:" + order.id },
    );
    if (result) setMargenBajoOpen(false);
  };

  const solicitarConfirmacionVenta = async () => {
    if (lines.some((line) => !Number.isFinite(precioDraft(line)) || precioDraft(line) <= 0)) {
      toast.error(t("errors.invalidPrice"));
      return;
    }
    if (precioBajoCosto) {
      toast.error(t("errors.orderAnyPriceBelowCost"));
      return;
    }
    if (hayMargenBajo) {
      setMargenBajoOpen(true);
      return;
    }
    await confirmarVenta(false);
  };

  const exportarRelacionPdf = () => {
    if (!documentosDisponibles) return;
    const fecha = formatDateTime(order.deliveryDate ?? order.orderDate);
    exportPedidosHistorialPdf({
      title: exportCompanyName(db.settings.companyName) + " · " + t("order.serialRelationTitle"),
      subtitle: exportSubtitle(1, order.code + " · " + (customer?.name ?? t("order.noCustomer"))),
      filename: "relacion-seriales-" + order.code + "-" + todayIso() + ".pdf",
      pedidos: [{
        code: order.code,
        cliente: customer?.name ?? t("order.noCustomer"),
        fecha,
        unidades: requested,
        lineas: lines.map((line) => ({
          title: (line.product?.name ?? "—") + (line.item.condition ? " · " + t("condition." + line.item.condition) : "") + " · " + line.item.quantity + " uds",
          seriales: line.units.map((unit) => unit.serial),
        })),
      }],
    });
  };

  const exportarRelacionExcel = () => {
    if (!documentosDisponibles) return;
    const fecha = formatDateTime(order.deliveryDate ?? order.orderDate);
    const clienteNombre = customer?.name ?? t("order.noCustomer");
    const filas = lines.flatMap((line) => {
      const referencia = [line.product?.name ?? "—", line.item.condition ? t("condition." + line.item.condition) : null]
        .filter(Boolean).join(" · ");
      return line.units.length > 0
        ? line.units.map((unit) => [order.code, clienteNombre, fecha, referencia, line.item.quantity, unit.serial])
        : [[order.code, clienteNombre, fecha, referencia, line.item.quantity, ""]];
    });
    exportExcel({
      filename: "relacion-seriales-" + order.code + "-" + todayIso() + ".xlsx",
      sheets: [{
        name: "Relación de seriales",
        title: exportCompanyName(db.settings.companyName) + " · " + t("order.serialRelationTitle"),
        subtitle: order.code + " · " + clienteNombre + " · " + fecha,
        columns: ["Pedido", "Cliente", "Fecha", "Referencia", "Cantidad", "Serial / IMEI"],
        rows: filas,
        wrapColumns: [1, 3, 5],
      }],
    });
  };

  const cancelar = async () => {
    const result = await runAction(
      (db2, actor) => cancelarPedido(db2, actor, { orderId: order.id, motivo: cancelMotivo }),
      { success: "order.cancelled" },
    );
    if (result) {
      setCancelMotivo("");
      navigate("/pedidos");
    }
  };

  return (
    <div className="space-y-5 stagger">
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link
          to="/pedidos"
          onClick={(event) => {
            // Si se llegó desde la lista, se vuelve exactamente a ella (con la búsqueda y el
            // filtro que se tenían puestos); si no, va a la lista sin filtros.
            if (location.key !== "default") {
              event.preventDefault();
              navigate(-1);
            }
          }}
        >
          <ArrowLeft />
          {t("order.backToList")}
        </Link>
      </Button>

      <PageHeader
        title={<span className="font-tabular">{order.code}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{customer?.name ?? t("order.noCustomer")}</span>
            <span className="text-muted-foreground">
              {t("order.createdOn", { date: formatDate(order.orderDate) })}
            </span>
            <OrderStatusBadge status={order.status} />
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {documentosDisponibles ? (
              <>
                <Button type="button" variant="outline" onClick={exportarRelacionPdf}><FileText />{t("order.exportSerialsPdf")}</Button>
                <Button type="button" variant="outline" onClick={exportarRelacionExcel}><FileSpreadsheet />{t("order.exportSerialsExcel")}</Button>
              </>
            ) : null}
            {editable ? (
              <>
                <Button variant="outline" onClick={() => setAddOpen(true)}><PackagePlus />{t("order.addReference")}</Button>
                <ConfirmDialog
                  trigger={<Button disabled={pending > 0 || runAction.pending} loading={runAction.pending}><Check />{t("order.finalize")}</Button>}
                  title={t("order.confirmPreparationTitle")}
                  description={t("order.confirmPreparationDescription")}
                  confirmLabel={t("order.finalize")}
                  onConfirm={confirmarPreparacion}
                />
                {isAdmin ? (
                  <ConfirmDialog
                    trigger={<Button variant="outline" className="text-destructive"><Undo2 />{t("order.action.cancelado")}</Button>}
                    title={t("order.cancelTitle")}
                    description={t("order.cancelDescription")}
                    confirmLabel={t("order.action.confirmCancel")}
                    destructive
                    onConfirm={cancelar}
                  />
                ) : null}
              </>
            ) : preparado ? (
              <>
                <Button variant="outline" disabled={runAction.pending} loading={runAction.pending} onClick={() => void guardarPrecios()}><Save />{t("order.savePrices")}</Button>
                <ConfirmDialog
                  trigger={<Button disabled={runAction.pending} loading={runAction.pending}><Check />{t("order.confirmSale")}</Button>}
                  title={t("order.confirmSaleTitle")}
                  description={t("order.confirmSaleDescription")}
                  confirmLabel={t("order.confirmSale")}
                  onConfirm={solicitarConfirmacionVenta}
                />
                {isAdmin ? (
                  <ConfirmDialog
                    trigger={<Button variant="outline" className="text-destructive"><Undo2 />{t("order.action.cancelado")}</Button>}
                    title={t("order.cancelTitle")}
                    description={t("order.cancelDescription")}
                    confirmLabel={t("order.action.confirmCancel")}
                    destructive
                    onConfirm={cancelar}
                  />
                ) : null}
              </>
            ) : edicionDespachado ? (
              <ConfirmDialog
                trigger={<Button variant="outline" className="text-destructive"><Undo2 />{t("order.cancelDispatched")}</Button>}
                title={t("order.cancelDispatchedTitle")}
                description={t("order.cancelDispatchedDescription")}
                confirmLabel={t("order.action.confirmCancel")}
                destructive
                onConfirm={cancelarDespachado}
              />
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("order.serializedOfTitle")}
          </p>
          <p className="font-tabular mt-1 text-xl font-semibold">
            {requestedSerial > 0 ? `${assigned}/${requestedSerial}` : "—"}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("order.deliveryDate")}
          </p>
          <p className="font-tabular mt-1 text-xl font-semibold">
            {order.deliveryDate ? formatDate(order.deliveryDate) : "—"}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("order.total")}
          </p>
          <p className="font-tabular mt-1 text-xl font-semibold">
            {t("order.unitsToDispatch", { count: requested })}
          </p>
        </div>
      </div>

      {editable && pending === 0 ? <p className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">Verificación completa: {assigned} de {requestedSerial} equipos con IMEI asignado. Revisa físicamente las unidades antes de confirmar el despacho.</p> : null}

      {editable && pending > 0 ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          {t("order.pendingWarning", { count: pending })}
        </p>
      ) : null}

      {order.status === "cancelado" && order.notes ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          {t("order.cancelReason")}: {order.notes}
        </p>
      ) : null}

      {preparado ? (
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="space-y-1">
            <h3 className="font-semibold">{t("order.pricesTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("order.priceEditHint")}</p>
          </div>
          <div className="space-y-3">
            {lines.map((line) => {
              const precio = precioDraft(line);
              const metricas = metricasLinea(line, precio);
              const faltaCosto = line.units.length !== line.item.quantity || line.units.some((unit) => costoRealUnidad(unit, line.product) === undefined);
              const debajoCosto = line.units.some((unit) => {
                const cost = costoRealUnidad(unit, line.product);
                return cost !== undefined && precio < cost;
              });
              return (
                <div key={line.item.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_190px] sm:items-center">
                  <div className="min-w-0">
                    <p className="font-medium">{line.product?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{line.item.quantity} × {formatCurrency(Number.isFinite(precio) ? precio : 0)}</p>
                    {isAdmin && metricas ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("order.grossProfit")}: <span className={metricas.ganancia >= 0 ? "text-success" : "text-destructive"}>{formatCurrency(metricas.ganancia)}</span>
                        {" · "}{t("order.margin")}: <span className={metricas.margen < MARGEN_MINIMO_BRUTO ? "text-warning" : "text-success"}>{metricas.margen.toLocaleString("es-CO", { maximumFractionDigits: 2 })}%</span>
                      </p>
                    ) : null}
                    {faltaCosto ? <p className="mt-1 text-xs text-warning">{t("order.costPending")}</p> : null}
                    {debajoCosto ? <p className="mt-1 text-xs text-destructive">{t("errors.orderAnyPriceBelowCost")}</p> : null}
                    {metricas && metricas.margen < MARGEN_MINIMO_BRUTO && !debajoCosto ? <p className="mt-1 flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5" />{t("order.lowMargin")}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={"precio-" + line.item.id}>{t("order.unitPrice")}</Label>
                    <Input
                      id={"precio-" + line.item.id}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={priceDrafts[line.item.id] ?? String(line.item.unitPrice)}
                      onChange={(event) => setPriceDrafts((current) => ({ ...current, [line.item.id]: event.target.value }))}
                      aria-label={t("order.unitPrice") + " · " + (line.product?.name ?? "")}
                    />
                    <p className="text-xs text-muted-foreground">{t("order.subtotal")}: {formatCurrency(Number.isFinite(precio) && precio > 0 ? precio * line.item.quantity : 0)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <span className="text-sm font-medium">{t("order.total")}</span>
            <span className="font-tabular text-lg font-semibold">{formatCurrency(lines.reduce((sum, line) => sum + (Number.isFinite(precioDraft(line)) && precioDraft(line) > 0 ? precioDraft(line) * line.item.quantity : 0), 0))}</span>
          </div>
          {hayMargenBajo ? <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">{t("order.lowMarginDescription")}</p> : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("order.linesTitle")}</h3>
        {lines.map((line) => (
          <OrderLineCard
            key={line.item.id}
            line={line}
            editable={editable}
            edicionDespachado={edicionDespachado}
            onCambiarCantidad={(delta) => cambiarCantidad(line.item.id, delta)}
            onSerializar={(serial) => void serializar(serial, line.item.id)}
            destacada={lineaDestacada === line.item.id}
            onQuitarSerial={(serial) =>
              edicionDespachado ? abrirQuitar(line.item.id, serial) : quitarSerial(serial)
            }
            onQuitarLinea={() => quitarLinea(line.item.id)}
            onAgregarUnidades={() => abrirAgregar(line.item.id)}
            onQuitarUnidades={() => abrirQuitar(line.item.id)}
            disponibles={
              line.esRepuesto && editable
                ? unidadesLibres(db, line.item.productId).length
                : undefined
            }
          />
        ))}
      </section>

      {order.status === "despachado" ? (
        <p className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          <Wrench className="h-4 w-4 shrink-0" />
          {t("order.dispatchedNote")}
        </p>
      ) : null}

      <Dialog open={margenBajoOpen} onOpenChange={setMargenBajoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("order.lowMarginTitle")}</DialogTitle>
            <DialogDescription>{t("order.lowMarginDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMargenBajoOpen(false)}>{t("common.cancel")}</Button>
            <Button type="button" loading={runAction.pending} disabled={runAction.pending} onClick={() => void confirmarVenta(true)}>{t("order.lowMarginContinue")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("order.addReference")}</DialogTitle>
            <DialogDescription>{t("order.addReferenceHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("product.title")}</Label>
              <ProductPicker
                products={db.products.filter((p) => p.isActive)}
                value={addProductId}
                onChange={setAddProductId}
              />
            </div>
            {addProduct?.categoria !== "repuesto" ? (
              <div className="space-y-2">
                <Label>{t("unit.condition")}</Label>
                <div className="flex gap-2">
                  {(["nuevo", "seminuevo"] as UnitCondition[]).map((value) => (
                    <Button
                      key={value}
                      variant={addCondition === value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAddCondition(value)}
                    >
                      {t(`condition.${value}`)}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="addQty">{t("order.quantity")}</Label>
              <Input
                id="addQty"
                type="number"
                min={1}
                value={addQty}
                onChange={(event) => setAddQty(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              loading={runAction.pending}
              disabled={!addProductId}
              onClick={() => void agregarReferencia()}
            >
              {t("common.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agregar serial a un pedido despachado (solo administrador) */}
      <Dialog
        open={agregarLinea !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setAgregarLinea(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("order.addSerialTitle")}</DialogTitle>
            <DialogDescription>{t("order.addSerialHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="addSerial">{t("unit.serial")}</Label>
            <Input
              id="addSerial"
              value={serialNuevo}
              onChange={(event) => setSerialNuevo(event.target.value)}
              placeholder="IMEI / serial"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgregarLinea(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" loading={runAction.pending} onClick={() => void agregarSerialEdicion()}>
              {t("common.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quitar serial de un pedido despachado (solo administrador) */}
      <Dialog
        open={quitarAbierto !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setQuitarAbierto(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("order.removeSerialTitle")}</DialogTitle>
            <DialogDescription>{t("order.removeSerialHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("order.chooseSerial")}</Label>
              {lineaQuitar && lineaQuitar.units.length > 0 ? (
                <OptionSelect
                  value={serialAQuitar}
                  onChange={setSerialAQuitar}
                  emptyLabel={t("order.chooseSerial")}
                  options={lineaQuitar.units.map((unit) => ({
                    value: unit.serial,
                    label: unit.serial,
                  }))}
                />
              ) : (
                <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  {t("order.noSerialsToRemove")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="observacion">{t("order.observacion")}</Label>
              <Textarea
                id="observacion"
                rows={3}
                value={observacion}
                onChange={(event) => setObservacion(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("order.observacionHint")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuitarAbierto(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              loading={runAction.pending}
              disabled={!lineaQuitar || lineaQuitar.units.length === 0}
              onClick={() => void quitarSerialEdicion()}
            >
              {t("order.removeUnit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PedidoDetalle;
