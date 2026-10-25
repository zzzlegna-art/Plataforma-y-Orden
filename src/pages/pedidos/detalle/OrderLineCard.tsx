import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Package, Trash2, X } from "lucide-react";

import { SerialScanInput } from "@/components/shared/serial-scan-input";
import { ConditionBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import type { OrderLineView } from "@/lib/selectors";
import { cn } from "@/lib/utils";

/** Tarjeta de progreso de una referencia del pedido: cantidad y serialización. */
export const OrderLineCard = ({
  line,
  editable,
  edicionDespachado,
  onCambiarCantidad,
  onSerializar,
  onQuitarSerial,
  onQuitarLinea,
  onAgregarUnidades,
  onQuitarUnidades,
  disponibles,
  editablePrecio = false,
  onCambiarPrecio,
  destacada = false,
}: {
  line: OrderLineView;
  editable: boolean;
  edicionDespachado?: boolean;
  onCambiarCantidad: (delta: number) => void;
  onSerializar: (serial: string) => void;
  onQuitarSerial: (serial: string) => void;
  onQuitarLinea: () => void;
  onAgregarUnidades?: () => void;
  onQuitarUnidades?: () => void;
  /** Unidades libres en inventario (solo se usa en los repuestos). */
  disponibles?: number;
  editablePrecio?: boolean;
  onCambiarPrecio?: (precio: number) => void;
  /** Resalta la tarjeta: un serial escaneado en otra referencia acaba de caer aquí. */
  destacada?: boolean;
}) => {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const [precioBorrador, setPrecioBorrador] = useState(String(line.item.unitPrice));
  useEffect(() => setPrecioBorrador(String(line.item.unitPrice)), [line.item.unitPrice]);
  const pct = Math.min(100, Math.round((line.serializados / line.item.quantity) * 100));
  const complete = line.serializados >= line.item.quantity;
  // Los repuestos no se escanean: mientras el pedido se prepara se descuentan solos al finalizar.
  const autoRepuesto = line.esRepuesto && editable;
  const costosUnidades = line.units.map((unit) => unit.cost ?? line.product?.cost ?? 0);
  const costoReferencia = costosUnidades.length > 0 ? Math.max(...costosUnidades) : (line.product?.cost ?? 0);
  const precioNumerico = Number(precioBorrador);
  const margenBrutoPct = precioNumerico > 0 ? ((precioNumerico - costoReferencia) / precioNumerico) * 100 : -100;
  const precioValido = Number.isFinite(precioNumerico) && precioNumerico > 0;

  // El campo para escanear o escribir seriales va arriba, junto a la referencia, para ver cómo
  // sube el contador mientras se agregan, sin bajar hasta el final de la lista.
  const mostrarEscaner = editable && !complete && !line.esRepuesto;

  const controles = (
    <div className={cn("flex items-center gap-1", mostrarEscaner && "lg:col-start-3 lg:row-start-1")}>
      {edicionDespachado ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label={t("order.quitarUnidad")}
            disabled={line.item.quantity === 0}
            onClick={() => onQuitarUnidades?.()}
          >
            −
          </Button>
          <span className="font-tabular w-16 text-center text-sm">
            {line.serializados}/{line.item.quantity}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label={t("order.agregarUnidad")}
            onClick={() => onAgregarUnidades?.()}
          >
            +
          </Button>
        </>
      ) : editable ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={line.item.quantity - 1 < line.serializados}
            onClick={() => onCambiarCantidad(-1)}
          >
            −
          </Button>
          <span className="font-tabular w-16 text-center text-sm">
            {autoRepuesto ? line.item.quantity : `${line.serializados}/${line.item.quantity}`}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onCambiarCantidad(1)}
          >
            +
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            aria-label={t("order.removeLine")}
            disabled={line.serializados > 0}
            onClick={onQuitarLinea}
          >
            <Trash2 />
          </Button>
        </>
      ) : (
        <span className="font-tabular text-sm">
          {line.serializados}/{line.item.quantity}
        </span>
      )}
    </div>
  );

  return (
    <div
      id={`linea-${line.item.id}`}
      className={cn(
        "rounded-lg border bg-card p-4 shadow-sm transition-[box-shadow,border-color] duration-300 motion-reduce:transition-none",
        destacada && "border-primary shadow-elegant ring-2 ring-primary/60",
      )}
    >
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3",
          mostrarEscaner && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]",
        )}
      >
        <div className={cn("flex min-w-0 items-start gap-3", mostrarEscaner && "lg:col-start-1 lg:row-start-1")}>
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-background text-muted-foreground">
            {line.product?.imageUrl && !imageFailed ? (
              <img
                src={line.product.imageUrl}
                alt={line.product.name}
                loading="lazy"
                decoding="async"
                onError={() => setImageFailed(true)}
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <Package aria-hidden="true" className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{line.product?.name ?? "—"}</p>
            <p className="font-tabular truncate text-xs text-muted-foreground">
              {line.product?.sku ?? ""}
            </p>
            <div className="mt-1">
              <ConditionBadge condition={line.item.condition ?? "nuevo"} />
            </div>
            {destacada ? (
              <p className="mt-1.5 animate-pop-in text-xs font-semibold text-primary motion-reduce:animate-none">
                {t("order.serialIncluidoAqui")}
              </p>
            ) : null}
          </div>
        </div>

        {controles}

        {mostrarEscaner ? (
          <div className="col-span-2 row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
            <SerialScanInput
              onScan={onSerializar}
              hint={t("order.scanHint")}
              placeholder={t("order.scanPlaceholder")}
            />
          </div>
        ) : null}
      </div>

      {autoRepuesto ? (
        <div className="mt-3 rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
          <p>{t("order.repuestoAuto")}</p>
          {disponibles !== undefined ? (
            <p
              className={cn(
                "font-tabular mt-1 font-medium",
                disponibles >= line.item.quantity ? "text-success" : "text-destructive",
              )}
            >
              {t("order.repuestoStock", { count: disponibles })}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none",
                complete ? "bg-success" : "bg-primary",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p
            key={complete ? "completa" : "pendiente"}
            className={cn(
              "mt-1 animate-fade-in text-xs motion-reduce:animate-none",
              complete ? "font-medium text-success" : "text-muted-foreground",
            )}
          >
            {complete
              ? t(line.esRepuesto ? "order.repuestoAsignados" : "order.lineComplete")
              : t("order.linePending", { count: line.item.quantity - line.serializados })}
          </p>
        </>
      )}

      {editablePrecio ? (
        <div className="mt-4 space-y-2 rounded-lg border bg-muted/20 p-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0 space-y-1.5">
              <label htmlFor={`precio-venta-${line.item.id}`} className="text-xs font-medium text-muted-foreground">
                {t("order.salesPrice")}
              </label>
              <Input
                id={`precio-venta-${line.item.id}`}
                type="number"
                min="0.01"
                step="0.01"
                value={precioBorrador}
                onChange={(event) => setPrecioBorrador(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!precioValido || precioNumerico === line.item.unitPrice}
              onClick={() => onCambiarPrecio?.(precioNumerico)}
            >
              {t("order.savePrice")}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              {t("order.lineSubtotal", { subtotal: formatCurrency(precioValido ? precioNumerico * line.item.quantity : 0) })}
            </span>
            <span className={cn("font-medium", margenBrutoPct < 5 ? "text-warning" : "text-success")}>
              {t("order.grossMargin", { margin: margenBrutoPct.toFixed(1) })}
            </span>
          </div>
          {margenBrutoPct < 5 ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs text-warning">
              {t("order.marginWarning")}
            </p>
          ) : null}
        </div>
      ) : null}

      {autoRepuesto ? null : line.units.length > 0 ? (
        // Los seriales ya ingresados van como etiquetas compactas en cuadrícula: caben varios por
        // fila y se alinean en columnas, en vez de una fila ancha por cada uno.
        <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9.75rem,1fr))] gap-1.5">
          {line.units.map((unit) => (
            <li
              key={unit.id}
              className="flex animate-fade-in items-center justify-between gap-1 rounded-md border bg-background/40 py-1 pl-2.5 pr-1 motion-reduce:animate-none"
            >
              <span className="font-tabular text-[13px]">{unit.serial}</span>
              {editable || edicionDespachado ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-destructive"
                  aria-label={t("order.quitarSerial")}
                  onClick={() => onQuitarSerial(unit.serial)}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
          {t("order.noSerials")}
        </p>
      )}
    </div>
  );
};
