/**
 * Normaliza textos del catálogo tanto al guardarlos como al exportarlos.
 * Corrige palabras cuyas letras llegaron separadas, espacios Unicode e invisibles de formato,
 * sin modificar los espacios normales entre palabras.
 */
const CATALOG_SPACED_WORDS = [
  "almacenamiento", "adaptador", "angular", "Apple", "Bluetooth", "batería", "cámara",
  "cámaras", "capacidad", "Cellular", "celular", "compatibilidad", "compatible", "cambiar",
  "conectividad", "conector", "conexión", "conexiones", "con", "CPU", "devolución",
  "de", "del", "desde", "diseño", "Dual", "eSIM", "en", "Engine", "estéreo", "frontal", "frecuencia",
  "G", "generación", "GPU", "GPS", "grabación", "gran", "hasta", "inalámbrica", "inalámbrico", "LTE", "OLED",
  "incluye", "iPad", "iPhone", "la", "las", "Lightning", "los", "más", "memoria",
  "micrófono", "menos", "MP", "nano", "NFC", "Neural", "no", "núcleos", "o", "operativo", "puede", "RAM", "regional", "ROM", "SIM",
  "pantalla", "para", "Pencil", "por", "procesador", "puerto", "rápida", "red",
  "resistencia", "resolución", "sensor", "sin", "sistema", "solo", "soporta", "su",
  "región", "según", "sus", "trasera", "ultra", "USB", "variante", "versión", "video", "Wi-Fi", "y", "a",
].map((word) => ({
  word,
  key: word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, ""),
})).sort((a, b) => b.key.length - a.key.length);

const CATALOG_SPACED_PHRASES: Record<string, string> = {
  applepencil: "Apple Pencil",
  usbc: "USB-C",
  wifi: "Wi-Fi",
  wifipluscellular: "Wi-Fi + Cellular",
};

const normalizeCatalogCharacters = (value: string): string =>
  value
    .normalize("NFC")
    // Retira caracteres invisibles de formato y unifica espacios Unicode que llegan al pegar datos.
    .replace(/[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFE0E\uFE0F\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, " ");

const splitSpacedCatalogLetters = (value: string): string => {
  const compact = normalizeCatalogCharacters(value).replace(/\s+/g, "");
  const key = compact.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return value;
  if (CATALOG_SPACED_PHRASES[key]) return CATALOG_SPACED_PHRASES[key];

  const memo = new Map<number, string[] | null>();
  const segment = (index: number): string[] | null => {
    if (index === key.length) return [];
    if (memo.has(index)) return memo.get(index) ?? null;

    for (const candidate of CATALOG_SPACED_WORDS) {
      if (!key.startsWith(candidate.key, index)) continue;
      const rest = segment(index + candidate.key.length);
      if (rest) {
        const result = [candidate.word, ...rest];
        memo.set(index, result);
        return result;
      }
    }

    memo.set(index, null);
    return null;
  };

  const words = segment(0);
  if (words) {
    const result = words.join(" ");
    return compact[0] && compact[0] === compact[0].toLocaleUpperCase() && compact[0] !== compact[0].toLocaleLowerCase()
      ? result[0].toLocaleUpperCase() + result.slice(1)
      : result;
  }

  // Último recurso: elimina el espaciado artificial sin alterar el resto del contenido.
  return compact.replace(/([a-záéíóúüñ])([A-ZÁÉÍÓÚÜÑ])/g, "$1 $2");
};

export const normalizeCatalogText = (value: string): string =>
  normalizeCatalogCharacters(value)
    .replace(/(^|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9])((?:[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]\s+){2,}[A-Za-zÁÉÍÓÚÜÑáéíóúüñ])(?=$|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9])/g, (_match, prefix: string, spaced: string) => prefix + splitSpacedCatalogLetters(spaced))
    .replace(/\b(\d+)\s+a(?=\s+generaci[oó]n\b)/gi, "$1a")
    .replace(/(\d)\s*\.\s*(?=\d)/g, "$1.")
    .replace(/(\d)\s+([A-Z])\b/g, "$1$2")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+([,;:])/g, "$1")
    .replace(/([,;:])(?=\S)/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
