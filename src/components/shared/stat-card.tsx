import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "info" | "destructive";

const TONE_CLASSES: Record<Tone, string> = {
  primary: "bg-lime-100 text-emerald-700",
  success: "bg-emerald-100 text-emerald-600",
  warning: "bg-amber-100 text-amber-600",
  info: "bg-blue-100 text-blue-600",
  destructive: "bg-red-100 text-red-600",
};

export const StatCard = ({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  className,
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
  trend?: string;
}) => (
  <div
    className={cn(
      "group relative overflow-hidden nx-stat-card rounded-2xl border border-border/60 bg-card p-5 shadow-[0_18px_45px_-25px_rgba(15,23,42,.20)] transition hover:-translate-y-1",
      className,
    )}
  >
    <div className="relative z-10 pr-14">
      <p className="nx-stat-label text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-4 flex items-center gap-2">
        <p className="font-tabular text-3xl font-extrabold leading-none">{value}</p>
        {trend ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600">
            <TrendingUp className="h-3 w-3" />
            {trend}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-3 max-w-[28ch] text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>

    {Icon ? (
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute right-5 top-5 rounded-xl p-3", TONE_CLASSES[tone])}
      >
        <Icon className="h-5 w-5" />
      </span>
    ) : null}
  </div>
);
