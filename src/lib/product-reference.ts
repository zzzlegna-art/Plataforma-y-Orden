import type { Product } from "./types";

type ProductReference = Pick<Product, "name" | "imageUrl">;

const normalizeReference = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Normaliza el modelo sin la marca Apple al inicio ni la capacidad de almacenamiento.
 * Las ventas antiguas suelen indicar, por ejemplo, 256 GB mientras el catálogo solo
 * tiene la misma referencia fotografiada en 128 GB. La capacidad no cambia la foto.
 */
const normalizeReferenceWithoutBrand = (value: string) =>
  normalizeReference(value).replace(/^apple/, "");

const normalizeModelReference = (value: string) =>
  normalizeReferenceWithoutBrand(value).replace(/\d+(?:gb|tb|mb)/g, "");

export const findProductForReference = (
  products: readonly ProductReference[],
  reference?: string | null,
): ProductReference | undefined => {
  if (!reference?.trim()) return undefined;

  // Quita "Apple" para comparar marcas escritas o no en la referencia, pero conserva
  // la capacidad en esta primera búsqueda para elegir el modelo exacto cuando exista.
  const normalized = normalizeReferenceWithoutBrand(reference);
  const exactMatches = products.filter((product) => normalizeReferenceWithoutBrand(product.name) === normalized);
  const exactWithImage = exactMatches.find((product) => Boolean(product.imageUrl?.trim()));
  if (exactWithImage) return exactWithImage;

  const normalizedModel = normalizeModelReference(reference);
  if (!normalizedModel) return exactMatches[0];

  const modelMatches = products.filter(
    (product) => normalizeModelReference(product.name) === normalizedModel,
  );
  // Si el nombre exacto no tiene foto, reutiliza la foto de otra capacidad del mismo modelo.
  const modelWithImage = modelMatches.find((product) => Boolean(product.imageUrl?.trim()));

  return modelWithImage ?? modelMatches[0] ?? exactMatches[0];
};
