import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "info" | "destructive";

const TONE_CLASSES: Record<Tone, string> = {
  primary: "bg-lime-100 text-emerald-700",
  success: "bg-emerald-100 text-emerald-600",
  warning: "bg-amber-100 text-amber-600",
  info: "bg-blue-100 text-blue-600",
  destructive: "bg-red-100 text-red-600",
};

const BAR_CLASSES: Record<Tone, string> = {
  primary: "bg-lime-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  info: "bg-blue-400",
  destructive: "bg-red-400",
};

type TrendTone = "positive" | "negative" | "neutral";

const TREND_CLASSES: Record<TrendTone, string> = {
  positive: "bg-emerald-50 text-emerald-600",
  negative: "bg-red-50 text-red-600",
  neutral: "bg-slate-100 text-slate-600",
};

export const StatCard = ({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  className,
  trend,
  trendTone = "positive",
  monetaryValue = false,
  premium = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
  trend?: string;
  trendTone?: TrendTone;
  monetaryValue?: boolean;
  premium?: boolean;
}) => premium ? (
  <article className={cn("nx-premium-stat-card", `nx-premium-stat-card--${tone}`, className)}>
    <div className="nx-premium-stat-top">
      <p className="nx-premium-stat-label">{label}</p>
      {Icon ? (
        <span className="nx-premium-stat-icon" aria-hidden="true">
          <Icon />
        </span>
      ) : null}
    </div>
    <div className="nx-premium-stat-numbers">
      <p className={cn("nx-premium-stat-value", monetaryValue && "nx-premium-stat-value--money")}>
        {value}
      </p>
      {trend ? (
        <span className={cn("nx-premium-stat-trend", `nx-premium-stat-trend--${trendTone}`)}>
          {trendTone === "negative" ? <TrendingDown /> : trendTone === "neutral" ? <Minus /> : <TrendingUp />}
          {trend}
        </span>
      ) : null}
    </div>
    <div className="nx-premium-stat-footer">
      {hint ? <p className="nx-premium-stat-hint">{hint}</p> : <span />}
      <div className="nx-premium-stat-bars" aria-hidden="true">
        {[22, 35, 48, 62].map((height, index) => (
          <span key={height} style={{ height: `${height}px`, opacity: 0.35 + index * 0.18 }} />
        ))}
      </div>
    </div>
  </article>
) : (
  <div
    className={cn(
      "group relative overflow-hidden nx-stat-card rounded-2xl border border-border/60 bg-card p-5 shadow-[0_18px_45px_-25px_rgba(15,23,42,.20)] transition hover:-translate-y-1",
      monetaryValue && "min-w-0",
      className,
    )}
    style={monetaryValue ? { containerType: "inline-size" } : undefined}
  >
    <div className="relative z-10 min-w-0">
      <p className="nx-stat-label min-h-10 pr-14 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
        <p
          className={cn(
            "font-tabular min-w-0 font-extrabold leading-none",
            monetaryValue ? "max-w-full break-words tracking-tight" : "text-3xl",
          )}
          style={monetaryValue ? { fontSize: "clamp(1rem, 8.5cqw, 1.875rem)" } : undefined}
        >{value}</p>
        {trend ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold", TREND_CLASSES[trendTone])}>
            {trendTone === "negative" ? (
              <TrendingDown className="h-3 w-3" />
            ) : trendTone === "neutral" ? (
              <Minus className="h-3 w-3" />
            ) : (
              <TrendingUp className="h-3 w-3" />
            )}
            {trend}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-3 max-w-[calc(100%_-_3.5rem)] text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>

    <div className="pointer-events-none absolute inset-y-5 right-5 flex flex-col items-end justify-between">
      {Icon ? (
        <span className={cn("rounded-xl p-3", TONE_CLASSES[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      ) : (
        <span />
      )}

      <div className="flex h-10 items-end gap-1 opacity-90">
        {[12, 20, 28, 36].map((h, index) => (
          <span
            key={h}
            className={cn("w-1.5 rounded-full transition-all", BAR_CLASSES[tone])}
            style={{ height: h, opacity: 0.35 + index * 0.16 }}
          />
        ))}
      </div>
    </div>
  </div>
);
