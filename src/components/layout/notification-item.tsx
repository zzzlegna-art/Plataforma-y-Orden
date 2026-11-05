import { AlertTriangle, ArrowUpRight, Check, PackageCheck, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  formatNotificationDate, notificationHref, notificationIsUrgent,
  type NexoraNotification,
} from "@/lib/nexora-notifications";

export const NotificationItem = ({ item, onOpen, onRead, compact = false }: {
  item: NexoraNotification;
  onOpen: (item: NexoraNotification) => void;
  onRead: (id: string) => void;
  compact?: boolean;
}) => {
  const urgent = notificationIsUrgent(item);
  const Icon = urgent ? AlertTriangle : item.type === "transfer_received" || item.type === "transfer_returned"
    ? PackageCheck : Truck;
  return (
    <article className={cn(
      "group flex min-w-0 items-start gap-3 rounded-xl border p-3 transition-colors",
      item.read
        ? "border-border/60 bg-background/55 hover:bg-muted/55"
        : "border-primary/20 bg-primary/[0.055] hover:bg-primary/[0.085]",
      compact ? "gap-2.5 p-2.5" : "sm:p-4",
    )}>
      <span className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl border",
        urgent ? "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300"
          : "border-primary/15 bg-primary/10 text-primary",
      )}><Icon className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1 space-y-1">
        <Link
          to={notificationHref(item)}
          onClick={() => onOpen(item)}
          className="block rounded-sm outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          aria-label={item.title + (item.read ? "" : " · Sin leer")}
        >
          <div className="flex items-start justify-between gap-2">
            <span className={cn("min-w-0 text-sm leading-snug", item.read ? "font-medium" : "font-bold")}>
              {item.title}
            </span>
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-70 group-hover:text-primary" aria-hidden="true" />
          </div>
          {item.message && <p className={cn("text-xs leading-relaxed text-muted-foreground", compact && "line-clamp-2")}>{item.message}</p>}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
          <time className="text-[11px] text-muted-foreground" dateTime={item.created_at}>
            {formatNotificationDate(item.created_at)}
          </time>
          {!item.read ? (
            <button type="button" onClick={() => onRead(item.id)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={"Marcar como leída: " + item.title}>
              <Check className="size-3" /> Marcar leída
            </button>
          ) : <span className="text-[11px] text-muted-foreground">Leída</span>}
        </div>
      </div>
      {!item.read && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
    </article>
  );
};
