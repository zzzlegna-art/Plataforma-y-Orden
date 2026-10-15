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
      "animate-fade-in flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card/50 px-6 py-12 text-center motion-reduce:animate-none",
      className,
    )}
  >
    {Icon ? (
      <span className="animate-pop-in rounded-full bg-muted p-3 text-muted-foreground motion-reduce:animate-none">
        <Icon className="h-5 w-5" />
      </span>
    ) : null}
    <p className="text-sm font-semibold">{title}</p>
    {description ? (
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    ) : null}
    {action ? <div className="mt-2 flex gap-2">{action}</div> : null}
  </div>
);
