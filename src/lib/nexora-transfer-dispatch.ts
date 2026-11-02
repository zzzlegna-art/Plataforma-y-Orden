/**
 * Selección del inventario físico de origen para un nuevo traslado.
 * Lectura estricta del stock conciliado por sede. El RPC vuelve a validar
 * toda ruta y cada IMEI antes de actualizar existencias.
 */
import { listCities, listSites, type NexoraCity, type NexoraSite } from "./nexora-sites";

export interface DispatchProduct { id: string; name: string; sku: string; is_active: boolean }
export interface DispatchSerial {
  id: string;
  serial: string;
  product_id: string;
  color: string | null;
}
export type DispatchSite = NexoraSite;
export interface DispatchCatalog {
  sites: NexoraSite[];
  cities: NexoraCity[];
  products: DispatchProduct[];
}

type ReadResponse = { data: unknown; error: { message: string; code?: string | null } | null };
interface Query extends PromiseLike<ReadResponse> {
  eq(field: string, value: string): Query;
  order(field: string, args?: { ascending: boolean }): Query;
  range(from: number, to: number): Query;
}
export interface DispatchReadClient { from(table: string): { select(columns: string): Query } }

const client = async (): Promise<DispatchReadClient> =>
  (await import("@/integrations/supabase/client")).supabase as unknown as DispatchReadClient;

const checked = async (query: PromiseLike<ReadResponse>, label: string): Promise<unknown[]> => {
  let result: ReadResponse;
  try { result = await query; }
  catch { throw new Error(`Sin conexión. No se pudo consultar ${label}.`); }
  if (result.error) {
    if (["PGRST205", "42P01", "42703"].includes(result.error.code ?? "")) {
      throw new Error("La red multisede todavía no está habilitada en el servidor.");
    }
    throw new Error(result.error.message);
  }
  if (!Array.isArray(result.data)) {
    throw new Error(`La respuesta de ${label} está incompleta.`);
  }
  return result.data;
};

export const loadDispatchCatalog = async (
  override?: DispatchReadClient,
): Promise<DispatchCatalog> => {
  const api = override ?? await client();
  const [sites, cities, products] = await Promise.all([
    override ? checked(api.from("nexora_sites").select("*").order("name"), "sedes") : listSites(),
    override ? checked(api.from("nexora_cities").select("*").order("name"), "ciudades") : listCities(),
    checked(api.from("bodega_products").select("id,name,sku,is_active").order("name"), "referencias"),
  ]);
  return {
    sites: (sites as NexoraSite[]).filter(site => site.is_active),
    cities: cities as NexoraCity[],
    products: (products as DispatchProduct[]).filter(row => !!row.id && !!row.name),
  };
};

export const loadDispatchSerials = async (
  origin: NexoraSite,
  productId: string,
  override?: DispatchReadClient,
): Promise<DispatchSerial[]> => {
  if (!origin?.id || !origin.is_active || !productId.trim()) {
    throw new Error("Selecciona un origen activo y una referencia.");
  }
  const status = origin.kind === "local" ? "en_local" : "en_bodega";
  const api = override ?? await client();
  const pageSize = 300;
  const maxLoaded = 6000;
  const results: DispatchSerial[] = [];
  for (let offset = 0; offset <= maxLoaded; offset += pageSize) {
    const rows = await checked(api.from("bodega_units")
      .select("id,serial,product_id,color")
      .eq("site_id", origin.id)
      .eq("product_id", productId)
      .eq("status", status)
      .order("serial")
      .range(offset,offset+pageSize-1), "IMEI disponibles");
    if (offset === maxLoaded && rows.length) {
      throw new Error("La referencia supera 6.000 IMEI. Usa una búsqueda específica antes de despachar.");
    }
    for (const row of rows as DispatchSerial[]) {
      if (!row.id || !row.serial || row.product_id !== productId) {
        throw new Error("La respuesta del inventario contiene un IMEI inválido.");
      }
      results.push(row);
    }
    if (rows.length < pageSize) break;
  }
  if (new Set(results.map(row => row.id)).size !== results.length
    || new Set(results.map(row => row.serial.trim().toUpperCase())).size !== results.length) {
    throw new Error("El inventario devolvió seriales duplicados. No es seguro despacharlos.");
  }
  return results;
};

export const groupDispatchSelection = (
  selected: readonly DispatchSerial[], products: readonly DispatchProduct[],
): { productId: string; reference: string; quantity: number }[] => {
  const names = new Map(products.map(p => [p.id,`${p.name} · ${p.sku}`]));
  const groups = new Map<string,number>();
  for(const unit of selected) groups.set(unit.product_id,(groups.get(unit.product_id)??0)+1);
  return [...groups.entries()].map(([productId,quantity]) => ({
    productId, reference:names.get(productId)??"Referencia sin identificar",quantity,
  })).sort((a,b) => a.reference.localeCompare(b.reference,"es"));
};
