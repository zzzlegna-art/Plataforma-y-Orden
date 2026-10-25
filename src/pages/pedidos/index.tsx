import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Download, Eye, FileSpreadsheet, FileText, Plus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { SearchField } from "@/components/shared/search-field";
import { OrderStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from "@/hooks/use-store";
import {
  exportCompanyName,
  exportExcel,
  exportPdf,
  exportSubtitle,
  exportSubtitlePedidos,
} from "@/lib/export";
import { formatDate, todayIso } from "@/lib/format";
import { getOrderViews, type OrderView } from "@/lib/selectors";

const STATUSES = ["en_preparacion", "despachado", "cancelado"] as const;

/** Listado de pedidos a clientes mayoristas. */
const Pedidos = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const navigate = useNavigate();
  // La búsqueda y el filtro de estado viven en la dirección (?q=...&estado=...): así, al ver
  // un pedido y volver (botón "Volver" o "atrás" del navegador), se regresa con lo mismo que
  // se tenía escrito y filtrado, en vez de reiniciar la pantalla en blanco.
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const status = params.get("estado") ?? "";
  const setSearch = (valor: string) =>
    setParams(
      (previo) => {
        const next = new URLSearchParams(previo);
        if (valor) next.set("q", valor);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  const setStatus = (valor: string) =>
    setParams(
      (previo) => {
        const next = new URLSearchParams(previo);
        if (valor) next.set("estado", valor);
        else next.delete("estado");
        return next;
      },
      { replace: true },
    );
  const [exportOpen, setExportOpen] = useState(false);
  const [soloFiltrado, setSoloFiltrado] = useState(true);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return getOrderViews(db)
      .filter((view) => (status ? view.order.status === status : true))
      .filter(
        (view) =>
          !needle ||
          view.order.code.toLowerCase().includes(needle) ||
          (view.customer?.name ?? "").toLowerCase().includes(needle),
      );
  }, [db, search, status]);

  const exportar = (format: "pdf" | "excel") => {
    const base = soloFiltrado ? rows : getOrderViews(db);
    if (base.length === 0) {
      toast.error(t("export.noData"));
      return;
    }

    // El listado general es un resumen operativo. Los seriales y el detalle
    // completo se exportan desde la pantalla de cada pedido.
    const body = base.map((view) => [
      view.order.code,
      view.customer?.name ?? t("order.noCustomer"),
      formatDate(view.order.orderDate),
      view.order.status === "despachado" ? view.assigned : 0,
    ]);
    const head = [
      t("order.code"),
      t("order.customer"),
      t("order.orderDate"),
      "Unidades despachadas",
    ];

    if (format === "pdf") {
      exportPdf({
        title: `${t("nav.orders")} — ${exportCompanyName(db.settings.companyName)}`,
        subtitle: exportSubtitle(body.length),
        head,
        body,
        filename: `pedidos-resumen-${todayIso()}.pdf`,
        highlightColumns: [0],
      });
    } else {
      exportExcel({
        filename: `pedidos-resumen-${todayIso()}.xlsx`,
        sheets: [
          {
            name: "Pedidos",
            title: `${t("nav.orders")} — ${exportCompanyName(db.settings.companyName)}`,
            subtitle: exportSubtitle(body.length),
            columns: head,
            rows: body,
            numberFormats: { 3: "#,##0" },
          },
        ],
      });
    }
    setExportOpen(false);
  };

  const renderCard = (view: OrderView) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-tabular truncate font-semibold">{view.order.code}</p>
          <p className="truncate text-xs text-muted-foreground">
            {view.customer?.name ?? t("order.noCustomer")}
          </p>
        </div>
        <OrderStatusBadge status={view.order.status} />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{formatDate(view.order.orderDate)}</span>
        <span className="font-tabular">
          {t("order.serializedOf", { assigned: view.assigned, requested: view.requested })}
        </span>
      </div>
      <Button size="sm" variant="outline" className="w-full" asChild>
        {/* stopPropagation: la tarjeta ya navega al tocarla (onRowClick); sin esto, este enlace
           agregaba una SEGUNDA entrada al historial hacia la misma página, y "Volver" solo
           deshacía una, dejando al usuario a mitad de camino en vez de volver a la lista. */}
        <Link to={`/pedidos/${view.order.id}`} onClick={(event) => event.stopPropagation()}>
          {view.order.status === "en_preparacion" ? t("order.serializeTitle") : t("order.viewDetail")}
        </Link>
      </Button>
    </div>
  );

  return (
    <div className="space-y-5 stagger nx-operations nx-operations-pedidos">
      <PageHeader
        title={t("order.title")}
        description={t("order.subtitleMayorista")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setExportOpen(true);
              }}
            >
              <Download />
              {t("export.button")}
            </Button>
            <Button asChild>
              <Link to="/pedidos/nuevo">
                <Plus />
                {t("order.new")}
              </Link>
            </Button>
          </div>
        }
      />

      <div className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t("order.searchPlaceholder")}
          className="sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant={status === "" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatus("")}
          >
            {t("common.all")}
          </Button>
          {STATUSES.map((option) => (
            <Button
              key={option}
              variant={status === option ? "default" : "outline"}
              size="sm"
              onClick={() => setStatus(option)}
            >
              {t(`orderStatus.${option}`)}
            </Button>
          ))}
        </div>
      </div>

      <div key={status} className="animate-fade-in">
        <DataTable<OrderView>
          rows={rows}
          rowKey={(view) => view.order.id}
          onRowClick={(view) => navigate(`/pedidos/${view.order.id}`)}
          emptyTitle={search || status ? t("order.emptyFilteredTitle") : t("order.emptyTitle")}
          emptyDescription={search || status ? t("order.emptyFilteredDescription") : t("order.emptyDescription")}
          emptyIcon={ClipboardList}
          emptyAction={
            !search && !status ? (
              <Button asChild>
                <Link to="/pedidos/nuevo">
                  <Plus />
                  {t("order.new")}
                </Link>
              </Button>
            ) : undefined
          }
          renderCard={renderCard}
          footer={t("common.resultsCount", { count: rows.length })}
          columns={[
          {
            key: "code",
            header: t("order.code"),
            cell: (view) => <span className="font-tabular font-medium">{view.order.code}</span>,
          },
          {
            key: "customer",
            header: t("order.customer"),
            cell: (view) => (
              <span className="text-sm">{view.customer?.name ?? t("order.noCustomer")}</span>
            ),
          },
          {
            key: "date",
            header: t("order.orderDate"),
            cell: (view) => (
              <span className="text-sm text-muted-foreground">
                {formatDate(view.order.orderDate)}
              </span>
            ),
          },
          {
            key: "units",
            header: t("order.units"),
            align: "right",
            cell: (view) => (
              <span className="font-tabular text-sm">
                {t("order.serializedOf", { assigned: view.assigned, requested: view.requested })}
              </span>
            ),
          },
          {
            key: "status",
            header: t("common.status"),
            cell: (view) => <OrderStatusBadge status={view.order.status} />,
          },
          {
            key: "actions",
            header: t("common.actions"),
            align: "right",
            cell: (view) => (
              <Button size="sm" variant="ghost" asChild>
                {/* Ídem: evita la doble navegación con la fila (ver el comentario en renderCard). */}
                <Link to={`/pedidos/${view.order.id}`} onClick={(event) => event.stopPropagation()}>
                  <Eye />
                  {t("common.view")}
                </Link>
              </Button>
            ),
          },
        ]}
        />
      </div>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("export.button")}</DialogTitle>
            <DialogDescription>{t("export.choose")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50">
              <Checkbox
                checked={soloFiltrado}
                onCheckedChange={(value) => setSoloFiltrado(Boolean(value))}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">{t("export.soloFiltrado")}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t("export.soloFiltradoHint")}
                </span>
              </span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => exportar("pdf")}>
                <FileText />
                {t("export.pdf")}
              </Button>
              <Button type="button" variant="outline" onClick={() => exportar("excel")}>
                <FileSpreadsheet />
                {t("export.excel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pedidos;
