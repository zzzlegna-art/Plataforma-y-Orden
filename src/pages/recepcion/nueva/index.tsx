import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Boxes, Check, ClipboardList, Info, PackagePlus, Plus, Power, ScanLine, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ProductPicker } from "@/components/shared/product-picker";
import { ProductThumbnail } from "@/components/shared/product-thumbnail";
import { SerialScanInput } from "@/components/shared/serial-scan-input";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Badge, ConditionBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import {
  addReceptionItem,
  confirmReception,
  createReception,
  discardReception,
  removeReceptionItem,
  updateReception,
  updateReceptionItem,
} from "@/lib/actions/receptions";
import { todayIso } from "@/lib/format";
import { errorDeSerialCelular, esCodigoInterno, generarCodigoInterno } from "@/lib/imei";
import { esProductoRepuesto, etiquetaTipoProducto, tiposProductoOrdenados } from "@/lib/products";
import type { Product, ProductCategory, UnitCondition } from "@/lib/types";
import { ReceptionItemChip } from "./ReceptionItemChip";
import { SupplierFormDialog } from "@/pages/proveedores/SupplierFormDialog";
import { listSuppliers, type Supplier } from "@/lib/suppliers";

/**
 * Captura de una recepción: se elige producto y condición y cada lectura agrega
 * un serial/IMEI. La recepción se crea en la primera lectura y se confirma al final.
 */
/** Ícono dentro de un cuadro de color, para los títulos de cada sección. */
const IconoSeccion = ({ children }: { children: ReactNode }) => (
  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&>svg]:h-4 [&>svg]:w-4">
    {children}
  </span>
);

type LecturaRecepcion = { serial: string; productId: string; condition: UnitCondition; cost: string };
type LecturaRechazada = LecturaRecepcion & { motivo: string };

