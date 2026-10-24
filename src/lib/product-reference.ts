import type { Product } from "./types";

type ProductReference = Pick<Product, "name" | "imageUrl">;

const normalizeReference = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");

const normalizeWords = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const STORAGE_UNITS = new Set(["gb", "tb", "mb", "ta"]);
const STORAGE_SIZES = new Set(["64", "128", "256", "512", "1024"]);
const NON_MODEL_VARIANTS = new Set([
  "de", "new", "nuevo", "nueva", "nuevos", "nuevas", "seminuevo", "seminueva",
  "usado", "usada", "usados", "usadas", "used", "openbox", "mmm",
  "negro", "negra", "black", "midnight", "graphite", "grafito",
  "blanco", "blanca", "white", "starlight", "plata", "plateado", "plateada",
  "silver", "gris", "gray", "grey", "natural", "titanio", "titanium",
  "desert", "deserttitanium", "azul", "blue", "rosa", "pink", "purple",
  "morado", "verde", "green", "amarillo", "yellow", "rojo", "red",
  "naranja", "orange", "beige", "lavender", "lila",
]);

const MODEL_WORD_ALIASES: Record<string, string> = {
  series: "serie",
  wacth: "watch",
  wathc: "watch",
  ipone: "iphone",
  iphnoe: "iphone",
  pr: "pro",
};

const normalizeReferenceWithoutBrand = (value: string) =>
  normalizeReference(value).replace(/^apple/, "");

/**
 * Compara el modelo real del inventario sin la capacidad, el color o la condición
 * que a veces se añaden en las referencias de Excel. También tolera abreviaturas
 * habituales ("13 de 128") y erratas pequeñas ("Wacth") sin borrar rasgos del modelo
 * como "Pro Max" o el tamaño de un Apple Watch.
 */
const normalizeModelReference = (value: string) => {
  const words = normalizeWords(value).map((word) => MODEL_WORD_ALIASES[word] ?? word);
  if (words[0] === "apple") words.shift();

  // En los Excel antiguos, referencias como "13 de 128" se refieren a un iPhone.
  if (/^(11|12|13|14|15|16|17|18)$/.test(words[0] ?? "")) {
    words.unshift("iphone");
  }

  const modelWords: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];

    if (/^\d+(?:gb|tb|mb|ta)$/.test(word)) continue;
    if (/^\d+$/.test(word) && STORAGE_UNITS.has(words[index + 1] ?? "")) {
      index += 1;
      continue;
    }
    // Capacidad sin unidad: solo se descarta después de haber identificado el número del modelo.
    if (STORAGE_SIZES.has(word) && modelWords.length > 1) continue;
    if (NON_MODEL_VARIANTS.has(word)) continue;

    modelWords.push(word);
  }

  return modelWords.join("");
};

export const findProductForReference = (
  products: readonly ProductReference[],
  reference?: string | null,
): ProductReference | undefined => {
  if (!reference?.trim()) return undefined;

  // Primero intenta la referencia completa para respetar la capacidad exacta si existe.
  const normalized = normalizeReferenceWithoutBrand(reference);
  const exactMatches = products.filter((product) => normalizeReferenceWithoutBrand(product.name) === normalized);
  const exactWithImage = exactMatches.find((product) => Boolean(product.imageUrl?.trim()));
  if (exactWithImage) return exactWithImage;

  const normalizedModel = normalizeModelReference(reference);
  // Evita emparejar referencias vacías o demasiado cortas con cualquier producto.
  if (normalizedModel.length < 4) return exactMatches[0];

  const modelMatches = products.filter(
    (product) => normalizeModelReference(product.name) === normalizedModel,
  );
  const modelWithImage = modelMatches.find((product) => Boolean(product.imageUrl?.trim()));

  return modelWithImage ?? modelMatches[0] ?? exactMatches[0];
};
