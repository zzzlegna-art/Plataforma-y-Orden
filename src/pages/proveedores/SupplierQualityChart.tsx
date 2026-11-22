import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, ShieldCheck, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/hooks/use-store";
import { calculateSupplierQuality, type SupplierQualityRow } from "@/lib/supplier-quality";
import type { Supplier } from "@/lib/suppliers";

const number = new Intl.NumberFormat("es-CO");
const percentage = (value: number) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value) + "%";

type DisplayRow = SupplierQualityRow & { shortName: string };

/** Gráfica basada en seriales reales de recepción + reclamaciones de garantía. */
export const SupplierQualityChart = ({ suppliers }: { suppliers: Supplier[] }) => {
  const { db } = useStore();
  const report = useMemo(() => calculateSupplierQuality(db, suppliers), [db, suppliers]);
  const [metric, setMetric] = useState<"rate" | "cases">("rate");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const candidates = useMemo(() => [...report.rows]
    .filter((row) => row.received > 0)
    .sort((a, b) => metric === "rate"
      ? b.rate - a.rate || b.cases - a.cases || a.name.localeCompare(b.name, "es")
      : b.cases - a.cases || b.rate - a.rate || a.name.localeCompare(b.name, "es")),
  [report.rows, metric]);
  const displayed: DisplayRow[] = candidates.slice(0, 10).map((row) => ({
    ...row, shortName: row.name.length > 23 ? row.name.slice(0, 22) + "…" : row.name,
  }));
  const chosen = report.rows.find((row) => row.supplierId === selectedId) ?? candidates[0];
  const overallRate = report.received ? report.affected / report.received * 100 : 0;
  const maxVisible = Math.max(1, ...displayed.map((row) => metric === "rate" ? row.rate : row.cases));

  return (
    <section className="nx-supplier-quality-v2 space-y-4 rounded-2xl border bg-card p-4 shadow-sm md:p-5"
      aria-labelledby="supplier-quality-heading">
      <div className="nx-supplier-quality-head">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            <BarChart3 className="h-4 w-4" /> Control de calidad
          </p>
          <h3 id="supplier-quality-heading" className="text-lg font-semibold tracking-tight">
            Novedades por proveedor
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Equipos con garantía frente a unidades ingresadas por recepción confirmada.
            Se cuenta cada serial afectado una sola vez por ingreso, aunque tenga varias garantías.
          </p>
        </div>
        <div className="nx-supplier-quality-mode flex rounded-lg border bg-muted/40 p-1" role="group" aria-label="Ordenar proveedores por">
          <Button size="sm" type="button" variant={metric === "rate" ? "secondary" : "ghost"}
            aria-pressed={metric === "rate"} onClick={() => setMetric("rate")}>
            Porcentaje
          </Button>
          <Button size="sm" type="button" variant={metric === "cases" ? "secondary" : "ghost"}
            aria-pressed={metric === "cases"} onClick={() => setMetric("cases")}>
            Garantías
          </Button>
        </div>
      </div>
      <div className="nx-supplier-quality-body">
      <div className="nx-supplier-quality-metrics grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="nx-supplier-quality-metric rounded-xl border bg-muted/20 p-3">
          <span className="text-xs text-muted-foreground">Equipos recibidos</span>
          <p className="mt-1 text-xl font-semibold tabular-nums">{number.format(report.received)}</p>
        </div>
        <div className="nx-supplier-quality-metric rounded-xl border bg-muted/20 p-3">
          <span className="text-xs text-muted-foreground">Equipos con novedad</span>
          <p className="mt-1 text-xl font-semibold tabular-nums">{number.format(report.affected)}</p>
        </div>
        <div className="nx-supplier-quality-metric rounded-xl border bg-muted/20 p-3">
          <span className="text-xs text-muted-foreground">Tasa global de novedades</span>
          <p className="mt-1 text-xl font-semibold tabular-nums">{percentage(overallRate)}</p>
        </div>
        <div className="nx-supplier-quality-metric rounded-xl border bg-muted/20 p-3">
          <span className="text-xs text-muted-foreground">Casos de garantía</span>
          <p className="mt-1 text-xl font-semibold tabular-nums">{number.format(report.cases)}</p>
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/15 px-4 py-9 text-center">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-primary" />
          <p className="text-sm font-medium">Todavía no hay recepciones confirmadas vinculadas a proveedores.</p>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Registra el proveedor al recibir equipos, o asígnalo a una recepción anterior con el botón
            «Proveedor». La comparación aparecerá automáticamente sin modificar los seriales.
          </p>
        </div>
      ) : (
        <div className="nx-supplier-analysis">
          <div className="nx-supplier-ranking">
            <div className="nx-supplier-ranking-heading">
              <span>{metric === "rate" ? "Tasa de novedades por proveedor" : "Casos de garantía por proveedor"}</span>
              <span>Top {displayed.length}</span>
            </div>
            <div className="nx-supplier-ranked-list">
              {displayed.map((row, index) => {
                const value = metric === "rate" ? row.rate : row.cases;
                return (
                  <button
                    key={row.supplierId}
                    type="button"
                    className="nx-supplier-rank-row"
                    aria-pressed={row.supplierId === chosen?.supplierId}
                    aria-label={row.name + ": " + (metric === "rate" ? percentage(row.rate) : number.format(row.cases) + " garantías")}
                    onClick={() => setSelectedId(row.supplierId)}
                  >
                    <span className="nx-supplier-rank-name">
                      <span className="nx-supplier-rank-number">{String(index + 1).padStart(2, "0")}</span>
                      <span title={row.name}>{row.name}</span>
                    </span>
                    <span className="nx-supplier-rank-track" aria-hidden="true">
                      <span style={{ width: String(Math.max(0, value / maxVisible * 100)) + "%" }} />
                    </span>
                    <span className="nx-supplier-rank-value">
                      {metric === "rate" ? percentage(row.rate) : number.format(row.cases)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="nx-supplier-ranking-footnote">
              Las barras se comparan con el valor más alto de la lista. Las cifras muestran la tasa o cantidad real.
            </p>
          </div>

          {chosen ? (
            <div className="nx-supplier-selected">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <TrendingUp className="h-4 w-4" /> Proveedor seleccionado
              </div>
              <p>{chosen.name}</p>
              <p className="nx-supplier-selected-score">
                {metric === "rate" ? percentage(chosen.rate) : number.format(chosen.cases)}
              </p>
              <p className="text-xs text-muted-foreground">
                {metric === "rate" ? "de los equipos recibidos con alguna novedad" : "casos de garantía vinculados"}
              </p>
              <div className="mt-1 space-y-1.5 border-t pt-3 text-sm">
                <div className="flex justify-between gap-2"><span>Recibidos</span><strong>{number.format(chosen.received)}</strong></div>
                <div className="flex justify-between gap-2"><span>Con novedad</span><strong>{number.format(chosen.affected)}</strong></div>
                <div className="flex justify-between gap-2"><span>Casos</span><strong>{number.format(chosen.cases)}</strong></div>
              </div>
              {chosen.received < 10 ? (
                <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Muestra pequeña: menos de 10 equipos. Compara con cautela.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {report.rows.length > 0 && report.received > 0 ? (
        <div className="nx-supplier-quality-table overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[590px] text-left text-sm">
            <thead className="bg-muted/45 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Proveedor</th>
                <th className="px-3 py-2 text-right font-semibold">Recibidos</th>
                <th className="px-3 py-2 text-right font-semibold">Con novedad</th>
                <th className="px-3 py-2 text-right font-semibold">Garantías</th>
                <th className="px-3 py-2 text-right font-semibold">Tasa</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.supplierId} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">
                    <button type="button" aria-pressed={chosen?.supplierId === row.supplierId}
                      onClick={() => setSelectedId(row.supplierId)}
                      className="text-left hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {row.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{number.format(row.received)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{number.format(row.affected)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{number.format(row.cases)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {row.received > 0 ? percentage(row.rate) : "Sin ingresos"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {(report.unassignedReceived > 0 || report.unassignedCases > 0 || report.unmatchedCases > 0) ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Sin atribución: {number.format(report.unassignedReceived)} ingresos sin proveedor,
          {" "}{number.format(report.unassignedCases)} garantías de esos ingresos y
          {" "}{number.format(report.unmatchedCases)} garantías sin procedencia verificable.
          No se asignan arbitrariamente a ningún proveedor.
        </p>
      ) : null}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Histórico acumulado. Incluye garantías por falla en inventario y devoluciones de ventas
        cuando se identifica el serial. El porcentaje usa unidades de ingresos confirmados, no
        cantidad de facturas ni número de garantías. Un mismo serial puede ingresar de nuevo
        y se evalúa en el lote que precede a cada novedad.
      </p>
      </div>
    </section>
  );
};
