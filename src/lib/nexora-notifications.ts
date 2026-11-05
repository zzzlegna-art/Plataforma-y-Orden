import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/** Avisos permanentes de Nexora. La RLS del servidor decide el destinatario. */
export type NexoraNotification = Tables<"notifications">;
export const NOTIFICATION_PAGE_SIZE = 30;

export const notificationHref = (item: Pick<NexoraNotification, "transfer_id">): string =>
  item.transfer_id ? "/traslados?transfer=" + encodeURIComponent(item.transfer_id) : "/notificaciones";

export const notificationTimestamp = (value: string): Date => {
  // "notifications.created_at" es TIMESTAMP legacy que almacenamos en UTC.
  const normalized = value.replace(" ", "T");
  return new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + "Z");
};

export const formatNotificationDate = (value: string): string => {
  const date = notificationTimestamp(value);
  return Number.isNaN(date.getTime())
    ? "Fecha no disponible"
    : new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
};

export const notificationIsUrgent = (item: Pick<NexoraNotification, "type">): boolean =>
  item.type === "transfer_missing";

export const listNotifications = async (userId: string, offset = 0, limit = NOTIFICATION_PAGE_SIZE):
  Promise<NexoraNotification[]> => {
  const { data, error } = await supabase.from("notifications")
    .select("id,user_id,title,message,type,read,created_at,site_id,transfer_id,source_event_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error("No se pudo consultar el centro de notificaciones: " + error.message);
  return data ?? [];
};

export const getUnreadNotificationCount = async (userId: string): Promise<number> => {
  const { count, error } = await supabase.from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("read", false);
  if (error) throw new Error("No se pudo consultar el contador de notificaciones: " + error.message);
  return count ?? 0;
};

export const markNotificationRead = async (userId: string, notificationId: string): Promise<void> => {
  // La única columna que authenticated puede modificar es "read".
  const { data, error } = await supabase.from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("id", notificationId)
    .select("id");
  if (error) throw new Error("No se pudo marcar la notificación como leída: " + error.message);
  if (!data?.length) throw new Error("No tienes acceso a esa notificación.");
};

export const markAllNotificationsRead = async (userId: string): Promise<void> => {
  const { error } = await supabase.from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw new Error("No se pudieron marcar las notificaciones: " + error.message);
};
