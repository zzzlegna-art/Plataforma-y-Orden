import type { StaffMember } from "@/lib/nexora-staff-sites";

export type PreparatoryRole = "bodeguero" | "encargado" | "vendedor";
export interface RolePlan {
  userId: string;
  plannedRole: PreparatoryRole;
  operationallyEnabled: boolean;
}

export const rolePlanOptions: { value: PreparatoryRole; label: string }[] = [
  { value: "bodeguero", label: "Bodeguero" },
  { value: "encargado", label: "Encargado" },
  { value: "vendedor", label: "Vendedor" },
];

export const validateRolePlan = (
  user: StaffMember,
  role: string,
): string | null => {
  if (user.role === "admin") return "No se modifica el perfil del Administrador.";
  if (user.role !== "bodeguero" || !user.isActive)
    return "La persona debe tener un perfil operativo anterior y estar activa.";
  if (!rolePlanOptions.some((r) => r.value === role))
    return "Selecciona un perfil permitido.";
  return null;
};

type DbError = { message: string };
type DbResponse<T> = PromiseLike<{ data: T | null; error: DbError | null }>;
type Row = Record<string, unknown>;
type Table = {
  select: (columns: string) => { order: (col: string) => DbResponse<Row[]> };
  upsert: (row: Row, options: { onConflict: string }) =>
    { select: (columns: string) => { single: () => DbResponse<Row> } };
};
const getTable = async (): Promise<Table> => {
  const { supabase } = await import("@/integrations/supabase/client");
  return (supabase as unknown as { from: (name: string) => Table })
    .from("nexora_staff_role_plans");
};
const parsePlan = (row: Row): RolePlan => {
  if (!rolePlanOptions.some((r) => r.value === row.planned_role) ||
      typeof row.operationally_enabled !== "boolean")
    throw new Error("El servidor devolvió un estado de rol inválido.");
  return {
    userId: String(row.user_id),
    plannedRole: row.planned_role as PreparatoryRole,
    operationallyEnabled: row.operationally_enabled as boolean,
  };
};
export const listRolePlans = async (): Promise<RolePlan[]> => {
  const table = await getTable();
  const result = await table.select("user_id,planned_role,operationally_enabled").order("created_at");
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("No se recibieron perfiles preparados.");
  return result.data.map(parsePlan);
};
export const saveRolePlan = async (
  user: StaffMember, role: PreparatoryRole,
): Promise<RolePlan> => {
  const issue = validateRolePlan(user,role);
  if (issue) throw new Error(issue);
  const table = await getTable();
  const result = await table.upsert({
    user_id: user.id,
    planned_role: role,
  }, { onConflict: "user_id" }).select("user_id,planned_role,operationally_enabled").single();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("El servidor no confirmó la preparación.");
  return parsePlan(result.data);
};
