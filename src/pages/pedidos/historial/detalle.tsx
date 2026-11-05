import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Archive,
  Clock3,
  FileText,
  History,
  Loader2,
  Package,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getHistoricalOrderDetail,
  type HistoricalOrderDetail,
} from "@/lib/historical-orders";
import { formatCurrency, formatDate } from "@/lib/format";

const fecha = (value?: string | null) => (value ? formatDate(value) : "—");
const estado = (value?: string | null) =>
  (value || "Sin estado").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

const textoAuditoria = (entry: { snapshot: Record<string, unknown> }) => {
  const snapshot = entry.snapshot ?? {};
  const action = snapshot.action ?? snapshot.event ?? snapshot.status ?? snapshot.type;
  const detail = snapshot.details ?? snapshot.notes ?? snapshot.description;
  return {
    action: typeof action === "string" ? action : "Registro histórico",
    detail: typeof detail === "string" ? detail : "",
  };
};

const PedidoHistoricoDetalle = () => {
  const { sourceId } = useParams();
  const [detail, setDetail] = useState<HistoricalOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;

    const cargar = async () => {
      if (!sourceId) {
        setError("No se indicó el identificador del pedido.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const result = await getHistoricalOrderDetail(sourceId);
        if (vigente) setDetail(result);
      } catch (cause) {
        if (vigente) {
          setError(
            cause instanceof Error
              ? cause.message
              : "No fue posible cargar el detalle histórico.",
          );
        }
      } finally {
        if (vigente) setLoading(false);
      }
    };

    void cargar();
    return () => {
      vigente = false;
    };
  }, [sourceId]);

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Consultando el historial del pedido…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Pedido histórico"
          description="Consulta de solo lectura"
          actions={
            <Button variant="outline" asChild>
              <Link to="/pedidos?registro=historico">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver al historial
              </Link>
            </Button>
          }
        />
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
          <p className="font-semibold text-destructive">No se pudo abrir el pedido</p>
          <p className="mt-1 text-muted-foreground">{error ?? "Pedido histórico no disponible."}</p>
        </div>
      </div>
    );
  }

  const { order, customer, lines, movements, warranties, audit, relatedAudit, documents } = detail;

  return (
    <div className="space-y-5 stagger nx-operations nx-operations-pedidos">
      <PageHeader
        title={order.code}
        description="Pedido histórico importado desde Techrez"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 border-primary/30 px-3 py-1.5 text-primary">
              <Archive className="h-3.5 w-3.5" />
              Importado · Solo lectura
            </Badge>
            <Button variant="outline" asChild>
              <Link to="/pedidos?registro=historico">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-primary" />
              Información del pedido
            </CardTitle>
            <CardDescription>Datos originales conservados en el archivo histórico.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <div>
              <p className="text-muted-foreground">Código</p>
              <p className="mt-1 font-tabular font-semibold">{order.code}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Estado original</p>
              <div className="mt-1"><Badge variant="secondary">{estado(order.status)}</Badge></div>
            </div>
            <div>
              <p className="text-muted-foreground">Fecha del pedido</p>
              <p className="mt-1 font-medium">{fecha(order.orderDate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Fecha de entrega</p>
              <p className="mt-1 font-medium">{fecha(order.deliveryDate)}</p>
            </div>
            <div className="col-span-2 border-t pt-3">
              <p className="text-muted-foreground">Total original</p>
              <p className="mt-1 font-tabular text-xl font-bold">{formatCurrency(order.total)}</p>
            </div>
            {order.notes ? (
              <div className="col-span-2">
                <p className="text-muted-foreground">Observaciones</p>
                <p className="mt-1 whitespace-pre-wrap">{order.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Cliente original
            </CardTitle>
            <CardDescription>Información del cliente según el registro de Techrez.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Nombre</p>
              <p className="mt-1 font-semibold">{customer?.name ?? "Cliente no identificado"}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">Teléfono</p>
                <p className="mt-1">{customer?.phone ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Correo</p>
                <p className="mt-1 break-all">{customer?.email ?? "—"}</p>
              </div>
            </div>
            {customer?.contactName ? (
              <div>
                <p className="text-muted-foreground">Contacto</p>
                <p className="mt-1">{customer.contactName}</p>
              </div>
            ) : null}
            {customer?.address ? (
              <div>
                <p className="text-muted-foreground">Dirección</p>
                <p className="mt-1">{customer.address}</p>
              </div>
            ) : null}
            {customer?.taxId ? (
              <div>
                <p className="text-muted-foreground">Identificación</p>
                <p className="mt-1">{customer.taxId}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-primary" />
            Productos y seriales
          </CardTitle>
          <CardDescription>
            {lines.length} líneas · {lines.reduce((sum, line) => sum + line.serials.length, 0).toLocaleString("es-CO")} IMEI / seriales vinculados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay líneas disponibles para este pedido.</p>
          ) : (
            lines.map((line) => (
              <div key={line.id} className="rounded-xl border bg-background/60 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">{line.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.productSku ? `SKU ${line.productSku}` : "Sin referencia"}
                      {line.color ? ` · ${line.color}` : ""}
                      {line.condition ? ` · ${line.condition}` : ""}
                    </p>
                  </div>
                  <div className="text-left text-sm sm:text-right">
                    <p className="font-tabular font-semibold">{formatCurrency(line.subtotal)}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.quantity} × {formatCurrency(line.unitPrice)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 border-t pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    IMEI / seriales ({line.serials.length})
                  </p>
                  {line.serials.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Esta línea no tiene seriales asociados.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {line.serials.map((serial) => (
                        <div key={serial.serial} className="rounded-lg border bg-card px-3 py-2">
                          <p className="break-all font-tabular text-sm font-semibold">{serial.serial}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {serial.condition ?? "Condición no registrada"}
                            {serial.receivedAt ? ` · Recibido ${fecha(serial.receivedAt)}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4 text-primary" />
            Movimientos históricos
          </CardTitle>
          <CardDescription>Entradas, salidas, devoluciones y otros eventos conservados para los seriales del pedido.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay movimientos históricos asociados.</p>
          ) : (
            movements.map((movement) => (
              <div key={movement.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{estado(movement.type)}</Badge>
                    {movement.serial ? <span className="font-tabular text-sm font-semibold">{movement.serial}</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {movement.referenceType ? `Referencia: ${movement.referenceType}` : "Movimiento histórico"}
                    {movement.notes ? ` · ${movement.notes}` : ""}
                  </p>
                </div>
                <div className="text-left text-xs text-muted-foreground sm:text-right">
                  <p>{fecha(movement.createdAt)}</p>
                  <p className="font-tabular">Cantidad: {movement.quantity}</p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-primary" />
              Garantías y eventos
            </CardTitle>
            <CardDescription>Garantías relacionadas con el pedido o sus seriales que sí fueron importadas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {warranties.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay garantías importadas para este pedido.</p>
            ) : (
              warranties.map((warranty) => (
                <div key={warranty.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="secondary">{estado(warranty.status)}</Badge>
                    <span className="text-xs text-muted-foreground">{fecha(warranty.receivedAt)}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{warranty.reason ?? "Garantía histórica"}</p>
                  {warranty.unitSerial ? <p className="mt-1 font-tabular text-xs">IMEI: {warranty.unitSerial}</p> : null}
                  {warranty.replacementUnitSerial ? <p className="font-tabular text-xs">Reemplazo: {warranty.replacementUnitSerial}</p> : null}
                  {warranty.diagnosis ? <p className="mt-2 text-sm text-muted-foreground">{warranty.diagnosis}</p> : null}
                  {warranty.resolution ? <p className="mt-1 text-sm">Resolución: {warranty.resolution}</p> : null}
                  {warranty.notes ? <p className="mt-1 text-xs text-muted-foreground">{warranty.notes}</p> : null}
                  {warranty.events.length > 0 ? (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      {warranty.events.map((event, index) => (
                        <div key={`${warranty.id}-${index}`} className="flex items-start justify-between gap-3 text-xs">
                          <span>{event.status ? estado(event.status) : "Evento de garantía"}{event.notes ? ` · ${event.notes}` : ""}</span>
                          <span className="shrink-0 text-muted-foreground">{fecha(event.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" />
              Auditoría histórica
            </CardTitle>
            <CardDescription>Eventos de auditoría conservados para este pedido y sus entidades relacionadas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...audit, ...relatedAudit]
              .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
              .slice(0, 40)
              .map((entry, index) => {
                const info = textoAuditoria(entry);
                return (
                  <div key={`${entry.occurredAt}-${index}`} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{info.action}</p>
                        {entry.entity ? <p className="text-xs text-muted-foreground">{entry.entity}</p> : null}
                        {info.detail ? <p className="mt-1 text-xs text-muted-foreground">{info.detail}</p> : null}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{fecha(entry.occurredAt)}</span>
                    </div>
                  </div>
                );
              })}
            {audit.length + relatedAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay eventos de auditoría importados.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Documentos
          </CardTitle>
          <CardDescription>Referencias documentales que estén disponibles en el archivo histórico.</CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se importaron documentos asociados a este pedido en esta fase.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((document, index) => (
                <div key={`${document.storagePath}-${index}`} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {document.fileName}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/[0.035] p-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock3 className="h-4 w-4" />
          Registro histórico de consulta. No permite editar ni afectar existencias.
        </div>
        <Badge variant="outline" className="border-primary/30 text-primary">Solo lectura</Badge>
      </div>
    </div>
  );
};

export default PedidoHistoricoDetalle;
