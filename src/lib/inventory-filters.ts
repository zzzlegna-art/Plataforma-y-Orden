export type InventoryCondition = "" | "nuevo" | "seminuevo";

export type InventoryFilterKey =
  | "q"
  | "tipo"
  | "marca"
  | "bajo"
  | "inactivos"
  | "condicion";

export interface InventoryFilters {
  search: string;
  tipo: string;
  brandId: string;
  lowOnly: boolean;
  includeInactive: boolean;
  condicion: InventoryCondition;
}

const INVENTORY_FILTER_KEYS: readonly InventoryFilterKey[] = [
  "q",
  "tipo",
  "marca",
  "bajo",
  "inactivos",
  "condicion",
];

/** Lee los filtros del catálogo desde la URL para conservarlos al recargar o abrir una ficha. */
export const getInventoryFilters = (params: URLSearchParams): InventoryFilters => {
  const condicion = params.get("condicion");
  return {
    search: params.get("q") ?? "",
    tipo: params.get("tipo") ?? "",
    brandId: params.get("marca") ?? "",
    lowOnly: params.get("bajo") === "1",
    includeInactive: params.get("inactivos") === "1",
    condicion: condicion === "nuevo" || condicion === "seminuevo" ? condicion : "",
  };
};

/** Actualiza un filtro sin borrar el resto de la URL ni acumular estados obsoletos. */
export const updateInventoryFilter = (
  params: URLSearchParams,
  key: InventoryFilterKey,
  value: string | boolean,
): URLSearchParams => {
  const next = new URLSearchParams(params);
  const normalized = typeof value === "boolean" ? (value ? "1" : "") : value.trim() ? value : "";
  if (normalized) next.set(key, normalized);
  else next.delete(key);
  return next;
};

/** Limpia únicamente los filtros del catálogo y conserva cualquier otro parámetro de la ruta. */
export const clearInventoryFilters = (params: URLSearchParams): URLSearchParams => {
  const next = new URLSearchParams(params);
  INVENTORY_FILTER_KEYS.forEach((key) => next.delete(key));
  return next;
};
