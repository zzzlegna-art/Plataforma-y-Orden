import { inventoryProductPhoto } from "./product-color-photos";
import { PRODUCT_TECHNICAL_SPEC_KEYS, type ProductTechnicalSpecs } from "./types";

export interface CatalogColorPhoto {
  color: string;
  imageUrl: string | null;
  swatchHex: string | null;
}
export interface CatalogMedia {
  categoryKey: string | null;
  imageUrl: string | null;
  colorVariants: CatalogColorPhoto[];
  technicalSpecs?: ProductTechnicalSpecs | null;
  description?: string | null;
}

const optionalText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("La información visual del catálogo es inválida.");
  return value.trim() || null;
};

/** Datos técnicos reales y explícitos de cada producto; no deducir ni inventar especificaciones. */
export const parseCatalogTechnicalSpecs = (value: unknown): ProductTechnicalSpecs | null => {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Las especificaciones técnicas de la referencia son inválidas.");
  const data = value as Record<string, unknown>;
  const specs: ProductTechnicalSpecs = {};
  for (const key of PRODUCT_TECHNICAL_SPEC_KEYS) {
    const raw = data[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw !== "string" || raw.length > 3000)
      throw new Error("Un campo de especificaciones técnicas es inválido.");
    if (raw.trim()) specs[key] = raw.trim();
  }
  if (data.customFields !== undefined && data.customFields !== null) {
    if (!Array.isArray(data.customFields) || data.customFields.length > 40)
      throw new Error("Las características personalizadas son inválidas.");
    specs.customFields = data.customFields.map((field: unknown, index: number) => {
      if (!field || typeof field !== "object" || Array.isArray(field))
        throw new Error("Una característica personalizada es inválida.");
      const item = field as Record<string, unknown>;
      if (typeof item.name !== "string" || typeof item.value !== "string"
          || item.name.length > 120 || item.value.length > 3000)
        throw new Error("Nombre o valor de característica personalizada inválido.");
      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id : `custom-${index}`,
        name: item.name.trim(), value: item.value.trim(),
      };
    }).filter((item) => Boolean(item.name && item.value));
  }
  return Object.keys(specs).length ? specs : null;
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
    technicalSpecs: parseCatalogTechnicalSpecs(record.technicalSpecs),
    description: optionalText(record.description),
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
