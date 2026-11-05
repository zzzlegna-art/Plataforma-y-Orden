import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  NOTIFICATION_PAGE_SIZE,
  getUnreadNotificationCount, listNotifications, markAllNotificationsRead,
  markNotificationRead, type NexoraNotification,
} from "@/lib/nexora-notifications";

interface NotificationState {
  owner: string | null;
  items: NexoraNotification[];
  unread: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

interface NotificationContextValue extends Omit<NotificationState, "owner"> {
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const emptyState = (owner: string | null): NotificationState => ({
  owner, items: [], unread: 0, hasMore: false,
  loading: Boolean(owner), loadingMore: false, error: null,
});

const Context = createContext<NotificationContextValue | null>(null);

export const NotificationsProvider = ({ userId, children }: {
  userId: string | null;
  children: ReactNode;
}) => {
  const [state, setState] = useState<NotificationState>(() => emptyState(userId));
  const sequence = useRef(0);
  const moreInProgress = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) { setState(emptyState(null)); return; }
    const request = ++sequence.current;
    setState(old => ({
      ...old, owner: userId, loading: old.owner !== userId || old.items.length === 0,
      error: null,
    }));
    try {
      const [items, unread] = await Promise.all([
        listNotifications(userId), getUnreadNotificationCount(userId),
      ]);
      if (request !== sequence.current) return;
      setState({
        owner: userId, items, unread, hasMore: items.length === NOTIFICATION_PAGE_SIZE,
        loading: false, loadingMore: false, error: null,
      });
    } catch (error) {
      if (request !== sequence.current) return;
      setState(old => ({
        ...old, owner: userId, loading: false, loadingMore: false,
        error: error instanceof Error ? error.message : "No se pudieron cargar las notificaciones.",
      }));
    }
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (!userId || moreInProgress.current || state.owner !== userId || !state.hasMore) return;
    moreInProgress.current = true;
    const request = sequence.current;
    setState(old => ({ ...old, loadingMore: true, error: null }));
    try {
      const next = await listNotifications(userId, state.items.length);
      if (request !== sequence.current) return;
      setState(old => ({
        ...old, items: [...old.items, ...next],
        hasMore: next.length === NOTIFICATION_PAGE_SIZE,
        loadingMore: false,
      }));
    } catch (error) {
      if (request === sequence.current) setState(old => ({
        ...old, loadingMore: false,
        error: error instanceof Error ? error.message : "No se pudieron cargar más avisos.",
      }));
    } finally {
      moreInProgress.current = false;
    }
  }, [userId, state.owner, state.items.length, state.hasMore]);

  const markRead = useCallback(async (id: string) => {
    if (!userId) return;
    await markNotificationRead(userId, id);
    await refresh();
  }, [refresh, userId]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await markAllNotificationsRead(userId);
    await refresh();
  }, [refresh, userId]);

  useEffect(() => {
    ++sequence.current;
    moreInProgress.current = false;
    setState(emptyState(userId));
    if (!userId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const refreshOnFocus = () => void refresh();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshOnFocus);
    // Respaldo ante WebSocket interrumpido, sin exigir mantener la campana abierta.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session || data.session.user.id !== userId) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase
        .channel("nexora-alerts-" + userId + "-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", {
          event: "*", schema: "public", table: "notifications", filter: "user_id=eq." + userId,
        }, () => { void refresh(); })
        .subscribe();
    })().catch(() => {
      // El polling y la recuperación al enfocar siguen activos si falla Realtime.
    });

    return () => {
      cancelled = true;
      ++sequence.current;
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshOnFocus);
      window.clearInterval(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  const visible = state.owner === userId ? state : emptyState(userId);
  return (
    <Context.Provider value={{
      items: visible.items, unread: visible.unread, hasMore: visible.hasMore,
      loading: visible.loading, loadingMore: visible.loadingMore, error: visible.error,
      refresh, loadMore, markRead, markAllRead,
    }}>
      {children}
    </Context.Provider>
  );
};

export const useNotifications = (): NotificationContextValue => {
  const context = useContext(Context);
  if (!context) throw new Error("Notificaciones: falta NotificationsProvider.");
  return context;
};
