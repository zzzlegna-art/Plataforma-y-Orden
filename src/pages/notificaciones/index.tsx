import { useState } from "react";
import { Bell, CheckCheck, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NotificationItem } from "@/components/layout/notification-item";
import { useNotifications } from "@/components/layout/notifications-context";

const Notificaciones = () => {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const { items, unread, loading, loadingMore, hasMore, error, refresh, loadMore, markRead, markAllRead } = useNotifications();
  const visible = filter === "unread" ? items.filter(item => !item.read) : items;

  const mark = (id: string) => {
    void markRead(id).catch(err => toast.error(err instanceof Error ? err.message : "No se pudo marcar el aviso."));
  };
  const markAll = () => {
    void markAllRead().catch(err => toast.error(err instanceof Error ? err.message : "No se pudieron actualizar los avisos."));
  };

  return (
    <section className="mx-auto w-full max-w-4xl space-y-5 pb-12">
      <header className="relative overflow-hidden rounded-[23px] border border-primary/20 bg-gradient-to-br from-primary/[.09] via-card to-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><Bell className="size-5" /></span>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-primary">Nexora · Comunicación operativa</p>
              <h1 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Centro de notificaciones</h1>
              <p className="mt-1 text-sm text-muted-foreground">Avisos guardados por usuario, vinculados a traslados y novedades de sedes.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} className="gap-2">
              <RefreshCcw className="size-4" /> Actualizar
            </Button>
            <Button type="button" variant="default" size="sm" onClick={markAll} disabled={unread === 0} className="gap-2">
              <CheckCheck className="size-4" /> Marcar todas leídas
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border bg-card p-1" role="group" aria-label="Filtrar notificaciones">
          <Button size="sm" variant={filter === "all" ? "secondary" : "ghost"} onClick={() => setFilter("all")}>
            Todas
          </Button>
          <Button size="sm" variant={filter === "unread" ? "secondary" : "ghost"} onClick={() => setFilter("unread")}>
            Sin leer {unread > 0 ? "(" + unread + ")" : ""}
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">Los avisos permanecen al cerrar sesión y al cambiar de Next.</span>
      </div>

      {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error} <button type="button" onClick={() => void refresh()} className="ml-1 underline">Reintentar</button>
      </div>}

      <div className="space-y-2.5">
        {loading && items.length === 0 ? <p role="status" className="rounded-xl border bg-card p-10 text-center text-muted-foreground">Consultando notificaciones…</p> : null}
        {!loading && visible.length === 0 && !error ? (
          <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
            <Bell className="mx-auto mb-3 size-9 text-muted-foreground/35" />
            <p className="font-semibold">{filter === "unread" ? "No tienes avisos sin leer" : "Aún no tienes notificaciones"}</p>
            <p className="mt-1 text-sm text-muted-foreground">Los nuevos traslados de tu sede se registrarán automáticamente aquí.</p>
          </div>
        ) : visible.map(item => <NotificationItem key={item.id} item={item}
          onOpen={notice => { if (!notice.read) mark(notice.id); }}
          onRead={mark} />)}
      </div>
      {hasMore ? (
        <Button type="button" variant="outline" className="w-full" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? "Cargando historial…" : "Cargar más notificaciones"}
        </Button>
      ) : items.length > 0 ? <p className="text-center text-xs text-muted-foreground">Fin del historial cargado</p> : null}
    </section>
  );
};

export default Notificaciones;
