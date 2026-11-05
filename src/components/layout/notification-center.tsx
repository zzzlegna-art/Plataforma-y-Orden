import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCheck, CircleAlert, Inbox, RefreshCw, Truck } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  notificationDateLabel,
  notificationDestination,
  notificationIsImportant,
  type NexoraNotification,
} from "@/lib/nexora-notifications";

type ViewFilter = "all" | "unread";

/**
 * Campana global de Nexora. Las notificaciones se generan en la BD por eventos
 * de traslado; este cliente solo puede SELECT y UPDATE(read) sobre las suyas.
 * El polling/focus respalda Realtime cuando se pierde una conexión.
 */
export const NotificationCenter = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [notifications, setNotifications] = useState<NexoraNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fetchVersion = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const version = ++fetchVersion.current;
    const [feed, count] = await Promise.all([
      supabase.from("notifications")
        .select("id,user_id,title,message,type,read,created_at,site_id,transfer_id,source_event_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase.from("notifications")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", userId)
        .eq("read", false),
    ]);
    if (version !== fetchVersion.current) return;
    if (feed.error || count.error) {
      setErrorMessage(feed.error?.message ?? count.error?.message ?? "No se pudieron consultar las notificaciones.");
    } else {
      setNotifications(feed.data ?? []);
      setUnreadCount(count.count ?? 0);
      setErrorMessage(null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchVersion.current += 1;
    setNotifications([]);
    setUnreadCount(0);
    setErrorMessage(null);
    setLoading(Boolean(userId));
    if (!userId) return;

    let active = true;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    void refresh();

    // Los trabajadores también necesitan autenticarse en Realtime aunque el
    // proveedor del inventario no abra sus canales globales para estos roles.
    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session || data.session.user.id !== userId || !active) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (!active) return;

      channel = supabase.channel("nexora-notifications-" + userId)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        }, () => { void refresh(); })
        .subscribe();
    })().catch(() => {
      // El temporizador y la recarga al volver a la pestaña siguen activos.
    });

    const syncVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 40_000);
    window.addEventListener("focus", syncVisible);
    document.addEventListener("visibilitychange", syncVisible);
    return () => {
      active = false;
      fetchVersion.current += 1;
      window.clearInterval(timer);
      window.removeEventListener("focus", syncVisible);
      document.removeEventListener("visibilitychange", syncVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  const markRead = useCallback(async (notification: NexoraNotification, read: boolean) => {
    if (!userId || busy) return;
    setBusy(notification.id);
    const { error } = await supabase.from("notifications")
      .update({ read })
      .eq("id", notification.id)
      .eq("user_id", userId);
    if (error) setErrorMessage("No se pudo cambiar el estado del aviso: " + error.message);
    else await refresh();
    setBusy(null);
  }, [userId, busy, refresh]);

  const markAllRead = useCallback(async () => {
    if (!userId || busy || unreadCount === 0) return;
    setBusy("all");
    const { error } = await supabase.from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    if (error) setErrorMessage("No se pudieron marcar los avisos: " + error.message);
    else await refresh();
    setBusy(null);
  }, [userId, busy, unreadCount, refresh]);

  const visible = useMemo(() => filter === "unread"
    ? notifications.filter((notification) => !notification.read)
    : notifications, [notifications, filter]);

  if (!userId) return null;

  return (
    <Popover open={open} onOpenChange={(next) => {
      setOpen(next);
      if (next) void refresh();
    }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon"
          className="relative h-11 w-11 rounded-xl border border-transparent hover:border-primary/20 hover:bg-primary/5"
          title="Centro de notificaciones"
          aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ""}`}>
          <Bell className="h-[19px] w-[19px]" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full border-2 border-card bg-primary px-1 text-[9px] font-black leading-none text-primary-foreground"
              aria-hidden="true">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10}
        className="w-[min(93vw,430px)] overflow-hidden rounded-2xl border-border/80 bg-popover p-0 shadow-[0_28px_70px_-20px_rgba(0,0,0,.34)]">
        <div className="border-b border-border/60 bg-gradient-to-br from-primary/[.07] via-background/50 to-background px-4 pb-3 pt-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-primary">Centro de actividad</p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">Notificaciones</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} ${unreadCount === 1 ? "aviso sin leer" : "avisos sin leer"}` : "Estás al día con tus avisos"}
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
              title="Actualizar notificaciones" aria-label="Actualizar notificaciones"
              onClick={() => void refresh()}>
              <RefreshCw className={"h-4 w-4" + (loading ? " animate-spin" : "")} />
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex gap-1 rounded-xl bg-muted/70 p-1" aria-label="Filtro de notificaciones">
              <button type="button" onClick={() => setFilter("all")}
                aria-pressed={filter === "all"}
                className={"rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
                  (filter === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                Todas
              </button>
              <button type="button" onClick={() => setFilter("unread")}
                aria-pressed={filter === "unread"}
                className={"rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
                  (filter === "unread" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                Sin leer
              </button>
            </div>
            <Button type="button" size="sm" variant="ghost" disabled={Boolean(busy) || unreadCount === 0}
              className="h-8 gap-1.5 px-2 text-[11px]" onClick={() => void markAllRead()}>
              <CheckCheck className="h-3.5 w-3.5" />
              Leer todas
            </Button>
          </div>
        </div>

        {errorMessage ? (
          <div role="alert" className="mx-3 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <div className="max-h-[min(57vh,490px)] min-h-[170px] overflow-y-auto overscroll-contain" role="list"
          aria-label="Avisos de Nexora">
          {loading && notifications.length === 0 ? (
            <p role="status" className="px-5 py-10 text-center text-sm text-muted-foreground">Consultando notificaciones…</p>
          ) : null}
          {!loading && visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-11 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted/70">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </span>
              <p className="text-sm font-bold text-foreground">
                {filter === "unread" ? "No tienes avisos pendientes" : "Aún no hay notificaciones"}
              </p>
              <p className="max-w-[255px] text-xs leading-relaxed text-muted-foreground">
                Los nuevos traslados y sus novedades aparecerán aquí automáticamente.
              </p>
            </div>
          ) : null}
          {visible.map((notification) => (
            <div role="listitem" key={notification.id}
              className={"border-b border-border/50 px-4 py-3.5 last:border-b-0 sm:px-5 " +
                (!notification.read ? "bg-primary/[.045]" : "bg-transparent")}>
              <div className="flex gap-3">
                <span className={"mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl " +
                  (notificationIsImportant(notification.type)
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "bg-primary/10 text-primary")}>
                  {notificationIsImportant(notification.type) ?
                    <CircleAlert className="h-[18px] w-[18px]" /> : <Truck className="h-[18px] w-[18px]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className={"min-w-0 flex-1 text-[13px] leading-snug text-foreground " +
                      (notification.read ? "font-semibold" : "font-extrabold")}>
                      {notification.title}
                    </p>
                    {!notification.read ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Sin leer" /> : null}
                  </div>
                  {notification.message ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{notification.message}</p> : null}
                  <p className="mt-2 text-[10px] font-medium text-muted-foreground">
                    {notificationDateLabel(notification.created_at)}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Link to={notificationDestination(notification)}
                      onClick={() => {
                        setOpen(false);
                        if (!notification.read) void markRead(notification, true);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/15">
                      Ver traslado
                    </Link>
                    <button type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void markRead(notification, !notification.read)}
                      className="rounded-lg px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50">
                      {notification.read ? "Marcar sin leer" : "Marcar como leído"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border/60 bg-muted/30 px-4 py-2.5 text-[10px] text-muted-foreground sm:px-5">
          Los avisos se conservan al cerrar sesión y se sincronizan entre tus pestañas Next.
        </div>
      </PopoverContent>
    </Popover>
  );
};
