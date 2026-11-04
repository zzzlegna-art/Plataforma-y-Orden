import { getWorkerSession } from "./nexora-worker";
import type { MultisiteRole } from "./nexora-role-policy";
import type { NexoraSite } from "./nexora-sites";

/** Sedes donde el usuario puede INICIAR un envío o confirmar una llegada.
 * Admin: global. Bodeguero: vínculos activos. Trabajador: su único local.
 * Los IDs visibles no son prueba de autorización; la RPC comprueba la sede.
 */
export const getTransferAssignedSites = async (
  role: MultisiteRole | undefined,
  userId: string | undefined,
  sites: readonly NexoraSite[],
): Promise<string[]> => {
  if (!userId || !role) return [];
  if (role === "admin") return sites.filter((site) => site.isActive).map((site) => site.id);
  if (role === "encargado" || role === "vendedor") {
    const session = await getWorkerSession();
    return session && session.role === role &&
      sites.some((site) => site.id === session.siteId && site.isActive && site.siteType === "local")
      ? [session.siteId] : [];
  }
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.from("nexora_staff_sites")
    .select("site_id").eq("user_id", userId).eq("is_active", true);
  if (error) throw new Error("No se pudo comprobar tu sede asignada: " + error.message);
  const active = new Set(sites.filter((site) => site.isActive).map((site) => site.id));
  return (data ?? []).map((row) => row.site_id).filter((id) => active.has(id));
};

/** Booleano sin exponer inventario/costos ni detalles del acta administrativa. */
export const getTransferOperationReady = async (): Promise<boolean> => {
  const { supabase } = await import("@/integrations/supabase/client");
  const response = await (supabase as unknown as {
    rpc: (name: string) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("nexora_transfer_ready");
  if (response.error) throw new Error(response.error.message);
  if (typeof response.data !== "boolean")
    throw new Error("No se pudo verificar si el inventario permite traslados.");
  return response.data;
};
