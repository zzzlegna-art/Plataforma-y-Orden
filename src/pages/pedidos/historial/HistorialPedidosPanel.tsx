import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, Eye, History, Loader2, ShieldCheck } from "lucide-react";

import { DataTable } from "@/components/shared/data-table";
import { SearchField } from "@/components/shared/search-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listHistoricalOrders, type HistoricalOrderListItem } from "@/lib/historical-orders";
import { formatCurrency, formatDate } from "@/lib/format";

const ESTADOS = [
  { value: "", label: "Todos" },
  { value: "despachado", label: "Despachados" },
  { value: "cancelado", label: "Cancelados" },
  { value: "en_preparacion", label: "En preparación" },
  { value: "preparado", label: "Preparados" },
];

const etiquetaEstado = (status: string) =>
  status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

const estadoVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "cancelado") return "destructive";
  if (status === "despachado") return "secondary";
  return "outline";
};

export const HistorialPedidosPanel = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<HistoricalOrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;

    const cargar = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await listHistoricalOrders();
        if (!vigente) return;
        setOrders(result.items);
        setTotal(result.total);
      } catch (cause) {
        if (!vigente) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "No fue posible cargar los pedidos históricos.",
        );
      } finally {
        if (vigente) setLoading(false);
      }
    };

    void cargar();
    return () => {
      vigente = false;
    };
  }, []);

  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return orders.filter((order) => {
      const coincideEstado = !status || order.status === status;
      const coincideBusqueda =
        !needle ||
        order.code.toLocaleLowerCase().includes(needle) ||
        order.customerName.toLocaleLowerCase().includes(needle);
      return coincideEstado && coincideBusqueda;
    });
  }, [orders, search, status]);

  const abrirDetalle = (order: HistoricalOrderListItem) =>
    navigate(`/pedidos/historial/${order.sourceId}`);

  const renderCard = (order: HistoricalOrderListItem) => (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-tabular font-semibold">{order.code}</p>
          <p className="truncate text-xs text-muted-foreground">{order.customerName}</p>
        </div>
        <Badge variant="outline" className="shrink-0 gap-1 border-primary/30 text-primary">
          <Archive className="h-3 w-3" />
          Importado
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{formatDate(order.orderDate)}</span>
        <Badge variant={estadoVariant(order.status)}>{etiquetaEstado(order.status)}</Badge>
      </div>
      <div className="flex items-center justify-between border-t pt-2 text-sm">
        <span className="text-muted-foreground">
          {order.serialCount.toLocaleString("es-CO")} seriales · {order.lineCount} líneas
        </span>
        <span className="font-tabular font-semibold">{formatCurrency(order.total)}</span>
      </div>
      <Button size="sm" variant="outline" className="w-full" onClick={(event) => { event.stopPropagation(); abrirDetalle(order); }}>
        <Eye className="mr-2 h-4 w-4" />
        Ver historial
      </Button>
    </div>
  );

  return (
    <section className="space-y-4" aria-label="Historial importado de pedidos">
      <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <History className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold tracking-tight">Historial importado de Techrez</h2>
              <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                <ShieldCheck className="h-3 w-3" />
                Solo lectura
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Pedidos históricos completos y verificados. No afectan el inventario operativo.
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-muted/70 px-4 py-2 text-right">
          <p className="font-tabular text-2xl font-bold">{loading ? "—" : total.toLocaleString("es-CO")}</p>
          <p className="text-xs text-muted-foreground">pedidos verificados</p>
        </div>
      </div>

      <div className="nx-pedidos-filters space-y-3">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Buscar por código o cliente"
          className="sm:max-w-xs"
        />
        <div className="nx-pedidos-tabs flex flex-wrap gap-2">
          {ESTADOS.map((option) => (
            <Button
              key={option.value || "todos"}
              data-active={status === option.value}
              variant={status === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatus(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center gap-3 rounded-xl border bg-card text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando pedidos históricos verificados…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
          <p className="font-semibold text-destructive">No se pudo cargar el historial</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Comprueba que la migración de consulta histórica esté aplicada en Supabase y que tu usuario tenga permiso para gestionar pedidos.
          </p>
        </div>
      ) : (
        <DataTable<HistoricalOrderListItem>
          className="nx-pedidos-table"
          rows={rows}
          rowKey={(order) => order.sourceId}
          onRowClick={abrirDetalle}
          emptyTitle="No se encontraron pedidos históricos"
          emptyDescription={
            search || status
              ? "Prueba con otro código, cliente o estado."
              : "Todavía no hay pedidos históricos verificados para mostrar."
          }
          emptyIcon={Archive}
          renderCard={renderCard}
          footer={`${rows.length.toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")} pedidos verificados`}
          columns={[
            {
              key: "code",
              header: "Pedido",
              cell: (order) => <span className="font-tabular font-semibold">{order.code}</span>,
            },
            {
              key: "customer",
              header: "Cliente",
              cell: (order) => (
                <span className="nx-pedidos-customer">
                  <span aria-hidden="true" className="nx-pedidos-avatar">
                    {order.customerName.trim().split(/\s+/).slice(0, 2).map((word) => word[0] ?? "").join("").toUpperCase()}
                  </span>
                  <span className="text-sm">{order.customerName}</span>
                </span>
              ),
            },
            {
              key: "date",
              header: "Fecha",
              cell: (order) => <span className="text-sm text-muted-foreground">{formatDate(order.orderDate)}</span>,
            },
            {
              key: "lines",
              header: "Líneas",
              align: "right",
              cell: (order) => <span className="font-tabular text-sm">{order.lineCount}</span>,
            },
            {
              key: "serials",
              header: "IMEI / seriales",
              align: "right",
              cell: (order) => <span className="font-tabular text-sm">{order.serialCount.toLocaleString("es-CO")}</span>,
            },
            {
              key: "total",
              header: "Total",
              align: "right",
              cell: (order) => <span className="font-tabular text-sm font-semibold">{formatCurrency(order.total)}</span>,
            },
            {
              key: "status",
              header: "Estado",
              cell: (order) => <Badge variant={estadoVariant(order.status)}>{etiquetaEstado(order.status)}</Badge>,
            },
            {
              key: "actions",
              header: "Consulta",
              align: "right",
              cell: (order) => (
                <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); abrirDetalle(order); }}>
                  <Eye className="mr-1 h-4 w-4" />
                  Ver
                </Button>
              ),
            },
          ]}
        />
      )}
    </section>
  );
};
