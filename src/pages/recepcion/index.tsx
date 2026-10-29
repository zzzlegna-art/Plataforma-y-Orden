import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  Eye,
  ClipboardList,
  Boxes,
  Clock3,
  ArrowRight,
  Building2,
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
  exportCompanyName,
  exportExcel,
  exportPdf,
  exportPedidosHistorialExcel,
  exportPedidosHistorialPdf,
  exportSubtitle,
} from "@/lib/export";
import { formatDate, formatDateTime, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getReceptionRows, type ReceptionRow } from "@/lib/selectors";
import { listSuppliers, type Supplier } from "@/lib/suppliers";
import { ReceptionSupplierDialog } from "./ReceptionSupplierDialog";
import "./reception-premium.css";

const STATUS_OPTIONS = ["", "captura", "confirmada"] as const;
const receptionNumber = new Intl.NumberFormat("es-CO");

/** Listado de recepciones de mercancía. */
const Recepciones = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [selected, setSelected] = useState<ReceptionRow | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  useEffect(() => {
    let active = true;
    void listSuppliers().then((items) => { if (active) setSuppliers(items); })
      .catch((error: unknown) => console.warn("No se pudieron consultar proveedores", error));
    return () => { active = false; };
  }, []);
  const supplierName = useCallback((id?: string) => suppliers.find((supplier) => supplier.id === id)?.name, [suppliers]);
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

  // Una sola consulta base: el resumen, filtros y exportaciones usan exactamente
  // las mismas recepciones, sin contar las descartadas ni duplicar trabajo.
  const allReceptionRows = useMemo(() => getReceptionRows(db), [db]);
  const overview = useMemo(() => ({
    total: allReceptionRows.length,
    confirmed: allReceptionRows.filter((row) => row.reception.status === "confirmada").length,
    drafts: allReceptionRows.filter((row) => row.reception.status === "captura").length,
    units: allReceptionRows.reduce(
      (total, row) => total + (row.reception.status === "confirmada" ? row.units.length : 0),
      0,
    ),
  }), [allReceptionRows]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allReceptionRows.filter((row) => {
      const matchesStatus = !status || row.reception.status === status;
      const matchesSearch =
        !needle ||
        row.reception.code.toLowerCase().includes(needle) ||
        (row.reception.reference ?? "").toLowerCase().includes(needle) ||
        (supplierName(row.reception.supplierId) ?? "").toLowerCase().includes(needle) ||
        row.products.some(
          (product) =>
            product.name.toLowerCase().includes(needle) ||
            product.sku.toLowerCase().includes(needle),
        ) ||
        row.serials.some((serial) => serial.toLowerCase().includes(needle));
      return matchesStatus && matchesSearch;
    });
  }, [allReceptionRows, search, status, supplierName]);

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
    () => allReceptionRows.filter((row) => seleccionados.has(row.reception.id)),
    [allReceptionRows, seleccionados],
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
    const base = soloFiltrado ? rows : allReceptionRows;
    if (base.length === 0) {
      toast.error(t("export.noData"));
      return;
    }

    const head = [
      t("receptions.code"),
      t("common.date"),
      t("receptions.reference"),
      "Proveedor",
      t("receptions.productsColumn"),
      t("receptions.units"),
      t("common.status"),
    ];
    const body = base.map((row) => [
      row.reception.code,
      formatDate(row.reception.receivedAt),
      row.reception.reference ?? "—",
      supplierName(row.reception.supplierId) ?? "—",
      productSummary(row) || "—",
      row.units.length,
      t(`receptionStatus.${row.reception.status}`),
    ]);

    if (format === "pdf") {
      exportPdf({
        title: `${t("receptions.title")} — ${exportCompanyName(db.settings.companyName)}`,
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
            title: `${t("receptions.title")} — ${exportCompanyName(db.settings.companyName)}`,
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
        title: `${t("receptions.detalleTitle")} — ${exportCompanyName(db.settings.companyName)}`,
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
    <div className="nx-reception-table__mobile space-y-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Checkbox
            aria-label={t("export.selectForExport")}
            checked={seleccionados.has(row.reception.id)}
            onCheckedChange={() => alternarSeleccion(row.reception.id)}
            className="mt-1 shrink-0"
          />
            <div className="min-w-0">
              <p className="nx-reception-table__code font-tabular truncate">{row.reception.code}</p>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                {row.products.slice(0, 3).map((item) => {
                  const product = db.products.find((candidate) => candidate.id === item.productId);
                  return product?.imageUrl ? (
                    <ProductThumbnail key={item.productId} src={product.imageUrl} alt={product.name} size="xs" />
                  ) : null;
                })}
                <p className="nx-reception-table__product truncate">{productSummary(row) || "—"}</p>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {supplierName(row.reception.supplierId) ? `${supplierName(row.reception.supplierId)} · ` : ""}
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
          {t("receptions.unitCount", { count: row.reception.status === "confirmada" ? row.units.length : row.serials.length })}
        </span>
        <div className="flex flex-wrap gap-1">
          <ReceptionSupplierDialog
            reception={db.receptions.find((item) => item.id === row.reception.id) ?? row.reception}
            suppliers={suppliers}
            trigger={<Button size="sm" variant="outline" className="rounded-xl"><PencilLine className="h-4 w-4" /> Proveedor</Button>}
          />
          {row.reception.status === "captura" ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/recepcion/nueva/${row.reception.id}`}>
                {t("receptions.continue")}
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
              <Eye /> {t("common.view")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 stagger nx-operations nx-operations-recepcion nx-reception-premium">
      <header className="nx-reception-hero">
        <div className="min-w-0">
          <p className="nx-reception-hero__eyebrow">
            <Boxes className="h-4 w-4" aria-hidden="true" />
            Centro de mercancía
          </p>
          <h1 className="nx-reception-hero__title">{t("receptions.title")}</h1>
          <p className="nx-reception-hero__description">
            Controla las entradas de equipos y repuestos, su procedencia y cada serial o IMEI desde un solo lugar.
          </p>
        </div>
        <div className="nx-reception-hero__actions">
          <Button
            variant="outline"
            onClick={() => {
              setExportScope("todas");
              setDetalleDesde("");
              setDetalleHasta("");
              setExportOpen(true);
            }}
          >
            <Download aria-hidden="true" /> {t("export.button")}
          </Button>
          <Button asChild className="nx-reception-primary-action">
            <Link to="/recepcion/nueva">
              <PackagePlus aria-hidden="true" />
              {t("receptions.new")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      <section aria-label="Resumen de recepciones" className="nx-reception-stat-grid">
        {[
          {
            key: "all", label: "Recepciones totales", value: overview.total,
            help: "Historial registrado", Icon: ClipboardList,
          },
          {
            key: "confirmed", label: "Confirmadas", value: overview.confirmed,
            help: "Mercancía ingresada", Icon: PackageCheck,
          },
          {
            key: "draft", label: "En captura", value: overview.drafts,
            help: "Pendientes de confirmar", Icon: Clock3,
          },
          {
            key: "units", label: "Unidades ingresadas", value: overview.units,
            help: "Seriales de recepciones confirmadas", Icon: Boxes,
          },
        ].map(({ key, label, value, help, Icon }) => (
          <div className={`nx-reception-stat nx-reception-stat--${key}`} key={key}>
            <div className="nx-reception-stat__top">
              <span className="nx-reception-stat__label">{label}</span>
              <span className="nx-reception-stat__icon" aria-hidden="true">
                <Icon className="h-5 w-5" />
              </span>
            </div>
            <p className="nx-reception-stat__number">{receptionNumber.format(value)}</p>
            <p className="nx-reception-stat__help">{help}</p>
          </div>
        ))}
      </section>

      <section aria-label="Buscar y filtrar recepciones" className="nx-reception-filterbar">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t("receptions.searchPlaceholder")}
          className="nx-reception-filterbar__search"
        />
        <div className="nx-reception-filterbar__tabs" role="group" aria-label="Filtrar por estado">
          {STATUS_OPTIONS.map((option) => {
            const count = option === "captura" ? overview.drafts :
              option === "confirmada" ? overview.confirmed : overview.total;
            return (
              <Button
                key={option || "all"}
                variant="outline"
                size="sm"
                aria-pressed={status === option}
                onClick={() => setStatus(option)}
                className="nx-reception-filter shrink-0"
              >
                {option ? t(`receptionStatus.${option}`) : t("common.all")}
                <span className="nx-reception-filter__count">{receptionNumber.format(count)}</span>
              </Button>
            );
          })}
        </div>
        <span className="ml-auto text-xs font-medium text-muted-foreground">
          {t("common.resultsCount", { count: rows.length })}
        </span>
      </section>

      {rows.length > 0 ? (
        <div className={cn("nx-reception-selection",
          seleccionados.size > 0 && "nx-reception-selection--active")}>
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
          <span className="nx-reception-selection__count">
            {seleccionados.size > 0
              ? t("export.selectedCount", { count: seleccionados.size })
              : t("export.selectForExportHint")}
          </span>
          {seleccionados.size > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setSeleccionados(new Set())}>
              <X aria-hidden="true" /> {t("common.clear")}
            </Button>
          ) : null}
          <Button
            size="sm"
            className="ml-auto rounded-xl"
            disabled={seleccionados.size === 0}
            onClick={() => {
              setExportScope("seleccionadas");
              setExportOpen(true);
            }}
          >
            <Download aria-hidden="true" />
            {seleccionados.size > 0
              ? t("export.exportSelectedCount", { count: seleccionados.size })
              : t("export.button")}
          </Button>
        </div>
      ) : null}

      <DataTable<ReceptionRow>
        className="nx-reception-table"
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
        footer={
          <span className="nx-reception-table__footer">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            {receptionNumber.format(rows.length)} recepciones mostradas
          </span>
        }
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
                <p className="nx-reception-table__code font-tabular">{row.reception.code}</p>
                <p
                  className="nx-reception-table__product max-w-[20rem] truncate"
                  title={row.products.map((p) => `${p.name} × ${p.count}`).join("\n")}
                >
                  {productSummary(row) || "—"}
                </p>
                {supplierName(row.reception.supplierId) ? (
                  <span className="nx-reception-table__supplier max-w-[20rem] truncate"><Building2 className="h-3 w-3 shrink-0" aria-hidden="true" /> Proveedor: {supplierName(row.reception.supplierId)}</span>
                ) : null}
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
              <span className="nx-reception-table__units">{receptionNumber.format(row.reception.status === "confirmada" ? row.units.length : row.serials.length)}</span>
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
            cell: (row) => (
              <div className="nx-reception-table__actions flex items-center justify-end gap-1">
                <ReceptionSupplierDialog
                  reception={db.receptions.find((item) => item.id === row.reception.id) ?? row.reception}
                  suppliers={suppliers}
                  trigger={
                    <Button size="sm" variant="outline" title="Agregar o editar proveedor">
                      <PencilLine className="h-4 w-4" /> Proveedor
                    </Button>
                  }
                />
                {row.reception.status === "captura" ? (
                  <Button size="sm" variant="outline"
                    onClick={() => navigate(`/recepcion/nueva/${row.reception.id}`)}>
                    {t("receptions.continue")}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
                    <Eye /> {t("common.view")}
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && cerrarPanel()}>
        <SheetContent side="right" className="w-full overflow-y-auto pr-0 sm:max-w-md">
          <SheetHeader className="pr-6">
            <SheetTitle className="font-tabular">{selected?.reception.code}</SheetTitle>
            <SheetDescription>
              {t("receptions.confirmedAt", {
                date: formatDateTime(selected?.reception.confirmedAt),
              })}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-3 pr-6">
            {selected ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proveedor</p>
                <p className="mt-1 font-medium">
                  {supplierName(db.receptions.find((item) => item.id === selected.reception.id)?.supplierId)
                    ?? "Sin proveedor registrado"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Los seriales de esta recepción consultan automáticamente este proveedor.
                </p>
              </div>
            ) : null}
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
                <ul className="max-h-32 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 pr-0">
                  {filasSeleccionadas.map((row) => (
                    <li key={row.reception.id} className="font-tabular pr-2 text-xs">
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
