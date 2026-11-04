import { inventoryProductPhoto } from "./product-color-photos";

export interface CatalogColorPhoto {
  color: string;
  imageUrl: string | null;
  swatchHex: string | null;
}
export interface CatalogMedia {
  categoryKey: string | null;
  imageUrl: string | null;
  colorVariants: CatalogColorPhoto[];
}

const optionalText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("La información visual del catálogo es inválida.");
  return value.trim() || null;
};

/** Solo metadatos de visualización; nunca precios/costos de variantes ni permisos. */
export const parseCatalogMedia = (record: Record<string, unknown>): CatalogMedia => {
  const raw = record.colorVariants ?? [];
  if (!Array.isArray(raw) || raw.length > 60)
    throw new Error("Las fotografías de colores del catálogo son inválidas.");
  const colorVariants = raw.map((value): CatalogColorPhoto => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("La fotografía de una variante es inválida.");
    const item = value as Record<string, unknown>;
    if (typeof item.color !== "string" || !item.color.trim())
      throw new Error("Falta identificar el color de una fotografía.");
    return {
      color: item.color.trim(),
      imageUrl: optionalText(item.imageUrl),
      swatchHex: optionalText(item.swatchHex),
    };
  });
  return {
    categoryKey: optionalText(record.categoryKey),
    imageUrl: optionalText(record.imageUrl),
    colorVariants,
  };
};

/** La imagen del producto real siempre tiene prioridad sobre la imagen del color. */
export const catalogCoverPhoto = (media: CatalogMedia): string | undefined =>
  inventoryProductPhoto(
    media.imageUrl ?? undefined,
    media.colorVariants.map((v) => ({ imageUrl: v.imageUrl ?? undefined })),
  );

/** La sede sin verificar no es una sede comercial: vendidos van en historial. */
export const commercialSiteGroups = <
  T extends { siteId: string | null; physicallyVerified: number; total: number }
>(sites: readonly T[]): T[] =>
  sites.filter((site) => site.siteId !== null && site.physicallyVerified > 0);
