export type ProductCsvFeatureCategoryIssue = "missing_type" | "unsupported_type";

/**
 * El dominio solo guarda características técnicas para tipos que admiten ficha técnica.
 * Valida antes de importar para que la acción no descarte datos silenciosamente.
 */
export const getProductCsvFeatureCategoryIssue = (
  features: string,
  category: string | undefined,
  supportsTechnicalSpecs: boolean,
): ProductCsvFeatureCategoryIssue | undefined => {
  if (!features.trim()) return undefined;
  if (!category?.trim()) return "missing_type";
  if (!supportsTechnicalSpecs) return "unsupported_type";
  return undefined;
};
