import type { Product } from "./types";

type ProductReference = Pick<Product, "name" | "imageUrl">;

const normalizeReference = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");

const normalizeWords = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\\s+/)
    .filter(Boolean);

const STORAGE_UNITS = new Set(["gb", "tb", "mb"]);
const NON_MODEL_VARIANTS = new Set([
  "new", "nuevo", "nueva", "seminuevo", "seminueva", "usado", "usada",
  "used", "openbox", "mmm",
  "negro", "negra", "black", "midnight", "graphite", "grafito",
  "blanco", "blanca", "white", "starlight", "plata", "plateado", "plateada",
  "silver", "gris", "gray", "grey", "natural", "titanio", "titanium",
  "desert", "deserttitanium", "azul", "blue", "rosa", "pink", "purple",
  "morado", "morado", "verde", "green", "amarillo", "yellow", "rojo", "red",
  "naranja", "orange", "beige", "lavender", "lila",
]);

const normalizeReferenceWithoutBrand = (value: string) =>
  normalizeReference(value).replace(/^apple/, "");

/**
 * Identifica el modelo del catálogo sin incluir la capacidad, el color o la
 * condición que suelen añadirse en las referencias de Excel. No elimina rasgos
 * del modelo (por ejemplo, "Pro Max"), para evitar mezclar equipos diferentes.
 */
const normalizeModelReference = (value: string) => {
  const words = normalizeWords(value);
  if (words[0] === "apple") words.shift();

  const modelWords: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];

    if (/^\\d+(?:gb|tb|mb)$/.test(word)) continue;
    if (/^\\d+$/.test(word) && STORAGE_UNITS.has(words[index + 1] ?? "")) {
      index += 1;
      continue;
    }
    if (NON_MODEL_VARIANTS.has(word)) continue;

    modelWords.push(word === "series" ? "serie" : word);
  }

  return modelWords.join("");
};

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
