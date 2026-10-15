import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScanLine } from "lucide-react";

import { DataTable } from "@/components/shared/data-table";
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
const Unidades = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [condition, setCondition] = useState<string>("");
  const [productId, setProductId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return getUnitRows(db)
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
  }, [db, search, status, condition, productId]);

  const handleScan = (serial: string) => {
    const unit = findUnitBySerial(db, serial);
    setSearch(serial);
    if (unit) setSelectedId(unit.id);
  };

  const renderCard = (row: UnitRow) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-tabular truncate font-medium">{row.unit.serial}</p>
          <p className="truncate text-xs text-muted-foreground">{row.product?.name ?? "—"}</p>
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
      <PageHeader title={t("unit.title")} description={t("unit.subtitle")} />

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
              <span className="font-tabular font-medium">{row.unit.serial}</span>
            ),
          },
          {
            key: "product",
            header: t("product.title"),
            cell: (row) => (
              <div className="min-w-0">
                <p className="truncate text-sm">{row.product?.name ?? "—"}</p>
                <p className="font-tabular text-xs text-muted-foreground">
                  {row.product?.sku ?? ""}
                </p>
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
