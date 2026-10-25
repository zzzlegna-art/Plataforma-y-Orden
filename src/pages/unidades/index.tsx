import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScanLine, AlertTriangle, Clock3, ShieldCheck, ArrowRight } from "lucide-react";

import { CopySerialButton } from "@/components/shared/copy-serial-button";
import { DataTable } from "@/components/shared/data-table";
import { ProductThumbnail } from "@/components/shared/product-thumbnail";
import { PageHeader } from "@/components/shared/page-header";
import { OptionSelect } from "@/components/shared/option-select";
import { SearchField } from "@/components/shared/search-field";
import { SerialScanInput } from "@/components/shared/serial-scan-input";
import { ConditionBadge, UnitStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/hooks/use-store";
import { formatDate } from "@/lib/format";
import { findUnitBySerial, getUnitRows, type UnitRow } from "@/lib/selectors";
import { ordenarProductos } from "@/lib/product-order";
import { UnitDetailSheet } from "./UnitDetailSheet";

const STATUSES = [
  "en_bodega",
  "en_local",
  "vendido",
  "en_reparacion",
  "defectuoso",
  "en_transito",
  "entregado_garantia",
  "liberado",
] as const;

/** Inventario de unidades físicas identificadas por serial/IMEI. */
const Unidades = ({ embedded = false }: { embedded?: boolean }) => {
  const { t } = useTranslation();
  const { db } = useStore();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [condition, setCondition] = useState<string>("");
  const [productId, setProductId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [controlFiltro, setControlFiltro] = useState<"todos" | "duplicados" | "antiguos">("todos");
  const [diasMinimos, setDiasMinimos] = useState(60);

  const control = useMemo(() => {
    const grupos = new Map<string, string[]>();
    for (const unit of db.units) {
      const serial = unit.serial.trim().toLocaleUpperCase("es");
      if (!serial) continue;
      grupos.set(serial, [...(grupos.get(serial) ?? []), unit.id]);
    }
    const duplicados = new Set([...grupos.values()].filter((ids) => ids.length > 1).flat());
    const ahora = Date.now();
    const antiguos = new Set(db.units.filter((unit) =>
      (unit.status === "en_bodega" || unit.status === "en_local") &&
      Number.isFinite(Date.parse(unit.receivedAt)) &&
      ahora - Date.parse(unit.receivedAt) >= diasMinimos * 86400000,
    ).map((unit) => unit.id));
    return { duplicados, antiguos, grupos: [...grupos.values()].filter((ids) => ids.length > 1).length };
  }, [db.units, diasMinimos]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return getUnitRows(db)
      .filter((row) => controlFiltro === "duplicados" ? control.duplicados.has(row.unit.id) : controlFiltro === "antiguos" ? control.antiguos.has(row.unit.id) : true)
      .filter((row) => (status ? row.unit.status === status : true))
      .filter((row) => (condition ? row.unit.condition === condition : true))
      .filter((row) => (productId ? row.unit.productId === productId : true))
      .filter(
        (row) =>
          !needle ||
          row.unit.serial.toLowerCase().includes(needle) ||
          (row.product?.name ?? "").toLowerCase().includes(needle) ||
          (row.product?.sku ?? "").toLowerCase().includes(needle),
      );
  }, [db, search, status, condition, productId, controlFiltro, control]);

  const handleScan = (serial: string) => {
    const unit = findUnitBySerial(db, serial);
    setSearch(serial);
    if (unit) setSelectedId(unit.id);
  };

  const renderCard = (row: UnitRow) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <ProductThumbnail
            src={row.product?.imageUrl}
            alt={row.product?.name ?? "Referencia"}
            size="lg"
            className="rounded-xl p-0"
          />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1">
              <p className="font-tabular truncate font-medium">{row.unit.serial}</p>
              <CopySerialButton serial={row.unit.serial} />
            </div>
            <p className="truncate text-xs text-muted-foreground">{row.product?.name ?? "—"}</p>
          </div>
        </div>
        <UnitStatusBadge status={row.unit.status} />
      </div>
      <div className="flex items-center justify-between">
        <ConditionBadge condition={row.unit.condition} />
        <span className="text-xs text-muted-foreground">
          {formatDate(row.unit.receivedAt)}
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 stagger">
      {!embedded ? <PageHeader title={t("unit.title")} description={t("unit.subtitle")} /> : null}

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Control inteligente de inventario</h2>
            <p className="text-xs text-muted-foreground">Alertas informativas. Ningún equipo cambia de estado automáticamente.</p>
          </div>
          {controlFiltro !== "todos" ? <Button size="sm" variant="outline" onClick={() => setControlFiltro("todos")}>Quitar filtro</Button> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={() => setControlFiltro(controlFiltro === "duplicados" ? "todos" : "duplicados")} className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${controlFiltro === "duplicados" ? "border-primary bg-primary/5" : ""}`}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-4 w-4" /> Seriales duplicados</div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{control.grupos}</p>
            <p className="text-xs text-muted-foreground">{control.duplicados.size} registros involucrados · Ver equipos <ArrowRight className="inline h-3 w-3" /></p>
          </button>
          <button type="button" onClick={() => setControlFiltro(controlFiltro === "antiguos" ? "todos" : "antiguos")} className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${controlFiltro === "antiguos" ? "border-primary bg-primary/5" : ""}`}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4" /> Equipos sin vender</div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{control.antiguos.size}</p>
            <p className="text-xs text-muted-foreground">Con {diasMinimos} días o más desde su ingreso · Ver equipos <ArrowRight className="inline h-3 w-3" /></p>
          </button>
          <div className="rounded-lg border p-3">
            <label htmlFor="antiguedad-inventario" className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Umbral de antigüedad</label>
            <select id="antiguedad-inventario" value={diasMinimos} onChange={(event) => setDiasMinimos(Number(event.target.value))} className="mt-3 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value={30}>30 días</option>
              <option value={60}>60 días</option>
              <option value={90}>90 días</option>
            </select>
            <p className="mt-2 text-xs text-muted-foreground">Solo equipos disponibles en bodega o local.</p>
          </div>
        </div>
        {controlFiltro !== "todos" ? <p className="text-xs text-muted-foreground">Mostrando {controlFiltro === "duplicados" ? "registros con serial repetido" : `equipos disponibles con al menos ${diasMinimos} días desde su ingreso`}. Puedes combinarlo con los filtros de abajo.</p> : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <section className="space-y-2 rounded-lg border bg-card p-4 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ScanLine className="h-4 w-4 text-primary" />
            {t("unit.scanTitle")}
          </h3>
          <SerialScanInput onScan={handleScan} />
        </section>
        <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={t("unit.searchPlaceholder")}
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
                {t(`unitStatus.${option}`)}
              </Button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <OptionSelect
              value={condition}
              onChange={setCondition}
              emptyLabel={t("unit.allConditions")}
              options={[
                { value: "nuevo", label: t("condition.nuevo") },
                { value: "seminuevo", label: t("condition.seminuevo") },
              ]}
            />
            <OptionSelect
              value={productId}
              onChange={setProductId}
              emptyLabel={t("product.allProducts")}
              options={ordenarProductos(db.products).map((product) => ({
                value: product.id,
                label: `${product.sku} · ${product.name}`,
              }))}
            />
          </div>
        </div>
      </div>

      <DataTable<UnitRow>
        rows={rows}
        rowKey={(row) => row.unit.id}
        onRowClick={(row) => setSelectedId(row.unit.id)}
        emptyTitle={t("unit.emptyTitle")}
        emptyDescription={t("unit.emptyDescription")}
        emptyIcon={ScanLine}
        renderCard={renderCard}
        footer={t("common.resultsCount", { count: rows.length })}
        columns={[
          {
            key: "serial",
            header: t("unit.serial"),
            cell: (row) => (
              <span className="inline-flex items-center gap-1">
                <span className="font-tabular font-medium">{row.unit.serial}</span>
                <CopySerialButton serial={row.unit.serial} />
              </span>
            ),
          },
          {
            key: "product",
            header: t("product.title"),
            cell: (row) => (
              <div className="flex min-w-0 items-center gap-2">
                <ProductThumbnail
                  src={row.product?.imageUrl}
                  alt={row.product?.name ?? "Referencia"}
                  size="lg"
                  className="rounded-xl p-0"
                />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold leading-snug">{row.product?.name ?? "—"}</p>
                  <p className="font-tabular mt-0.5 text-xs text-muted-foreground">
                    {row.product?.sku ?? ""}
                  </p>
                </div>
              </div>
            ),
          },
          {
            key: "condition",
            header: t("unit.condition"),
            cell: (row) => <ConditionBadge condition={row.unit.condition} />,
          },
          {
            key: "status",
            header: t("common.status"),
            cell: (row) => <UnitStatusBadge status={row.unit.status} />,
          },
          {
            key: "received",
            header: t("unit.receivedAt"),
            cell: (row) => (
              <span className="text-sm text-muted-foreground">
                {formatDate(row.unit.receivedAt)}
              </span>
            ),
          },
          {
            key: "location",
            header: t("unit.location"),
            cell: (row) => (
              <span className="text-sm text-muted-foreground">{row.unit.location ?? "—"}</span>
            ),
          },
        ]}
      />

      <UnitDetailSheet unitId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
};

export default Unidades;
