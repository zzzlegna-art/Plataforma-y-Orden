/** Nexora Multisede · catálogo controlado por RLS (administrador escribe, personal consulta).
 * Ninguna operación en este archivo mueve IMEI ni modifica existencias.
 */
import type { Tables } from "@/integrations/supabase/types";

export type SiteKind = "principal" | "bodega" | "local";
export type NexoraCity = Tables<"nexora_cities">;
export type NexoraSite = Tables<"nexora_sites">;

export interface CreateCityInput {
  name: string;
  code: string;
  department?: string;
}
export interface CreateSiteInput {
  name: string;
  code: string;
  cityId: string;
  kind: SiteKind;
  parentWarehouseId?: string;
  address?: string;
}

const getClient = async () => (await import("@/integrations/supabase/client")).supabase;

export const normalizeSiteCode = (value: string) => value.trim().toUpperCase();

export const validateSiteCode = (value: string, max = 24) =>
  new RegExp(`^[A-Z0-9][A-Z0-9_-]{1,${max - 1}}$`).test(normalizeSiteCode(value));

export const validateSiteName = (value: string) =>
  value.trim().length >= 2 && value.trim().length <= 100;

export const listCities = async (): Promise<NexoraCity[]> => {
  const client = await getClient();
  const { data, error } = await client.from("nexora_cities").select("*").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
};

export const listSites = async (): Promise<NexoraSite[]> => {
  const client = await getClient();
  const { data, error } = await client.from("nexora_sites").select("*").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
};

export const createCity = async (input: CreateCityInput): Promise<NexoraCity> => {
  if (!validateSiteName(input.name)) throw new Error("Escribe un nombre de ciudad válido.");
  if (!validateSiteCode(input.code, 20)) throw new Error("Código de ciudad inválido (2 a 20 caracteres).");
  const client = await getClient();
  const { data, error } = await client.from("nexora_cities")
    .insert({
      name: input.name.trim(),
      code: normalizeSiteCode(input.code),
      department: input.department?.trim() || null,
    })
    .select("*").single();
  if (error) throw new Error(error.message);
  return data;
};

export const createSite = async (input: CreateSiteInput): Promise<NexoraSite> => {
  if (!validateSiteName(input.name)) throw new Error("Escribe un nombre de sede válido.");
  if (!validateSiteCode(input.code)) throw new Error("Código de sede inválido (2 a 24 caracteres).");
  if (!input.cityId) throw new Error("Selecciona una ciudad.");
  if (!["principal", "bodega", "local"].includes(input.kind)) throw new Error("Tipo de sede inválido.");
  if (input.kind === "local" && !input.parentWarehouseId) {
    throw new Error("Selecciona la bodega que abastece el local.");
  }
  const client = await getClient();
  const { data, error } = await client.from("nexora_sites")
    .insert({
      name: input.name.trim(),
      code: normalizeSiteCode(input.code),
      city_id: input.cityId,
      kind: input.kind,
      parent_warehouse_id: input.kind === "local" ? input.parentWarehouseId : null,
      address: input.address?.trim() || null,
    })
    .select("*").single();
  if (error) throw new Error(error.message);
  return data;
};
