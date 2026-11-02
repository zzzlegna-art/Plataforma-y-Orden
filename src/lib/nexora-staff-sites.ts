/**
 * Nexora Multisede: asignaciones administrativas, separadas del permiso legacy.
 * El vínculo NO cambia roles, RLS operativa ni ubicación física de los IMEI.
 */
import type { NexoraSite } from "./nexora-sites";

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

export interface StaffSiteAssignment {
  id: string;
  userId: string;
  siteId: string;
  isActive: boolean;
  createdAt: string;
}

export const canAssignStaffToSite = (
  userId: string,
  siteId: string,
  users: readonly StaffMember[],
  sites: readonly NexoraSite[],
  assignments: readonly StaffSiteAssignment[],
): string | null => {
  if (!users.some((user) => user.id === userId && user.isActive))
    return "Selecciona un empleado activo.";
  if (!sites.some((site) => site.id === siteId && site.isActive))
    return "Selecciona una sede activa.";
  if (assignments.some((record) => record.userId === userId && record.siteId === siteId)) {
    return "Ese empleado ya tiene un vínculo con la sede. Si está inactivo, reactívalo desde la lista.";
  }
  return null;
};

type Row = Record<string, unknown>;
type ErrorResult = { message: string };
type QueryResult<T> = PromiseLike<{ data: T | null; error: ErrorResult | null }>;
type SelectQuery = { order: (col: string) => QueryResult<Row[]> };
type SingleQuery = { single: () => QueryResult<Row> };
type DatabaseTable = {
  select: (fields: string) => SelectQuery;
  insert: (row: Row) => { select: (fields: string) => SingleQuery };
  update: (row: Row) => { eq: (col: string, id: string) => { select: (fields: string) => SingleQuery } };
};

const from = async (tableName: "bodega_profiles" | "nexora_staff_sites"): Promise<DatabaseTable> => {
  const { supabase } = await import("@/integrations/supabase/client");
  return (supabase as unknown as { from: (name: string) => DatabaseTable }).from(tableName);
};

const unwrap = <T>(result: { data: T | null; error: ErrorResult | null }): T => {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("El servidor no devolvió el registro solicitado.");
  return result.data;
};

const readStaff = (row: Row): StaffMember => ({
  id: String(row.id),
  name: typeof row.full_name === "string" && row.full_name.trim()
    ? row.full_name.trim() : String(row.email),
  email: String(row.email),
  role: String(row.role),
  isActive: row.is_active === true,
});

const readAssignment = (row: Row): StaffSiteAssignment => ({
  id: String(row.id),
  userId: String(row.user_id),
  siteId: String(row.site_id),
  isActive: row.is_active === true,
  createdAt: String(row.created_at),
});

export const listStaffSiteAssignments = async (): Promise<{
  users: StaffMember[];
  assignments: StaffSiteAssignment[];
}> => {
  const [staffTable, relationTable] = await Promise.all([
    from("bodega_profiles"), from("nexora_staff_sites"),
  ]);
  const [staff, relations] = await Promise.all([
    staffTable.select("id,email,full_name,role,is_active").order("email"),
    relationTable.select("id,user_id,site_id,is_active,created_at").order("created_at"),
  ]);
  return {
    users: unwrap(staff).map(readStaff),
    assignments: unwrap(relations).map(readAssignment),
  };
};

export const createStaffSiteAssignment = async (
  userId: string, siteId: string,
  users: readonly StaffMember[],
  sites: readonly NexoraSite[],
  assignments: readonly StaffSiteAssignment[],
): Promise<StaffSiteAssignment> => {
  const problem = canAssignStaffToSite(userId, siteId, users, sites, assignments);
  if (problem) throw new Error(problem);
  const table = await from("nexora_staff_sites");
  return readAssignment(unwrap(await table.insert({
    user_id: userId, site_id: siteId, is_active: true,
  }).select("*").single()));
};

export const setStaffSiteActive = async (
  assignmentId: string,
  isActive: boolean,
): Promise<StaffSiteAssignment> => {
  const table = await from("nexora_staff_sites");
  return readAssignment(unwrap(await table.update({
    is_active: isActive,
  }).eq("id", assignmentId).select("*").single()));
};

/**
 * Cuenta las unidades físicas con estado legacy de existencia sin atribuirlas
 * a una sede nueva. Los equipos vendidos/entregados quedan excluidos.
 * Supabase PostgREST devuelve sólo el conteo; nunca descargamos IMEI.
 */
export const countLegacyInventoryToReconcile = async (): Promise<number> => {
  const { supabase } = await import("@/integrations/supabase/client");
  const { count, error } = await supabase.from("bodega_units")
    .select("id", { head: true, count: "exact" })
    .in("status", ["en_bodega", "en_local", "en_transito", "en_reparacion", "defectuoso"]);
  if (error) throw new Error(error.message);
  if (count === null) throw new Error("No se pudo verificar el conteo anterior.");
  return count;
};
