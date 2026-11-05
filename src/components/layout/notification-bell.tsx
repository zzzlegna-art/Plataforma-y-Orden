import { useState } from "react";
import { Bell, CheckCheck, ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NotificationItem } from "./notification-item";
import { useNotifications } from "./notifications-context";

export const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const { items, unread, loading, error, refresh, markRead, markAllRead } = useNotifications();
  const mark = (id: string) => {
    void markRead(id).catch(error => toast.error(error instanceof Error ? error.message : "No se pudo marcar como leída."));
  };
  const markAll = () => {
    void markAllRead().catch(error => toast.error(error instanceof Error ? error.message : "No se pudieron marcar los avisos."));
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon"
          className="relative h-10 w-10 shrink-0 rounded-xl border border-border/60 hover:bg-primary/5"
          aria-label={unread > 0 ? "Notificaciones: " + unread + " sin leer" : "Notificaciones"}
          title="Centro de notificaciones">
          <Bell className="size-[19px]" aria-hidden="true" />
          {unread > 0 ? <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-card bg-primary px-0.5 text-[10px] font-bold leading-none text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[min(94vw,430px)] overflow-hidden rounded-2xl border-border/80 p-0 shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b bg-gradient-to-r from-primary/[.07] via-background to-background px-4 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold tracking-tight">Centro de notificaciones</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {unread > 0 ? unread + " sin leer" : "Todo al día"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => void refresh()} aria-label="Actualizar notificaciones" title="Actualizar">
              <RefreshCw className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" disabled={unread === 0} onClick={markAll}
              className="gap-1 text-xs" title="Marcar todas como leídas">
              <CheckCheck className="size-4" /><span className="hidden sm:inline">Leer todas</span>
            </Button>
          </div>
        </div>
        {error && <p role="alert" className="mx-3 mt-3 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}
        <ScrollArea className="h-[min(56vh,410px)]">
          <div className="space-y-2 p-3">
            {loading && items.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Cargando avisos…</p> : null}
            {!loading && items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Bell className="size-9 text-muted-foreground/35" aria-hidden="true" />
                <p className="text-sm font-semibold">Sin notificaciones por ahora</p>
                <p className="max-w-[260px] text-xs text-muted-foreground">Los traslados y las novedades de tus sedes aparecerán aquí.</p>
              </div>
            ) : items.slice(0, 8).map(item => (
              <NotificationItem key={item.id} item={item} compact
                onOpen={notification => { setOpen(false); if (!notification.read) mark(notification.id); }}
                onRead={mark} />
            ))}
          </div>
        </ScrollArea>
        <div className="border-t bg-muted/20 p-2.5">
          <Button variant="outline" asChild className="h-9 w-full gap-2 text-xs font-semibold">
            <Link to="/notificaciones" onClick={() => setOpen(false)}>
              Ver todas las notificaciones <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
