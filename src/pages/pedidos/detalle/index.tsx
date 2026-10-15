import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, PackagePlus, Undo2, Wrench } from "lucide-react";
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
  editarCantidadReferencia,
  finalizarPedido,
  quitarImeiPedido,
  quitarReferenciaPedido,
  quitarSerialDespachado,
  serializarImeiPedido,
  unidadesLibres,
} from "@/lib/actions/orders";
import { formatDate } from "@/lib/format";
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

  const finalizar = () =>
    void runAction((db2, actor) => finalizarPedido(db2, actor, { orderId: order.id }), {
      success: "order.dispatched",
      weighty: true,
      key: `pedido-finalizar:${order.id}`,
    });

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
          editable ? (
            <>
              <Button variant="outline" onClick={() => setAddOpen(true)}>
                <PackagePlus />
                {t("order.addReference")}
              </Button>
              <Button disabled={pending > 0} loading={runAction.pending} onClick={finalizar}>
                <Check />
                {t("order.finalize")}
              </Button>
              {isAdmin ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" className="text-destructive">
                      <Undo2 />
                      {t("order.action.cancelado")}
                    </Button>
                  }
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
              trigger={
                <Button variant="outline" className="text-destructive">
                  <Undo2 />
                  {t("order.cancelDispatched")}
                </Button>
              }
              title={t("order.cancelDispatchedTitle")}
              description={t("order.cancelDispatchedDescription")}
              confirmLabel={t("order.action.confirmCancel")}
              destructive
              onConfirm={cancelarDespachado}
            />
          ) : null
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
