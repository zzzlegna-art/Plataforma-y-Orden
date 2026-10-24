/**
 * Búsqueda flexible del catálogo: cada término puede coincidir con cualquier campo
 * indexable del producto, sin distinguir mayúsculas ni tildes.
 */
export const normalizarBusquedaInventario = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim()
    .replace(/\s+/g, " ");

export const coincideBusquedaInventario = (
  query: string,
  fields: readonly (string | null | undefined)[],
): boolean => {
  const normalizedQuery = normalizarBusquedaInventario(query);
  if (!normalizedQuery) return true;

  const terms = normalizedQuery.split(" ").filter(Boolean);
  const searchableFields = fields
    .filter((field): field is string => typeof field === "string" && field.trim().length > 0)
    .map(normalizarBusquedaInventario);

  // Permite consultas compuestas como "Apple iPhone 16", aunque cada término
  // se encuentre en un campo diferente (marca y nombre, por ejemplo).
  return terms.every((term) => searchableFields.some((field) => field.includes(term)));
};
