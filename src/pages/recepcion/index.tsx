import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  PackageCheck,
  PackagePlus,
  PencilLine,
  X,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { DataTable } from "@/components/shared/data-table";
import { ProductThumbnail } from "@/components/shared/product-thumbnail";
import { PageHeader } from "@/components/shared/page-header";
import { SearchField } from "@/components/shared/search-field";
import { ConditionBadge, Badge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useStore } from "@/hooks/use-store";
import {
  exportExcel,
  exportPdf,
  exportPedidosHistorialExcel,
  exportPedidosHistorialPdf,
  exportSubtitle,
} from "@/lib/export";
import { formatDate, formatDateTime, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getReceptionRows, type ReceptionRow } from "@/lib/selectors";

const STATUS_OPTIONS = ["", "captura", "confirmada"] as const;

/** Listado de recepciones de mercancía. */
const Recepciones = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [selected, setSelected] = useState<ReceptionRow | null>(null);
  const [params, setParams] = useSearchParams();
  // Enlace desde el historial de un serial: ?ver=<recepción>&serial=<serial a resaltar>.
  const verId = params.get("ver");
  const serialResaltado = params.get("serial")?.toLowerCase() ?? null;

  // Abre el panel de la recepción pedida en el enlace (sin importar los filtros de la lista).
  useEffect(() => {
    if (!verId) return;
    const row = getReceptionRows(db).find((item) => item.reception.id === verId);
    if (row) setSelected(row);
  }, [verId, db]);

  // Centra en pantalla el serial resaltado cuando el panel ya está abierto.
  useEffect(() => {
    if (!selected || !serialResaltado) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById("unidad-resaltada")
        ?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [selected, serialResaltado]);

  const cerrarPanel = () => {
    setSelected(null);
    if (verId || serialResaltado) {
      setParams(
        (previo) => {
          const next = new URLSearchParams(previo);
          next.delete("ver");
          next.delete("serial");
          return next;
        },
        { replace: true },
      );
    }
  };

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return getReceptionRows(db).filter((row) => {
      const matchesStatus = !status || row.reception.status === status;
      const matchesSearch =
        !needle ||
        row.reception.code.toLowerCase().includes(needle) ||
        (row.reception.reference ?? "").toLowerCase().includes(needle) ||
        row.products.some(
          (product) =>
            product.name.toLowerCase().includes(needle) ||
            product.sku.toLowerCase().includes(needle),
        ) ||
        row.serials.some((serial) => serial.toLowerCase().includes(needle));
      return matchesStatus && matchesSearch;
    });
  }, [db, search, status]);

  // Selección manual de recepciones para exportar exactamente las que se elijan (igual que
  // la selección de seriales para imprimir etiquetas: checkbox por fila + "elegir visibles").
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const alternarSeleccion = (id: string) =>
    setSeleccionados((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"todas" | "detalle" | "seleccionadas">("todas");
  const [soloFiltrado, setSoloFiltrado] = useState(true);
  const [incluirSeriales, setIncluirSeriales] = useState(true);
  const [detalleDesde, setDetalleDesde] = useState("");
  const [detalleHasta, setDetalleHasta] = useState("");

  const detalleEnRango = useMemo(() => {
    return rows.filter((row) => {
      const fecha = row.reception.receivedAt.slice(0, 10);
      if (detalleDesde && fecha < detalleDesde) return false;
      if (detalleHasta && fecha > detalleHasta) return false;
      return true;
    });
  }, [rows, detalleDesde, detalleHasta]);

  // Las seleccionadas se toman de todas las recepciones, no solo de las que deja ver el filtro
  // actual: si se cambia la búsqueda después de marcarlas, no se pierden en silencio.
  const filasSeleccionadas = useMemo(
    () => getReceptionRows(db).filter((row) => seleccionados.has(row.reception.id)),
    [db, seleccionados],
  );

  const opcionSeriales = (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50">
      <Checkbox
        checked={incluirSeriales}
        onCheckedChange={(value) => setIncluirSeriales(Boolean(value))}
        className="mt-0.5"
      />
      <span>
        <span className="block text-sm font-medium">{t("export.incluirSeriales")}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {t("export.incluirSerialesHint")}
        </span>
      </span>
    </label>
  );

  const exportarTodas = (format: "pdf" | "excel") => {
    const base = soloFiltrado ? rows : getReceptionRows(db);
    if (base.length === 0) {
      toast.error(t("export.noData"));
      return;
    }

    const head = [
      t("receptions.code"),
      t("common.date"),
      t("receptions.reference"),
      t("receptions.productsColumn"),
      t("receptions.units"),
      t("common.status"),
    ];
    const body = base.map((row) => [
      row.reception.code,
      formatDate(row.reception.receivedAt),
      row.reception.reference ?? "—",
      productSummary(row) || "—",
      row.units.length,
      t(`receptionStatus.${row.reception.status}`),
    ]);

    if (format === "pdf") {
      exportPdf({
        title: `${t("receptions.title")} — ${db.settings.companyName}`,
        subtitle: exportSubtitle(body.length),
        head,
        body,
        filename: `recepciones-${todayIso()}.pdf`,
        highlightColumns: [0],
      });
    } else {
      exportExcel({
        filename: `recepciones-${todayIso()}.xlsx`,
        sheets: [
          {
            name: "Recepciones",
            title: `${t("receptions.title")} — ${db.settings.companyName}`,
            subtitle: exportSubtitle(body.length),
            columns: head,
            rows: body,
          },
        ],
      });
    }
    setExportOpen(false);
  };

  const exportarDetalle = (format: "pdf" | "excel", fuente: ReceptionRow[]) => {
    if (fuente.length === 0) {
      toast.error(t("export.noData"));
      return;
    }

    // Una recepción por bloque: referencia/fecha arriba, y abajo cada producto con su
    // cantidad y los seriales que entraron — igual que el historial de pedidos despachados.
    const recepciones = fuente.map((row) => ({
      code: row.reception.code,
      cliente: row.reception.reference?.trim() || t("receptions.sinReferencia"),
      fecha: formatDateTime(row.reception.receivedAt),
      lineas: row.products.map((producto) => ({
        referencia: producto.sku ? `${producto.name} (${producto.sku})` : producto.name,
        cantidad: producto.count,
        seriales: row.units
          .filter((unit) => unit.productId === producto.productId)
          .map((unit) => unit.serial),
      })),
    }));

    if (format === "pdf") {
      exportPedidosHistorialPdf({
        title: t("receptions.detalleTitle"),
        subtitle: exportSubtitle(recepciones.length),
        pedidos: recepciones.map((recepcion) => ({
          code: recepcion.code,
          cliente: recepcion.cliente,
          fecha: recepcion.fecha,
          unidades: recepcion.lineas.reduce((suma, linea) => suma + linea.cantidad, 0),
          lineas: recepcion.lineas.map((linea) => ({
            title: incluirSeriales
              ? `${linea.referencia} x${linea.cantidad} — ${linea.seriales.length} ${t("export.imeis")}`
              : `${linea.referencia} x${linea.cantidad}`,
            seriales: linea.seriales,
          })),
        })),
        filename: `recepciones-detalle-${todayIso()}.pdf`,
        incluirSeriales,
      });
    } else {
      exportPedidosHistorialExcel({
        title: t("receptions.detalleTitle"),
        subtitle: exportSubtitle(recepciones.length),
        pedidos: recepciones,
        filename: `recepciones-detalle-${todayIso()}.xlsx`,
        incluirSeriales,
        labels: {
          referencia: t("export.referencia"),
          cantidad: t("order.quantity"),
          seriales: t("export.imeis"),
        },
      });
    }
    setExportOpen(false);
  };

  /** Resumen de productos de la recepción: "iPhone 17 Pro × 15 · +1 más". */
  const productSummary = (row: ReceptionRow) => {
    const [first, ...rest] = row.products;
    if (!first) return "";
    const base = `${first.name} × ${first.count}`;
    return rest.length > 0 ? `${base} · ${t("receptions.moreProducts", { count: rest.length })}` : base;
  };

  const renderCard = (row: ReceptionRow) => (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Checkbox
            aria-label={t("export.selectForExport")}
            checked={seleccionados.has(row.reception.id)}
            onCheckedChange={() => alternarSeleccion(row.reception.id)}
            className="mt-1 shrink-0"
          />
            <div className="min-w-0">
              <p className="font-tabular truncate font-semibold">{row.reception.code}</p>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                {row.products.slice(0, 3).map((item) => {
                  const product = db.products.find((candidate) => candidate.id === item.productId);
                  return product?.imageUrl ? (
                    <ProductThumbnail key={item.productId} src={product.imageUrl} alt={product.name} size="xs" />
                  ) : null;
                })}
                <p className="truncate text-sm">{productSummary(row) || "—"}</p>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {row.reception.reference ? `${row.reception.reference} · ` : ""}
                {formatDate(row.reception.receivedAt)}
              </p>
            </div>
          </div>
        {row.reception.status === "confirmada" ? (
          <Badge tone="success" label={t("receptionStatus.confirmada")} />
        ) : (
          <Badge tone="info" label={t("receptionStatus.captura")} />
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {t("receptions.unitCount", { count: row.units.length })}
        </span>
        {row.reception.status === "captura" ? (
          <Button size="sm" variant="outline" asChild>
            <Link to={`/recepcion/nueva/${row.reception.id}`}>
              <PencilLine />
              {t("receptions.continue")}
            </Link>
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
            <Eye />
            {t("common.view")}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 stagger nx-operations nx-operations-recepcion">
      <PageHeader
        title={t("receptions.title")}
        description={t("receptions.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setExportScope("todas");
                setDetalleDesde("");
                setDetalleHasta("");
                setExportOpen(true);
              }}
            >
              <Download />
              {t("export.button")}
            </Button>
            <Button asChild>
              <Link to="/recepcion/nueva">
                <PackagePlus />
                {t("receptions.new")}
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t("receptions.searchPlaceholder")}
          className="sm:max-w-xs"
        />
        <div className="flex gap-2 overflow-x-auto">
          {STATUS_OPTIONS.map((option) => (
            <Button
              key={option || "all"}
              variant={status === option ? "default" : "outline"}
              size="sm"
              onClick={() => setStatus(option)}
              className="shrink-0"
            >
              {option ? t(`receptionStatus.${option}`) : t("common.all")}
            </Button>
          ))}
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
          <Checkbox
            aria-label={t("export.selectAllVisible")}
            checked={rows.every((row) => seleccionados.has(row.reception.id))}
            onCheckedChange={(marcado) =>
              setSeleccionados((previo) => {
                const siguiente = new Set(previo);
                rows.forEach((row) =>
                  marcado ? siguiente.add(row.reception.id) : siguiente.delete(row.reception.id),
                );
                return siguiente;
              })
            }
          />
          <span className="text-sm text-muted-foreground">
            {seleccionados.size > 0
              ? t("export.selectedCount", { count: seleccionados.size })
              : t("export.selectForExportHint")}
          </span>
          {seleccionados.size > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => setSeleccionados(new Set())}
            >
              <X />
              {t("common.clear")}
            </Button>
          ) : null}
          <Button
            size="sm"
            className="ml-auto h-7"
            disabled={seleccionados.size === 0}
            onClick={() => {
              setExportScope("seleccionadas");
              setExportOpen(true);
            }}
          >
            <Download />
            {seleccionados.size > 0
              ? t("export.exportSelectedCount", { count: seleccionados.size })
              : t("export.button")}
          </Button>
        </div>
      ) : null}

      <DataTable<ReceptionRow>
        rows={rows}
        rowKey={(row) => row.reception.id}
        emptyTitle={search || status ? t("receptions.emptyFilteredTitle") : t("receptions.emptyTitle")}
        emptyDescription={
          search || status ? t("receptions.emptyFilteredDescription") : t("receptions.emptyDescription")
        }
        emptyIcon={PackagePlus}
        emptyAction={
          !search && !status ? (
            <Button asChild>
              <Link to="/recepcion/nueva">
                <PackagePlus />
                {t("receptions.new")}
              </Link>
            </Button>
          ) : undefined
        }
        renderCard={renderCard}
        columns={[
          {
            key: "select",
            header: "",
            cell: (row) => (
              <Checkbox
                aria-label={t("export.selectForExport")}
                checked={seleccionados.has(row.reception.id)}
                onCheckedChange={() => alternarSeleccion(row.reception.id)}
              />
            ),
          },
          {
            key: "code",
            header: t("receptions.code"),
            cell: (row) => (
              <div>
                <p className="font-tabular font-medium">{row.reception.code}</p>
                <p
                  className="max-w-[18rem] truncate text-sm"
                  title={row.products.map((p) => `${p.name} × ${p.count}`).join("\n")}
                >
                  {productSummary(row) || "—"}
                </p>
                {row.reception.reference ? (
                  <p className="text-xs text-muted-foreground">{row.reception.reference}</p>
                ) : null}
              </div>
            ),
          },
          {
            key: "date",
            header: t("common.date"),
            cell: (row) => <span className="text-sm">{formatDate(row.reception.receivedAt)}</span>,
          },
          {
            key: "units",
            header: t("receptions.units"),
            cell: (row) => (
              <span className="font-tabular text-sm">{row.units.length}</span>
            ),
          },
          {
            key: "status",
            header: t("common.status"),
            cell: (row) =>
              row.reception.status === "confirmada" ? (
                <Badge tone="success" label={t("receptionStatus.confirmada")} />
              ) : (
                <Badge tone="info" label={t("receptionStatus.captura")} />
              ),
          },
          {
            key: "actions",
            header: t("common.actions"),
            align: "right",
            cell: (row) =>
              row.reception.status === "captura" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/recepcion/nueva/${row.reception.id}`)}
                >
                  <PencilLine />
                  {t("receptions.continue")}
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
                  <Eye />
                  {t("common.view")}
                </Button>
              ),
          },
        ]}
      />

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && cerrarPanel()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-tabular">{selected?.reception.code}</SheetTitle>
            <SheetDescription>
              {t("receptions.confirmedAt", {
                date: formatDateTime(selected?.reception.confirmedAt),
              })}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-3">
            {selected?.reception.notes ? (
              <p className="rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
                {selected.reception.notes}
              </p>
            ) : null}

            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <PackageCheck className="h-3.5 w-3.5" />
              {t("receptions.unitsTitle", { count: selected?.units.length ?? 0 })}
            </p>

            <ul className="divide-y rounded-lg border">
              {(selected?.units ?? []).map((unit) => {
                const product = db.products.find((item) => item.id === unit.productId);
                const resaltada = serialResaltado === unit.serial.toLowerCase();
                return (
                  <li
                    key={unit.id}
                    id={resaltada ? "unidad-resaltada" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-3 p-3 transition-colors",
                      resaltada && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <ProductThumbnail src={product?.imageUrl} alt={product?.name ?? "Referencia"} size="sm" />
                      <div className="min-w-0">
                        <p className="font-tabular truncate text-sm">{unit.serial}</p>
                        {resaltada ? (
                          <p className="text-xs font-semibold text-primary">
                            {t("receptions.serialBuscado")}
                          </p>
                        ) : null}
                        <p className="truncate text-xs text-muted-foreground">
                          {product?.name ?? "—"}
                        </p>
                      </div>
                    </div>
                    <ConditionBadge condition={unit.condition} />
                  </li>
                );
              })}
            </ul>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("export.button")}</DialogTitle>
            <DialogDescription>{t("export.choose")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                size="sm"
                className="h-auto min-h-9 whitespace-normal px-2 py-2 text-center leading-tight"
                variant={exportScope === "todas" ? "default" : "outline"}
                onClick={() => setExportScope("todas")}
              >
                {t("export.scopeTodasRecepciones")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-auto min-h-9 whitespace-normal px-2 py-2 text-center leading-tight"
                variant={exportScope === "detalle" ? "default" : "outline"}
                onClick={() => setExportScope("detalle")}
              >
                {t("export.scopeDetalleRecepciones")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-auto min-h-9 whitespace-normal px-2 py-2 text-center leading-tight"
                variant={exportScope === "seleccionadas" ? "default" : "outline"}
                disabled={seleccionados.size === 0}
                onClick={() => setExportScope("seleccionadas")}
              >
                {t("export.scopeSeleccionadas", { count: seleccionados.size })}
              </Button>
            </div>

            {exportScope === "todas" ? (
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
            ) : exportScope === "detalle" ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">{t("receptions.detalleRangoHint")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t("export.desde")}</Label>
                    <Input
                      type="date"
                      value={detalleDesde}
                      max={detalleHasta || undefined}
                      onChange={(event) => setDetalleDesde(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("export.hasta")}</Label>
                    <Input
                      type="date"
                      value={detalleHasta}
                      min={detalleDesde || undefined}
                      onChange={(event) => setDetalleHasta(event.target.value)}
                    />
                  </div>
                </div>
                {opcionSeriales}
                <p className="text-xs text-muted-foreground">
                  {t("common.resultsCount", { count: detalleEnRango.length })}
                </p>
                {(search || status) && (
                  <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
                    {t("receptions.detalleUsaBusqueda")}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t("export.seleccionadasHint")}</p>
                <ul className="max-h-32 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2">
                  {filasSeleccionadas.map((row) => (
                    <li key={row.reception.id} className="font-tabular text-xs">
                      {row.reception.code}
                      {row.reception.reference ? ` · ${row.reception.reference}` : ""}
                    </li>
                  ))}
                </ul>
                {opcionSeriales}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (exportScope === "todas") exportarTodas("pdf");
                  else if (exportScope === "detalle") exportarDetalle("pdf", detalleEnRango);
                  else exportarDetalle("pdf", filasSeleccionadas);
                }}
              >
                <FileText />
                {t("export.pdf")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (exportScope === "todas") exportarTodas("excel");
                  else if (exportScope === "detalle") exportarDetalle("excel", detalleEnRango);
                  else exportarDetalle("excel", filasSeleccionadas);
                }}
              >
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

export default Recepciones;
