import type { Database } from "@/integrations/supabase/types";

export type NexoraNotification = Database["public"]["Tables"]["notifications"]["Row"];

export const notificationDestination = (notification: Pick<NexoraNotification, "transfer_id">): string =>
  notification.transfer_id && /^[a-f0-9-]{36}$/i.test(notification.transfer_id)
    ? `/traslados?transfer=${encodeURIComponent(notification.transfer_id)}`
    : "/traslados";

/**
 * El esquema legacy almacena created_at como timestamp sin zona, en UTC.
 * Interpretarlo en UTC evita cambiar la hora entre equipos en distintas sedes.
 */
export const notificationCreatedDate = (timestamp: string): Date => {
  const normalized = timestamp.replace(" ", "T");
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
    ? normalized : normalized + "Z");
};

export const notificationDateLabel = (timestamp: string): string => {
  const date = notificationCreatedDate(timestamp);
  return Number.isNaN(date.getTime()) ? "Fecha desconocida" :
    new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
};

export const notificationIsImportant = (type: string | null): boolean =>
  type === "transfer_missing" || type === "transfer_cancelled";

export const countUnreadNotifications = (items: readonly Pick<NexoraNotification, "read">[]): number =>
  items.filter((item) => !item.read).length;
