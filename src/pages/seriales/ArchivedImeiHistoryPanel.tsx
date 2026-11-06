import { Link } from "react-router-dom";
import { Archive, CalendarDays, CheckCircle2, Clock3, History, Package, ShieldCheck, Smartphone, UserRound } from "lucide-react";

import { ProductThumbnail } from "@/components/shared/product-thumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { ArchivedImeiTrace } from "@/lib/nexora-archived-imei-trace";

const readable = (value: string | null | undefined): string =>
  value ? value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()) : "No registrado";

type TimelineEntry = { key: string; at: string; title: string; description: string | null };
const buildTimeline = (trace: ArchivedImeiTrace): TimelineEntry[] => {
  const timeline: TimelineEntry[] = [
    {
      key: `order-${trace.order.sourceId}`,
      at: trace.order.orderDate,
      title: "Pedido registrado",
      description: `${trace.order.code} · ${readable(trace.order.status)} · ${trace.customer.name}`,
    },
    ...trace.movements.map((movement) => ({
      key: `movement-${movement.id}`,
      at: movement.occurredAt,
      title: readable(movement.type),
      description: [movement.referenceType ? `Referencia: ${movement.referenceType}` : null, movement.notes]
        .filter(Boolean).join(" · ") || null,
    })),
    ...trace.warranties.flatMap((warranty) => [
      ...(warranty.receivedAt ? [{
        key: `warranty-${warranty.id}`,
        at: warranty.receivedAt,
        title: "Garantía recibida",
        description: warranty.reason,
      }] : []),
      ...warranty.events.map((event) => ({
        key: `warranty-event-${event.id}`,
        at: event.occurredAt,
        title: `Garantía · ${readable(event.status)}`,
        description: event.notes,
      })),
      ...(warranty.resolvedAt ? [{
        key: `warranty-resolved-${warranty.id}`,
        at: warranty.resolvedAt,
        title: "Garantía resuelta",
        description: readable(warranty.status),
      }] : []),
    ]),
  ];

  return timeline
    .filter((entry) => Boolean(entry.at) && !Number.isNaN(Date.parse(entry.at)))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime() || a.key.localeCompare(b.key));
};

/** Visualización unificada: relación comercial histórica, sin inventario editable ni UUID operativos. */
export const ArchivedImeiHistoryPanel = ({ trace }: { trace: ArchivedImeiTrace }) => {
  const timeline = buildTimeline(trace);
  const isDispatched = trace.order.status === "despachado";
  const hasImage = Boolean(trace.product.imageUrl);

  return (
    <section aria-label="Hoja de vida histórica del serial" className="space-y-4 rounded-2xl border border-primary/25 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <History className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Hoja de vida del serial</h2>
            <p className="text-sm text-muted-foreground">Movimientos y pedido original de Techrez</p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
          <ShieldCheck className="h-3.5 w-3.5" />
          Histórico · Solo lectura
        </Badge>
      </div>

      <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-[132px_minmax(0,1fr)]">
        <div className="grid h-40 place-items-center rounded-xl border bg-card p-2">
          {hasImage ? (
            <ProductThumbnail
              src={trace.product.imageUrl}
              alt={trace.product.name}
              size="2xl"
              className="h-full w-full border-0 object-contain shadow-none"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
              <Smartphone className="h-12 w-12 opacity-40" aria-hidden="true" />
              <span className="text-[11px]">Foto no disponible</span>
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <div>
            <h3 className="text-lg font-semibold">{trace.product.name}</h3>
            <p className="break-all font-mono text-sm font-semibold text-primary">{trace.serial}</p>
            {trace.product.sku ? (
              <p className="mt-1 text-xs text-muted-foreground">Referencia: {trace.product.sku}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isDispatched ? "secondary" : "outline"}>
              {isDispatched ? "Pedido despachado" : `Pedido ${readable(trace.order.status)}`}
            </Badge>
            {trace.unit.condition ? (
              <Badge variant="outline">{readable(trace.unit.condition)}</Badge>
            ) : null}
            {trace.unit.color ? <Badge variant="outline">Color: {trace.unit.color}</Badge> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {hasImage
              ? "Fotografía de la misma referencia en el catálogo actual de Nexora."
              : "No existe una fotografía verificada para esta referencia. No se mostrará la de otro modelo."}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Package className="h-4 w-4" /> Pedido original
          </div>
          <Link className="mt-1 inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline"
            to={`/pedidos/historial/${trace.order.sourceId}`}>
            {trace.order.code}
          </Link>
        </div>
        <div className="rounded-xl border p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <UserRound className="h-4 w-4" /> Vendido / asignado a
          </div>
          <p className="mt-1 text-sm font-semibold">{trace.customer.name}</p>
          {!isDispatched ? (
            <p className="mt-1 text-xs text-muted-foreground">Pedido no despachado: no se afirma venta.</p>
          ) : null}
        </div>
        <div className="rounded-xl border p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-4 w-4" /> Fecha del pedido
          </div>
          <p className="mt-1 text-sm font-semibold">{formatDateTime(trace.order.orderDate)}</p>
        </div>
        <div className="rounded-xl border p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" /> Estado
          </div>
          <p className="mt-1 text-sm font-semibold">{readable(trace.order.status)}</p>
          {trace.order.deliveryDate ? (
            <p className="mt-1 text-xs text-muted-foreground">Entrega: {formatDateTime(trace.order.deliveryDate)}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background/60 p-3">
        <div className="text-sm text-muted-foreground">
          Cantidad original de la línea: <strong className="text-foreground">{trace.line.quantity}</strong>
          {" · "}Precio unitario: <strong className="text-foreground">{formatCurrency(trace.line.unitPrice)}</strong>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to={`/pedidos/historial/${trace.order.sourceId}`}>Ver pedido completo</Link>
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Línea de tiempo</h3>
          <Badge variant="outline">{timeline.length} eventos</Badge>
        </div>
        {timeline.length > 0 ? (
          <ol className="space-y-3">
            {timeline.map((event) => (
              <li key={event.key} className="relative border-l border-border pl-4">
                <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{event.title}</strong>
                  <time dateTime={event.at} className="text-xs text-muted-foreground">
                    {formatDateTime(event.at)}
                  </time>
                </div>
                {event.description ? (
                  <p className="mt-1 break-words text-sm text-muted-foreground">{event.description}</p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Este serial no tiene eventos fechados adicionales.</p>
        )}
      </div>

      {trace.warranties.length > 0 ? (
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Garantías relacionadas ({trace.warranties.length})</h3>
          {trace.warranties.map((warranty) => (
            <div key={warranty.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{warranty.code || "Garantía histórica"}</span>
                <Badge variant="secondary">{readable(warranty.status)}</Badge>
              </div>
              {warranty.reason ? <p className="mt-1">{warranty.reason}</p> : null}
              {warranty.replacementSerial ? (
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  IMEI de reemplazo: {warranty.replacementSerial}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <p className="border-t pt-3 text-xs text-muted-foreground">
        Información original del pedido y su trazabilidad archivada. No modifica existencias, costos,
        sedes ni estados del inventario operativo.
      </p>
    </section>
  );
};
