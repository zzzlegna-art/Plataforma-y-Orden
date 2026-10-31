import type { ProductColorVariant } from "./types";

/** Compara precios guardados por nombre, independientemente del orden JSON. */
const colorKey = (value: string) => value.trim().toLocaleLowerCase("es");

export const preciosPorColorSinConfigurar = (
  variants: readonly ProductColorVariant[],
): string[] => variants.filter((variant) => !Number.isFinite(variant.price) || variant.price <= 0)
  .map((variant) => variant.color.trim());

/** Confirma que Supabase conserva exactamente los importes que acaba de enviar el editor. */
export const verificarPreciosPorColor = (
  esperados: readonly ProductColorVariant[],
  remotos: unknown,
): boolean => {
  if (!Array.isArray(remotos) || remotos.length !== esperados.length) return false;
  const index = new Map<string, { cost: number; price: number }>();
  for (const raw of remotos) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const row = raw as Record<string, unknown>;
    if (typeof row.color !== "string" ||
        typeof row.cost !== "number" || !Number.isFinite(row.cost) ||
        typeof row.price !== "number" || !Number.isFinite(row.price)) return false;
    const key = colorKey(row.color);
    if (index.has(key)) return false;
    index.set(key, { cost: row.cost, price: row.price });
  }
  return esperados.every((entry) => {
    const saved = index.get(colorKey(entry.color));
    return saved !== undefined && saved.cost === entry.cost && saved.price === entry.price;
  });
};
