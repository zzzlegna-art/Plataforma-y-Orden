/** Catálogo multisede: aislado del inventario y del backend legacy. */
export type SiteType = "principal" | "bodega" | "local";

export interface NexoraCity {
  id: string;
  name: string;
  region: string | null;
}
export interface NexoraSite {
  id: string;
  cityId: string;
  name: string;
  siteType: SiteType;
  parentSiteId: string | null;
  address: string | null;
  isActive: boolean;
}
export interface SiteDraft {
  name: string;
  cityId: string;
  siteType: SiteType;
  parentSiteId: string | null;
  address?: string;
}

type Row = Record<string, unknown>;
type Response<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
type SingleQuery = { single: () => Response<Row> };
type Table = {
  select: (fields: string) => { order: (field: string) => Response<Row[]> };
  insert: (value: Row) => { select: (fields: string) => SingleQuery };
  update: (value: Row) => {
    eq: (field: string, id: string) => { select: (fields: string) => SingleQuery };
  };
};

/** Carga diferida para no exigir credenciales de Supabase al ejecutar pruebas puras. */
const from = async (name: "nexora_cities" | "nexora_sites"): Promise<Table> => {
  const { supabase } = await import("@/integrations/supabase/client");
  return (supabase as unknown as { from: (table: string) => Table }).from(name);
};

const readCity = (row: Row): NexoraCity => ({
  id: String(row.id),
  name: String(row.name),
  region: typeof row.region === "string" ? row.region : null,
});

const readSite = (row: Row): NexoraSite => ({
  id: String(row.id),
  cityId: String(row.city_id),
  name: String(row.name),
  siteType: row.site_type as SiteType,
  parentSiteId: typeof row.parent_site_id === "string" ? row.parent_site_id : null,
  address: typeof row.address === "string" ? row.address : null,
  isActive: row.is_active === true,
});

const unwrap = <T>(result: { data: T | null; error: { message: string } | null }): T => {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("La operación no devolvió datos.");
  return result.data;
};

export const siteTypeLabel: Record<SiteType, string> = {
  principal: "Sede principal",
  bodega: "Bodega regional",
  local: "Local comercial",
};

export const allowedParents = (
  kind: SiteType,
  cityId: string,
  sites: readonly NexoraSite[],
): NexoraSite[] => sites.filter((site) => {
  if (!site.isActive || kind === "principal") return false;
  if (kind === "bodega") return site.siteType === "principal";
  return (site.siteType === "bodega" || site.siteType === "principal") && site.cityId === cityId;
});

/** Validaciones de comodidad en cliente. Reglas definitivas: trigger y RLS en Postgres. */
export const validateSiteDraft = (
  draft: SiteDraft,
  cities: readonly NexoraCity[],
  sites: readonly NexoraSite[],
): string | null => {
  if (!draft.name.trim() || draft.name.trim().length < 2) return "Escribe un nombre de sede válido.";
  if (!cities.some((city) => city.id === draft.cityId)) return "Selecciona una ciudad existente.";
  if (draft.siteType === "principal") {
    if (draft.parentSiteId) return "La sede principal no puede tener una sede de origen.";
    if (sites.some((site) => site.siteType === "principal"))
      return "La empresa ya tiene una sede principal registrada.";
    return null;
  }
  if (!allowedParents(draft.siteType, draft.cityId, sites).some((site) => site.id === draft.parentSiteId))
    return draft.siteType === "local"
      ? "Selecciona una bodega activa en la misma ciudad."
      : "Selecciona la sede principal como origen de la bodega.";
  return null;
};

export const listNexoraNetwork = async (): Promise<{ cities: NexoraCity[]; sites: NexoraSite[] }> => {
  const [citiesTable, sitesTable] = await Promise.all([from("nexora_cities"), from("nexora_sites")]);
  const [cityResult, siteResult] = await Promise.all([
    citiesTable.select("*").order("name"),
    sitesTable.select("*").order("name"),
  ]);
  return {
    cities: unwrap(cityResult).map(readCity),
    sites: unwrap(siteResult).map(readSite),
  };
};

export const createNexoraCity = async (name: string, region: string): Promise<NexoraCity> => {
  if (name.trim().length < 2) throw new Error("Escribe un nombre de ciudad válido.");
  const table = await from("nexora_cities");
  return readCity(unwrap(await table.insert({
    name: name.trim(), region: region.trim() || null,
  }).select("*").single()));
};

export const createNexoraSite = async (
  draft: SiteDraft,
  cities: readonly NexoraCity[],
  sites: readonly NexoraSite[],
): Promise<NexoraSite> => {
  const invalid = validateSiteDraft(draft, cities, sites);
  if (invalid) throw new Error(invalid);
  const table = await from("nexora_sites");
  return readSite(unwrap(await table.insert({
    name: draft.name.trim(),
    city_id: draft.cityId,
    site_type: draft.siteType,
    parent_site_id: draft.parentSiteId,
    address: draft.address?.trim() || null,
  }).select("*").single()));
};

export const updateNexoraSiteDetails = async (
  siteId: string, name: string, address: string,
): Promise<NexoraSite> => {
  if (name.trim().length < 2) throw new Error("Escribe un nombre de sede válido.");
  const table = await from("nexora_sites");
  return readSite(unwrap(await table.update({
    name: name.trim(), address: address.trim() || null,
  }).eq("id", siteId).select("*").single()));
};
