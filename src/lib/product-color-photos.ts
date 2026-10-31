import type { ProductColorVariant } from "./types";

const PALETTE: Record<string, string> = {
  blanco: "#ffffff", white: "#ffffff", marfil: "#fff8e7", crema: "#f3e6d2",
  negro: "#182131", black: "#182131", grafito: "#404954", gris: "#929aa6",
  plata: "#c8d0d9", plateado: "#c8d0d9", silver: "#c8d0d9",
  azul: "#2474d4", blue: "#2474d4", "azul oscuro": "#173d79",
  "azul claro": "#80bfff", "azul titanio": "#527a9a", "azul profundo": "#17456a",
  rojo: "#d83d4e", red: "#d83d4e", borgona: "#752b4a", vino: "#752b4a",
  granate: "#752b4a", "rojo oscuro": "#922d42",
  rosa: "#e8a1b7", rosado: "#e8a1b7", rosé: "#e8a1b7", morado: "#8664bf",
  purpura: "#8664bf", violeta: "#8664bf", lavanda: "#baa9e5",
  verde: "#3e9276", green: "#3e9276", "verde oscuro": "#235c4f",
  amarillo: "#efc552", yellow: "#efc552", dorado: "#c5a05d",
  oro: "#c5a05d", gold: "#c5a05d", naranja: "#ea8d4a",
  natural: "#b9ada2", titanio: "#a9a4a0", "titanio natural": "#b9ada2",
  cafe: "#8a5c42", marron: "#8a5c42", chocolate: "#75503b",
};

export const normalizeColorName = (name: string): string => name.trim()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, " ").toLocaleLowerCase("es");

/** Never imply the actual device picture has been recolored. Only renders swatches. */
export const swatchForVariant = (variant: Pick<ProductColorVariant, "color" | "swatchHex">): string => {
  if (variant.swatchHex && /^#[a-f\d]{6}$/i.test(variant.swatchHex)) return variant.swatchHex;
  const key = normalizeColorName(variant.color);
  if (PALETTE[key]) return PALETTE[key];
  for (const word of key.split(/[\s/-]+/)) if (PALETTE[word]) return PALETTE[word];
  return "#8796a8";
};

/** If a variant has no separate photograph, continue showing the exact main image. */
export const imageForVariant = (base: string | undefined, variant?: Pick<ProductColorVariant, "imageUrl">): string | undefined =>
  variant?.imageUrl?.trim() || base;

export const verifyVariantPhotoUrls = (
  expected: readonly ProductColorVariant[],
  actual: unknown,
): boolean => {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const rows = new Map<string, { imageUrl?: string; swatchHex?: string }>();
  for (const v of actual) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    const row = v as Record<string, unknown>;
    if (typeof row.color !== "string") return false;
    const name = normalizeColorName(row.color);
    if (rows.has(name)) return false;
    rows.set(name, {
      imageUrl: typeof row.imageUrl === "string" ? row.imageUrl : undefined,
      swatchHex: typeof row.swatchHex === "string" ? row.swatchHex : undefined,
    });
  }
  return expected.every((v) => {
    const saved = rows.get(normalizeColorName(v.color));
    return Boolean(saved) &&
      (saved?.imageUrl ?? "") === (v.imageUrl ?? "") &&
      (saved?.swatchHex ?? "") === (v.swatchHex ?? "");
  });
};
