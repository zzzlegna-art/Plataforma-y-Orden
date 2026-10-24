import type { ProductTechnicalSpecKey, ProductTechnicalSpecs } from "./types";

export interface ProductCsvFeatureField {
  key: ProductTechnicalSpecKey;
  label: string;
}

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const sameName = (left: string, right: string) => normalize(left) === normalize(right);

/**
 * Parsea la columna de características del CSV de catálogo.
 * Si la fila no tiene categoría, conserva las características como campos
 * personalizados en lugar de descartarlas silenciosamente.
 */
export const parseProductCsvFeatures = (
  text: string,
  fields: readonly ProductCsvFeatureField[] = [],
  createId: () => string = () => `csv-${crypto.randomUUID()}`,
): ProductTechnicalSpecs | undefined => {
  if (!text.trim()) return undefined;

  const specs: ProductTechnicalSpecs = {};
  const customFields: NonNullable<ProductTechnicalSpecs["customFields"]> = [];

  text.split(/\s+\|\s+/).forEach((entry) => {
    const separator = entry.indexOf(":");
    if (separator < 1) return;

    const label = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (!label || !value) return;

    const field = fields.find((candidate) =>
      sameName(candidate.label, label) || sameName(candidate.key, label),
    );
    if (field) specs[field.key] = value;
    else customFields.push({ id: createId(), name: label, value });
  });

  if (customFields.length) specs.customFields = customFields;
  return Object.keys(specs).length ? specs : undefined;
};
