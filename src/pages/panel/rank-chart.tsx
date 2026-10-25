import { useState } from "react";
import { Sparkles } from "lucide-react";

import { getRankSharePercent, type RankDatum } from "@/lib/dashboard-charts";
import { cn } from "@/lib/utils";

interface RankChartProps {
  data: RankDatum[];
  formatValue: (value: number) => string;
  summaryLabel: string;
  selectedSummaryLabel: string;
}

/**
 * La selección pertenece únicamente a la gráfica montada en el panel.
 * Al salir del panel y regresar, cada ranking vuelve al puesto #1.
 */
export const RankChart = ({ data, formatValue, summaryLabel, selectedSummaryLabel }: RankChartProps) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const totalValue = data.reduce((total, row) => total + Math.max(0, row.value), 0);
  const foundIndex = data.findIndex((row) => row.key === selectedKey);
  const selectedIndex = foundIndex >= 0 ? foundIndex : 0;
  const selected = data[selectedIndex];
  const isLeader = selectedIndex === 0;
  const selectedShare = selected ? Math.round(getRankSharePercent(selected.value, totalValue)) : 0;

  return (
    <div className="space-y-3">
      <div className="relative isolate overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-card to-card p-4" aria-live="polite">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
              <Sparkles className="h-3 w-3" />
              Resumen del ranking
            </span>
            <p className="font-tabular mt-3 text-2xl font-bold tracking-tight">
              {formatValue(isLeader ? totalValue : selected.value)}
            </p>
            <p className="mt-1 text-xs leading-4 text-muted-foreground">
              {isLeader ? summaryLabel : selectedSummaryLabel}
            </p>
          </div>
          {selected ? (
            <div className="max-w-[48%] shrink-0 text-right">
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold",
                isLeader
                  ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-primary/20 bg-primary/10 text-primary",
              )}>
                <span aria-hidden="true">✦</span>
                {isLeader ? "LÍDER" : `PUESTO #${selectedIndex + 1}`}
              </span>
              <p title={selected.name} className="mt-2 break-words text-sm font-semibold">{selected.name}</p>
              <p className="font-tabular mt-0.5 text-xs text-muted-foreground">
                {formatValue(selected.value)} · {selectedShare}% del total
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-1">
        {data.map((row, index) => {
          const barWidth = getRankSharePercent(row.value, totalValue);
          const share = Math.round(barWidth);
          const active = index === selectedIndex;
          const rankTone =
            index === 0
              ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : index === 1
                ? "border-slate-400/30 bg-slate-400/10 text-slate-600 dark:text-slate-300"
                : index === 2
                  ? "border-orange-700/20 bg-orange-700/10 text-orange-700 dark:text-orange-300"
                  : "border-border bg-muted/60 text-muted-foreground";

          return (
            <button
              type="button"
              key={row.key}
              aria-label={`Ver resumen de ${row.name}, puesto ${index + 1}`}
              aria-pressed={active}
              onClick={() => setSelectedKey(row.key)}
              className={cn(
                "group block w-full rounded-xl border px-2.5 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                active
                  ? "border-primary/40 bg-primary/[0.06]"
                  : "border-transparent hover:border-border/70 hover:bg-muted/35",
              )}
            >
              <span className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-[11px] font-bold tabular-nums transition-transform duration-200 group-hover:scale-105",
                    rankTone,
                  )}
                  aria-label={`Puesto ${index + 1}`}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mb-2 flex items-start justify-between gap-3">
                    <span title={row.name} className="min-w-0 truncate text-sm font-semibold leading-5">
                      {row.name}
                    </span>
                    <span className="font-tabular shrink-0 text-sm font-bold">{formatValue(row.value)}</span>
                  </span>
                  <span
                    role="img"
                    aria-label={row.name + ": " + formatValue(row.value) + ", " + share + "% del total del ranking"}
                    className="block h-2 overflow-hidden rounded-full bg-muted/80 ring-1 ring-inset ring-border/40"
                  >
                    <span
                      className="block h-full rounded-full transition-[width] duration-700 ease-out"
                      style={{
                        width: String(barWidth) + "%",
                        background: "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary-glow)) 100%)",
                      }}
                    />
                  </span>
                  <span className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>{index === 0 ? "Mayor aporte" : "Participación del ranking"}</span>
                    <span className="font-tabular font-medium">{share}%</span>
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
