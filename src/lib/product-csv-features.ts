export type ProductCsvFeatureCategoryIssue = "missing_type" | "unsupported_type";

/**
 * The product domain only persists technical features for product types with a
 * technical sheet. Validate during preview so imported data is never discarded
 * silently by the save action.
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
