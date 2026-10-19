import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Estado vacío reutilizable para listados sin resultados. */
export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "animate-fade-in flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-gradient-to-b from-card to-muted/20 px-6 py-14 text-center motion-reduce:animate-none",
      className,
    )}
  >
    {Icon ? (
      <span className="animate-pop-in rounded-2xl bg-primary/10 p-4 text-primary ring-1 ring-inset ring-primary/15 motion-reduce:animate-none">
        <Icon className="h-6 w-6" strokeWidth={1.8} />
      </span>
    ) : null}
    <p className="text-sm font-semibold tracking-tight">{title}</p>
    {description ? (
      <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
    ) : null}
    {action ? <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div> : null}
  </div>
);
