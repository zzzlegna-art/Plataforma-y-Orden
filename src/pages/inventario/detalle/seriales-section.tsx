import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Printer, ScanLine, Search, X } from "lucide-react";

import { CopySerialButton } from "@/components/shared/copy-serial-button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PrintLabelsDialog } from "@/components/shared/print-labels-dialog";
import { UnitDetailSheet } from "@/pages/unidades/UnitDetailSheet";
import { UnitStatusMenu } from "@/components/shared/unit-status-menu";
import { useStore } from "@/hooks/use-store";
import { ConditionBadge, PendingImeiBadge, UnitStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { estadoControl, esVerificada, ordenarUnidades } from "@/lib/control-fisico";
import { formatDate } from "@/lib/format";
import { esCodigoInterno } from "@/lib/imei";
import { imprimirEtiquetas } from "@/lib/print-labels";
import { getActiveOrderByUnit, type UnitRow } from "@/lib/selectors";
import type { Product, UnitCondition } from "@/lib/types";
import { ControlCheck, ControlFisicoPanel } from "./control-fisico";
import { useControlFisico } from "./use-control-fisico";

type Vista = "todos" | "pendientes" | "verificados";

/**
 * Seriales de un producto: primero los que están en bodega y luego el resto, agrupado por
 * estado. Incluye el control físico (marcar lo que se tiene en la mano, con lector o cámara).
 */
export const SerialesSeccion = ({
  product,
  units,
  condicion,
  onCambiarCondicion,
}: {
  product: Product;
  /** Unidades del producto, ya filtradas por condición. */
  units: UnitRow[];
  condicion?: UnitCondition;
  onCambiarCondicion: (condicion?: UnitCondition) => void;
}) => {
  const { t } = useTranslation();
  const { db } = useStore();
  const pedidosActivos = useMemo(() => getActiveOrderByUnit(db),
    [db.orders, db.orderItems, db.orderItemUnits]);
  const control = useControlFisico(product, condicion);
  const [vista, setVista] = useState<Vista>("todos");
  const [busquedaSerial, setBusquedaSerial] = useState("");
  // Selección para imprimir etiquetas: independiente del control físico (esto es para llevar
  // varios seriales a la impresora de una vez, no para contarlos físicamente).
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [dialogoImprimir, setDialogoImprimir] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const ordenadas = useMemo(() => ordenarUnidades(units), [units]);
  const estado = useMemo(
    () =>
      estadoControl(
        product,
        units.map((item) => item.unit),
      ),
    [product, units],
  );

  // Con el control en curso se puede ver solo lo pendiente o solo lo verificado.
  const vistaActiva: Vista = estado.activo ? vista : "todos";
  const filtradasPorControl = useMemo(
    () =>
      vistaActiva === "todos"
        ? ordenadas
        : ordenadas.filter(
            (item) => esVerificada(item.unit, product) === (vistaActiva === "verificados"),
          ),
    [ordenadas, product, vistaActiva],
  );

  // La búsqueda es local, instantánea y se combina con la condición y el control físico.
  // El serial completo sigue visible y se puede abrir o copiar desde el resultado.
  const terminoSerial = busquedaSerial.trim().toLocaleLowerCase("es");
  const visibles = useMemo(
    () => terminoSerial
      ? filtradasPorControl.filter((item) =>
          item.unit.serial.toLocaleLowerCase("es").includes(terminoSerial),
        )
      : filtradasPorControl,
    [filtradasPorControl, terminoSerial],
  );

  const alcance =
    condicion === "nuevo"
      ? t("export.nuevos")
      : condicion === "seminuevo"
        ? t("export.seminuevos")
        : undefined;

  const resaltar = (item: UnitRow) => {
    if (control.recienMarcada?.unitId === item.unit.id) {
      // Destello breve al marcar (dura mientras existe recienMarcada); al apagarse queda el
      // tono de reposo de abajo, sin salto de color.
      return control.recienMarcada.tono === "success" ? "animate-row-flash-success" : "animate-row-flash-warning";
    }
    if (!estado.activo || !esVerificada(item.unit, product)) return undefined;
    return item.unit.status === "en_bodega" ? "bg-success/10" : "bg-warning/10";
  };

  const alternarSeleccion = (unitId: string) =>
    setSeleccionados((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(unitId)) siguiente.delete(unitId);
      else siguiente.add(unitId);
      return siguiente;
    });

  const imprimirSeleccionados = (nota: string) => {
    // Conservar los seleccionados entre búsquedas: no omitir etiquetas cuando el
    // usuario elige varios IMEI usando diferentes términos de búsqueda.
    const elegidos = ordenadas.filter((item) => seleccionados.has(item.unit.id));
    if (elegidos.length === 0) return;
    imprimirEtiquetas(elegidos.map((item) => ({ producto: product.name, serial: item.unit.serial, nota })));
  };

  const columnas: Column<UnitRow>[] = [
    {
      key: "seleccion",
      header: "",
      className: "w-10",
      cell: (item: UnitRow) => (
        <Checkbox
          aria-label={t("unit.selectForPrint")}
          checked={seleccionados.has(item.unit.id)}
          onCheckedChange={() => alternarSeleccion(item.unit.id)}
        />
      ),
    },
    ...(estado.activo
      ? [
          {
            key: "control",
            header: t("control.column"),
            className: "w-16",
            cell: (item: UnitRow) => (
              <ControlCheck unit={item.unit} product={product} onToggle={control.alternarUnidad} />
            ),
          },
        ]
      : []),
    {
      key: "serial",
      header: t("unit.serial"),
      cell: (item) => (
        <span className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Ver hoja de vida del IMEI ${item.unit.serial}`}
            onClick={() => setSelectedUnitId(item.unit.id)}
            className="font-tabular rounded-md text-left font-semibold text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <span className="font-tabular">{item.unit.serial}</span>
          </button>
          {esCodigoInterno(item.unit.serial) ? <PendingImeiBadge /> : null}
          <CopySerialButton serial={item.unit.serial} />
        </span>
      ),
    },
    {
      key: "condition",
      header: t("unit.condition"),
      cell: (item) => <ConditionBadge condition={item.unit.condition} />,
    },
    {
      key: "status",
      header: t("common.status"),
      cell: (item) => pedidosActivos.has(item.unit.id)
        ? <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            En pedido · <Link className="underline underline-offset-2" to={`/pedidos/${pedidosActivos.get(item.unit.id)?.id}`}>
              {pedidosActivos.get(item.unit.id)?.code}
            </Link>
          </span>
        : <UnitStatusBadge status={item.unit.status} />,
    },
    {
      key: "received",
      header: t("unit.receivedAt"),
      cell: (item) => (
        <span className="text-sm text-muted-foreground">{formatDate(item.unit.receivedAt)}</span>
      ),
    },
    {
      key: "actions",
      header: t("common.actions"),
      align: "right",
      cell: (item) => pedidosActivos.has(item.unit.id) ? null : <UnitStatusMenu unit={item.unit} />,
    },
  ];

  return (
    <section className="space-y-3">
      <ControlFisicoPanel
        product={product}
        estado={estado}
        control={control}
        alcance={alcance}
        totalUnidades={units.length}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold">
          {t("unit.title")}{" "}
          <span className="font-normal text-muted-foreground">
            {terminoSerial
              ? `(${visibles.length} / ${filtradasPorControl.length})`
              : `(${visibles.length})`}
          </span>
        </h3>
        <div className="flex flex-wrap gap-2">
          {estado.activo ? (
            <div className="flex gap-1 rounded-md border bg-muted/40 p-0.5">
              {(["todos", "pendientes", "verificados"] as const).map((opcion) => (
                <Button
                  key={opcion}
                  size="sm"
                  variant={vistaActiva === opcion ? "default" : "ghost"}
                  className="h-7 px-3"
                  onClick={() => setVista(opcion)}
                >
                  {t(
                    opcion === "todos"
                      ? "control.filter.all"
                      : opcion === "pendientes"
                        ? "control.filter.pending"
                        : "control.filter.verified",
                  )}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-1 rounded-md border bg-muted/40 p-0.5">
            {([undefined, "nuevo", "seminuevo"] as const).map((option) => (
              <Button
                key={option ?? "todas"}
                size="sm"
                variant={condicion === option ? "default" : "ghost"}
                className="h-7 px-3"
                onClick={() => onCambiarCondicion(option ?? undefined)}
              >
                {option === undefined
                  ? t("common.all")
                  : option === "nuevo"
                    ? t("export.nuevos")
                    : t("export.seminuevos")}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={busquedaSerial}
            onChange={(event) => setBusquedaSerial(event.target.value)}
            aria-label={t("unit.searchWithinReference")}
            placeholder={t("unit.searchWithinReferencePlaceholder")}
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          {busquedaSerial ? (
            <button
              type="button"
              aria-label={t("unit.clearSerialSearch")}
              title={t("unit.clearSerialSearch")}
              onClick={() => setBusquedaSerial("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {terminoSerial ? (
          <span aria-live="polite" className="text-xs text-muted-foreground">
            {t("unit.searchMatchesCount", { shown: visibles.length, total: filtradasPorControl.length })}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
        <Checkbox
          aria-label={t("unit.selectAllForPrint")}
          checked={visibles.length > 0 && visibles.every((item) => seleccionados.has(item.unit.id))}
          onCheckedChange={(marcado) =>
            setSeleccionados((previo) => {
              const siguiente = new Set(previo);
              visibles.forEach((item) => (marcado ? siguiente.add(item.unit.id) : siguiente.delete(item.unit.id)));
              return siguiente;
            })
          }
        />
        <span className="text-sm text-muted-foreground">
          {seleccionados.size > 0
            ? t("unit.selectedCount", { count: seleccionados.size })
            : t("unit.selectForPrintHint")}
        </span>
        {seleccionados.size > 0 ? (
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setSeleccionados(new Set())}>
            <X />
            {t("common.clear")}
          </Button>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="h-7"
            disabled={seleccionados.size === 0}
            onClick={() => setDialogoImprimir(true)}
          >
            <Printer />
            {seleccionados.size > 0
              ? t("unit.printLabelsCount", { count: seleccionados.size })
              : t("unit.printLabels")}
          </Button>
        </div>
      </div>

      <DataTable
        rows={visibles}
        rowKey={(item) => item.unit.id}
        rowClassName={resaltar}
        emptyTitle={terminoSerial ? t("unit.noSerialMatches") : t("unit.emptyTitle")}
        emptyDescription={terminoSerial ? t("unit.noSerialMatchesDescription") : t("unit.emptyProductDescription")}
        emptyIcon={terminoSerial ? Search : ScanLine}
        emptyAction={terminoSerial ? (
          <Button variant="outline" size="sm" onClick={() => setBusquedaSerial("")}>
            {t("unit.clearSerialSearch")}
          </Button>
        ) : undefined}
        renderCard={(item) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <Checkbox
                  aria-label={t("unit.selectForPrint")}
                  checked={seleccionados.has(item.unit.id)}
                  onCheckedChange={() => alternarSeleccion(item.unit.id)}
                />
                {estado.activo ? (
                  <ControlCheck
                    unit={item.unit}
                    product={product}
                    onToggle={control.alternarUnidad}
                  />
                ) : null}
                <button
                  type="button"
                  aria-label={`Ver hoja de vida del IMEI ${item.unit.serial}`}
                  onClick={() => setSelectedUnitId(item.unit.id)}
                  className="font-tabular max-w-full truncate rounded-md text-left font-semibold text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  {item.unit.serial}
                </button>
                <CopySerialButton serial={item.unit.serial} />
              </div>
              {pedidosActivos.has(item.unit.id)
                ? <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">En pedido · no disponible</span>
                : <UnitStatusBadge status={item.unit.status} />}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ConditionBadge condition={item.unit.condition} />
                {esCodigoInterno(item.unit.serial) ? <PendingImeiBadge /> : null}
              </div>
              {pedidosActivos.has(item.unit.id) ? null : <UnitStatusMenu unit={item.unit} />}
            </div>
          </div>
        )}
        columns={columnas}
      />

      <UnitDetailSheet
        unitId={selectedUnitId}
        onClose={() => setSelectedUnitId(null)}
      />

      <PrintLabelsDialog
        open={dialogoImprimir}
        onOpenChange={setDialogoImprimir}
        count={seleccionados.size}
        onConfirm={imprimirSeleccionados}
      />
    </section>
  );
};