const NuevaRecepcion = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const navigate = useNavigate();
  const { receptionId: routeId } = useParams();

  const [receptionId, setReceptionId] = useState<string | null>(routeId ?? null);
  const [productId, setProductId] = useState("");
  const [catFilter, setCatFilter] = useState<"" | ProductCategory>("");
  const categoriaFiltros = useMemo(
    () => [
      { value: "" as const, label: t("common.all") },
      ...tiposProductoOrdenados(db).map((tipo) => ({ value: tipo.key, label: etiquetaTipoProducto(t, tipo) })),
    ],
    [db, t],
  );
  const [condition, setCondition] = useState<UnitCondition>("nuevo");
  const [cost, setCost] = useState("");
  const [repuestoQty, setRepuestoQty] = useState("1");
  const [reference, setReference] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [receivedAt, setReceivedAt] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [totalConfirmando, setTotalConfirmando] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ultimoSerialAgregado, setUltimoSerialAgregado] = useState("");
  const busyRef = useRef(false);
  const receptionIdRef = useRef(receptionId);
  // No sobrescribir con null el ID recién creado mientras React actualiza el estado.
  if (receptionId) receptionIdRef.current = receptionId;
  const colaSerialesRef = useRef<LecturaRecepcion[]>([]);
  const procesandoColaRef = useRef(false);
  const procesarSerialRef = useRef<(lectura: LecturaRecepcion) => Promise<void>>(async () => {});
  const [pendientes, setPendientes] = useState(0);
  const [rechazados, setRechazados] = useState<LecturaRechazada[]>([]);
  const lecturasTerminadasRef = useRef(new Set<string>());

  const reception = useMemo(
    () => db.receptions.find((item) => item.id === receptionId),
    [db.receptions, receptionId],
  );

  // Al continuar una recepción en captura se cargan sus datos en el formulario.
  useEffect(() => {
    if (!reception) return;
    setReference(reception.reference ?? "");
    setSupplierId(reception.supplierId ?? "");
    setReceivedAt(reception.receivedAt.slice(0, 10));
    setNotes(reception.notes ?? "");
  }, [reception?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Los proveedores se cargan del directorio real: clientes y proveedores no se mezclan.
  useEffect(() => {
    let active = true;
    void listSuppliers().then((results) => {
      if (active) setSuppliers(results);
    }).catch((error: unknown) => {
      if (active) toast.error(error instanceof Error ? error.message : "No se pudieron cargar los proveedores");
    }).finally(() => {
      if (active) setSuppliersLoading(false);
    });
    return () => { active = false; };
  }, []);

  const items = useMemo(
    () => db.receptionItems.filter((item) => item.receptionId === receptionId),
    [db.receptionItems, receptionId],
  );
  const products = db.products.filter((product) => product.isActive);
  const productosFiltrados = products.filter((product) => {
    if (!catFilter) return true;
    if (catFilter === "repuesto") return esProductoRepuesto(db, product);
    return product.categoria === catFilter;
  });
  const selectedProduct = products.find((product) => product.id === productId);
  const esRepuesto = esProductoRepuesto(db, selectedProduct);
  const newCount = items.filter((item) => item.condition === "nuevo").length;
  const usedCount = items.length - newCount;
  const confirmed = reception?.status === "confirmada";

  /** Al cambiar de categoría se limpia el producto si ya no aplica al filtro. */
  const cambiarCategoria = (value: "" | ProductCategory) => {
    if (procesandoColaRef.current || pendientes > 0) return;
    setCatFilter(value);
    if (!value || !selectedProduct) return;
    const sigueVisible =
      value === "repuesto"
        ? esProductoRepuesto(db, selectedProduct)
        : selectedProduct.categoria === value;
    if (!sigueVisible) setProductId("");
  };

  const persistHeader = async (selectedSupplierId = supplierId) => {
    if (!receptionId || procesandoColaRef.current) return;
    await runAction((db2, actor) =>
      updateReception(db2, actor, {
        id: receptionId,
        supplierId: selectedSupplierId,
        reference,
        receivedAt: `${receivedAt}T09:00:00.000Z`,
        notes,
      }),
    );
  };

  /**
   * Evita dobles ejecuciones (doble clic o lecturas muy seguidas): mientras una
   * operación está en curso, las demás se ignoran.
   */
  const runExclusivo = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const registrarRechazo = (lectura: LecturaRecepcion, motivo: string) => {
    setRechazados((actuales) => [...actuales, { ...lectura, motivo }]);
  };

  const procesarSerial = async (lectura: LecturaRecepcion) => {
    // Una operación de repuestos/edición en curso no debe descartar silenciosamente el escaneo.
    if (busyRef.current) {
      registrarRechazo(lectura, "Otra operación estaba en curso al recibir esta lectura.");
      toast.error("Lectura pendiente de revisión: vuelve a intentarla.");
      return;
    }
    await runExclusivo(async () => {
      const { serial } = lectura;
      if (!lectura.productId || (receptionIdRef.current && confirmed)) {
        registrarRechazo(lectura, "Recepción cerrada o producto no seleccionado.");
        return;
      }
      const serialNormalizado = serial.trim().toUpperCase();
      // Las recepciones confirmadas de años anteriores no bloquean un reingreso liberado.
      // La acción de dominio vuelve a validar el inventario y los duplicados reales.
      const duplicado = lecturasTerminadasRef.current.has(serialNormalizado) ||
        db.units.some((unit) => unit.status !== "liberado" && unit.serial.trim().toUpperCase() === serialNormalizado) ||
        db.receptionItems.some((item) => item.receptionId === receptionIdRef.current && item.serial.trim().toUpperCase() === serialNormalizado);
      if (duplicado) {
        registrarRechazo(lectura, "Serial ya agregado a esta recepción o presente en inventario activo.");
        toast.error("Este serial ya está registrado. No se agregó otra vez.");
        return;
      }
      let targetId = receptionIdRef.current;
      if (!targetId) {
        const created = await runAction((db2, actor) =>
          createReception(db2, actor, {
            supplierId,
            reference,
            receivedAt: `${receivedAt}T09:00:00.000Z`,
            notes,
          }),
        );
        if (!created) {
          registrarRechazo(lectura, "No se pudo crear la recepción. Comprueba conexión y permisos.");
          return;
        }
        targetId = created.id;
        receptionIdRef.current = created.id;
        setReceptionId(created.id);
      }
      const result = await runAction((db2, actor) =>
        addReceptionItem(db2, actor, {
          receptionId: targetId as string,
          productId: lectura.productId,
          serial,
          condition: lectura.condition,
          cost: lectura.cost ? Number(lectura.cost) : undefined,
        }),
      );
      if (result) {
        setCost("");
        lecturasTerminadasRef.current.add(serialNormalizado);
        setRechazados((anteriores) => anteriores.filter((item) => item.serial.trim().toUpperCase() !== serialNormalizado));
        setUltimoSerialAgregado(serial.trim());
        toast.success("Equipo agregado correctamente.", { id: "recepcion-lectura" });
      } else {
        registrarRechazo(lectura, "No se guardó el equipo. Revisa el aviso de error y vuelve a intentar.");
      }
    });
  };

  // Una lectura nueva entra en cola incluso mientras se guarda la anterior.
  // La referencia y la condición se capturan al procesar cada lectura; el operador
  // debe esperar a que la cola se vacíe antes de cambiarlas o confirmar.
  procesarSerialRef.current = procesarSerial;
  const encolarLectura = async (lectura: LecturaRecepcion) => {
    const valor = lectura.serial.trim();
    if (!valor || confirmed || !lectura.productId) return;
    const normalizado = valor.toUpperCase();
    if (colaSerialesRef.current.some((pendiente) => pendiente.serial.toUpperCase() === normalizado)) {
      toast.warning("Este serial ya está esperando para registrarse.");
      return;
    }
    colaSerialesRef.current.push({ ...lectura, serial: valor });
    setPendientes(colaSerialesRef.current.length);
    if (procesandoColaRef.current) return;
    procesandoColaRef.current = true;
    try {
      while (colaSerialesRef.current.length > 0) {
        const siguiente = colaSerialesRef.current[0];
        try {
          await procesarSerialRef.current(siguiente);
        } catch {
          registrarRechazo(siguiente, "Error inesperado al procesar la lectura.");
          toast.error("No se pudo procesar la lectura. Revisa la recepción.");
        } finally {
          colaSerialesRef.current.shift();
          setPendientes(colaSerialesRef.current.length);
        }
      }
    } finally {
      procesandoColaRef.current = false;
    }
  };

  /**
   * Cada lectura conserva la referencia, condición y costo con que se escaneó.
   * Los reintentos reaprovechan esos valores, aunque el formulario haya cambiado.
   */
  const handleScan = (serial: string) => encolarLectura({ serial, productId, condition, cost });
  const reintentarLectura = (registro: LecturaRechazada) => {
    const serial = registro.serial.trim().toUpperCase();
    if (procesandoColaRef.current ||
      colaSerialesRef.current.some((item) => item.serial.trim().toUpperCase() === serial)) {
      toast.warning("Espera a que termine la lectura pendiente.");
      return;
    }
    setRechazados((actuales) => actuales.filter((item) => item !== registro));
    void encolarLectura(registro);
  };

  /** Mantiene sincronizada la protección de duplicados cuando se edita un serial. */
  const handleSerialChange = async (item: (typeof items)[number], serial: string) => {
    const result = await runAction((db2, actor) =>
      updateReceptionItem(db2, actor, { id: item.id, serial }),
    );
    if (result === null) return;

    const anterior = item.serial.trim().toUpperCase();
    const siguiente = serial.trim().toUpperCase();
    if (anterior !== siguiente) {
      lecturasTerminadasRef.current.delete(anterior);
      lecturasTerminadasRef.current.add(siguiente);
    }
    if (ultimoSerialAgregado.trim().toUpperCase() === anterior) {
      setUltimoSerialAgregado(serial.trim());
    }
  };

  /** Al quitar una unidad, libera su serial para que pueda capturarse de nuevo. */
  const handleRemoveItem = async (item: (typeof items)[number]) => {
    const result = await runAction((db2, actor) =>
      removeReceptionItem(db2, actor, { id: item.id }),
    );
    if (result === null) return;

    const serialNormalizado = item.serial.trim().toUpperCase();
    lecturasTerminadasRef.current.delete(serialNormalizado);
    if (ultimoSerialAgregado.trim().toUpperCase() === serialNormalizado) {
      const restantes = items.filter((capturado) => capturado.id !== item.id);
      setUltimoSerialAgregado(restantes[restantes.length - 1]?.serial ?? "");
    }
  };

  /**
   * Celular recibido apagado: no se puede leer el IMEI todavía. Se registra con un
   * serial temporal (prefijo "PEND-") para no perder el conteo, y se completa después
   * editando la unidad (aquí mismo o desde Inventario) cuando se encienda.
   */
  const handleAgregarSinSerie = () => {
    const codigo = generarCodigoInterno(
      (serial) =>
        db.units.some((unit) => unit.serial === serial) ||
        items.some((item) => item.serial === serial),
    );
    return handleScan(codigo);
  };

  /** Los repuestos entran por cantidad: se genera un serial interno por unidad. */
  const handleAgregarRepuesto = () =>
    runExclusivo(async () => {
      if (!productId || procesandoColaRef.current) return;
      if (receptionId && confirmed) return;
      const quantity = Math.min(Math.max(Math.trunc(Number(repuestoQty) || 1), 1), 500);
      let targetId = receptionId;
      if (!targetId) {
        const created = await runAction((db2, actor) =>
          createReception(db2, actor, {
            supplierId,
            reference,
            receivedAt: `${receivedAt}T09:00:00.000Z`,
            notes,
          }),
        );
        if (!created) return;
        targetId = created.id;
        receptionIdRef.current = created.id;
        setReceptionId(created.id);
      }
      const result = await runAction((db2, actor) =>
        addReceptionItem(db2, actor, {
          receptionId: targetId as string,
          productId,
          condition,
          cost: cost ? Number(cost) : undefined,
          quantity,
        }),
      );
      if (result) {
        setCost("");
        setRepuestoQty("1");
      }
    });

  const handleConfirm = () =>
    runExclusivo(async () => {
      if (!receptionId || procesandoColaRef.current) return;
      setTotalConfirmando(items.length);
      setSaving(true);
      try {
        const result = await runAction(
          (db2, actor) => confirmReception(db2, actor, { id: receptionId }),
          { success: "receptions.confirmed", deferOptimistic: true, key: `confirmar-${receptionId}` },
        );
        if (result) navigate("/recepcion");
      } finally {
        setSaving(false);
      }
    });

  const handleDiscard = () =>
    runExclusivo(async () => {
      if (procesandoColaRef.current) return;
      if (!receptionId) {
        navigate("/recepcion");
        return;
      }
      const result = await runAction(
        (db2, actor) => discardReception(db2, actor, { id: receptionId }),
        { success: "receptions.discarded" },
      );
      if (result !== null) navigate("/recepcion");
    });

  /** Acciones de cierre: en escritorio van en el encabezado, en móvil en la barra inferior. */
  const actionButtons = (
    <>
      <ConfirmDialog
        trigger={
          <Button variant="outline" type="button" disabled={busy || pendientes > 0}>
            <Trash2 />
            <span className="hidden sm:inline">{t("receptions.discard")}</span>
          </Button>
        }
        title={t("receptions.discardTitle")}
        description={t("receptions.discardDescription")}
        confirmLabel={t("receptions.discard")}
        destructive
        onConfirm={handleDiscard}
      />
      <Button
        type="button"
        loading={saving}
        disabled={items.length === 0 || saving || busy || procesandoColaRef.current || pendientes > 0}
        onClick={() => void handleConfirm()}
      >
        {!saving ? <Check /> : null}
        {saving ? t("receptions.confirmingUnits", { count: totalConfirmando.toLocaleString("es-CO") }) : t("receptions.confirm")}
      </Button>
    </>
  );

  // Las unidades se agrupan por referencia y condición, en el orden en que se fueron capturando.
  const grupos = useMemo(() => {
    const mapa = new Map<
      string,
      { clave: string; product?: Product; esRepuesto: boolean; condition: UnitCondition; items: typeof items }
    >();
    for (const item of items) {
      const product = db.products.find((p) => p.id === item.productId);
      const esRepuesto = product?.categoria === "repuesto";
      const clave = `${item.productId}|${esRepuesto ? "" : item.condition}`;
      const grupo = mapa.get(clave);
      if (grupo) grupo.items.push(item);
      else mapa.set(clave, { clave, product, esRepuesto, condition: item.condition, items: [item] });
    }
    return [...mapa.values()];
  }, [items, db.products]);

  // Cuando se agrega una unidad, la lista se desplaza hasta la última capturada.
  const listaRef = useRef<HTMLDivElement>(null);
  const cantidadAnterior = useRef(items.length);
  useEffect(() => {
    if (items.length > cantidadAnterior.current) {
      const ultima = items[items.length - 1];
      listaRef.current
        ?.querySelector(`[data-item-id="${ultima?.id}"]`)
        ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }
    cantidadAnterior.current = items.length;
  }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-1 flex-col gap-5 animate-fade-in">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" asChild>
              <Link to="/recepcion" aria-label={t("common.back")}>
                <ArrowLeft />
              </Link>
            </Button>
            {reception ? (
              <span className="font-tabular">{reception.code}</span>
            ) : (
              t("receptions.new")
            )}
          </span>
        }
        description={t("receptions.captureSubtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {reception ? (
              <Badge
                tone={confirmed ? "success" : "info"}
                label={t(`receptionStatus.${confirmed ? "confirmada" : "captura"}`)}
              />
            ) : null}
            {!confirmed ? (
              <div className="hidden gap-2 lg:flex">{actionButtons}</div>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(21rem,26rem)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <section className="order-2 space-y-3 rounded-xl border bg-card p-5 shadow-sm lg:order-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <IconoSeccion>
                <ClipboardList />
              </IconoSeccion>
              {t("receptions.headerTitle")}
            </h3>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="reception-supplier">Proveedor</Label>
                {!confirmed ? (
                  <SupplierFormDialog
                    onSaved={(created) => {
                      setSuppliers((current) =>
                        [...current.filter((item) => item.id !== created.id), created]
                          .sort((a, b) => a.name.localeCompare(b.name)));
                      setSupplierId(created.id);
                      if (receptionId) void persistHeader(created.id);
                    }}
                    trigger={
                      <Button type="button" size="sm" variant="outline" disabled={saving || busy}>
                        <Plus className="h-3.5 w-3.5" /> Crear proveedor
                      </Button>
                    }
                  />
                ) : null}
              </div>
              <select
                id="reception-supplier"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                value={supplierId}
                disabled={confirmed || saving || busy || suppliersLoading}
                onChange={(event) => {
                  const next = event.target.value;
                  setSupplierId(next);
                  if (receptionId) void persistHeader(next);
                }}
              >
                <option value="">{suppliersLoading ? "Cargando proveedores..." : "Selecciona un proveedor (opcional)"}</option>
                {suppliers.filter((provider) => provider.isActive || provider.id === supplierId)
                  .map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}{provider.isActive ? "" : " (inactivo)"}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-muted-foreground">
                El proveedor seleccionado quedará guardado con esta recepción. Puedes crear uno sin salir de aquí.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference">{t("receptions.reference")}</Label>
              <Input
                id="reference"
                value={reference}
                disabled={confirmed || pendientes > 0}
                placeholder="REM-4471"
                onChange={(event) => setReference(event.target.value)}
                onBlur={() => void persistHeader()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receivedAt">{t("receptions.receivedAt")}</Label>
              <Input
                id="receivedAt"
                type="date"
                value={receivedAt}
                disabled={confirmed || pendientes > 0}
                onChange={(event) => setReceivedAt(event.target.value)}
                onBlur={() => void persistHeader()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">{t("common.notes")}</Label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                disabled={confirmed || pendientes > 0}
                onChange={(event) => setNotes(event.target.value)}
                onBlur={() => void persistHeader()}
              />
            </div>
          </section>

          <section className="order-1 space-y-4 rounded-xl border border-primary/20 bg-card p-5 shadow-sm lg:order-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <IconoSeccion>
                <ScanLine />
              </IconoSeccion>
              {t("receptions.captureTitle")}
            </h3>

            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("receptions.categoryTitle")}
              </Label>
              <div className="flex flex-wrap gap-2">
                {categoriaFiltros.map((option) => (
                  <Button
                    key={option.value || "all"}
                    type="button"
                    size="sm"
                    variant={catFilter === option.value ? "default" : "outline"}
                    disabled={confirmed}
                    onClick={() => cambiarCategoria(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {!esRepuesto ? (
              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("receptions.conditionTitle")}
                </Label>
                <ToggleGroup
                  type="single"
                  value={condition}
                  onValueChange={(value) => value && pendientes === 0 && setCondition(value as UnitCondition)}
                  className="justify-start"
                >
                  <ToggleGroupItem value="nuevo" className="flex-1" disabled={confirmed}>
                    {t("condition.nuevo")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="seminuevo" className="flex-1" disabled={confirmed}>
                    {t("condition.seminuevo")}
                  </ToggleGroupItem>
                </ToggleGroup>
                <p className="text-xs text-muted-foreground">{t("receptions.conditionHint")}</p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>{t("receptions.productModel")}</Label>
              <ProductPicker
                products={productosFiltrados}
                value={productId}
                onChange={(id) => { if (pendientes === 0) setProductId(id); }}
                placeholder={t("product.select")}
              />
              {productosFiltrados.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("receptions.noProductsInCategory")}
                </p>
              ) : null}
            </div>

            {esRepuesto ? (
              <div className="space-y-2">
                <Label>{t("receptions.quantity")}</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={repuestoQty}
                    disabled={confirmed || !productId}
                    onChange={(event) => setRepuestoQty(event.target.value)}
                    className="w-24"
                    aria-label={t("receptions.quantity")}
                  />
                  <Button
                    type="button"
                    disabled={confirmed || !productId || busy || pendientes > 0}
                    onClick={() => void handleAgregarRepuesto()}
                  >
                    <Plus />
                    {t("receptions.addUnits")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>{t("receptions.serialScan")}</Label>
                <SerialScanInput
                  stacked
                  hidePhoto
                  submitLabel={t("receptions.add")}
                  onScan={handleScan}
                  // Los celulares solo aceptan IMEI de 15 dígitos con dígito de control válido.
                  validate={(serial) => {
                    if (selectedProduct?.categoria !== "celular") return null;
                    const errorImei = errorDeSerialCelular(serial);
                    return errorImei ? t(errorImei) : null;
                  }}
                  disabled={confirmed || !productId}
                  placeholder={t("receptions.serialPlaceholder")}
                  hint={productId ? undefined : t("receptions.selectProductFirst")}
                />
                {(items.length > 0 || rechazados.length > 0 || pendientes > 0) ? <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-center text-xs"><div><strong className="block text-lg text-primary">{items.length}</strong>Registrados</div><div><strong className="block text-lg text-destructive">{rechazados.length}</strong>Rechazados</div><div><strong className="block text-lg">{pendientes}</strong>Pendientes</div></div> : null}
                {rechazados.length > 0 ? (
                  <div className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs">
                    <p className="font-medium text-destructive">Lecturas sin registrar: revisa el motivo y reintenta.</p>
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {rechazados.map((registro, index) => (
                      <div key={`${registro.serial}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background p-2">
                        <div className="min-w-0 flex-1"><p className="break-all font-semibold">{registro.serial}</p><p className="mt-1 text-muted-foreground">{registro.motivo}</p></div>
                        <Button type="button" size="sm" variant="outline" disabled={confirmed || procesandoColaRef.current} onClick={() => reintentarLectura(registro)}>Reintentar</Button>
                      </div>
                    ))}
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRechazados([])}>Descartar avisos</Button>
                  </div>
                ) : null}
                {pendientes > 0 ? <p role="status" aria-live="polite" className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm font-medium text-primary">Procesando {pendientes} {pendientes === 1 ? "lectura" : "lecturas"}… Puedes seguir escaneando; espera antes de confirmar.</p> : null}
                {ultimoSerialAgregado ? <p role="status" className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-xs text-primary"><Check className="h-4 w-4 shrink-0" /> Último equipo registrado: <strong className="break-all">{ultimoSerialAgregado}</strong></p> : null}
                {selectedProduct?.categoria === "celular" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={confirmed || !productId || busy}
                    onClick={() => void handleAgregarSinSerie()}
                  >
                    <Power />
                    {t("receptions.addPendingImei")}
                  </Button>
                ) : null}
              </div>
            )}

            <p className="border-t pt-3 text-xs text-muted-foreground">
              {t(esRepuesto ? "receptions.repuestoHint" : "receptions.serialNote")}
            </p>
          </section>
        </div>

        <section className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)]">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <IconoSeccion>
                <Boxes />
              </IconoSeccion>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t("receptions.itemsTitle")}</h3>
                <p className="truncate text-xs text-muted-foreground">
                  {t("receptions.itemsSummary", { total: items.length, nuevo: newCount, seminuevo: usedCount })}
                </p>
              </div>
            </div>
            <Badge tone="primary" label={t("receptions.itemsCount", { count: items.length })} />
          </div>

          {items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={PackagePlus}
                title={t("receptions.noItemsTitle")}
                description={t("receptions.noItemsDescription")}
                className="border-0 bg-transparent"
              />
            </div>
          ) : (
            <>
              <div ref={listaRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto -mr-4 p-4 pr-4">
                {grupos.map((grupo) => (
                  <div key={grupo.clave}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <ProductThumbnail src={grupo.product?.imageUrl} alt={grupo.product?.name ?? "Referencia"} size="xl" className="h-16 w-16 sm:h-20 sm:w-20" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{grupo.product?.name ?? "—"}</p>
                          <p className="font-tabular truncate text-xs text-muted-foreground">
                            {grupo.product?.sku ?? ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {grupo.esRepuesto ? null : <ConditionBadge condition={grupo.condition} />}
                        <span className="font-tabular rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                          {grupo.items.length}
                        </span>
                      </div>
                    </div>
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.75rem,1fr))] gap-1.5">
                      {grupo.items.map((item) => (
                        <ReceptionItemChip
                          key={item.id}
                          item={item}
                          product={grupo.product}
                          readOnly={confirmed}
                          onSerialChange={(serial) => void handleSerialChange(item, serial)}
                          onConditionChange={(next) =>
                            void runAction((db2, actor) =>
                              updateReceptionItem(db2, actor, { id: item.id, condition: next }),
                            )
                          }
                          onRemove={() => void handleRemoveItem(item)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Info className="h-4 w-4 shrink-0" />
                  {t("receptions.verifyHint")}
                </span>
                <span className="font-tabular font-medium text-foreground">
                  {t("receptions.totalUnits", { count: items.length })}
                </span>
              </div>
            </>
          )}
        </section>
      </div>

      {!confirmed ? (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-30 mx-4 flex shrink-0 items-center justify-between gap-3 rounded-lg border bg-card/95 p-3 shadow-elegant backdrop-blur lg:hidden">
          <div className="min-w-0 text-sm">
            <p className="font-semibold">
              {t("receptions.itemsCount", { count: items.length })}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {t("receptions.itemsSummary", { total: items.length, nuevo: newCount, seminuevo: usedCount })}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">{actionButtons}</div>
        </div>
      ) : null}
    </div>
  );
};

export default NuevaRecepcion;
