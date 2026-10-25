export type ProductCsvFeatureCategoryIssue =
  | "missing_type"
  | "unsupported_type"
  | "malformed_features";

/**
 * The product domain only persists technical features for product types with a
 * technical sheet. Validate during preview so imported data is never discarded
 * silently by the save action or by the feature parser.
 */
export const getProductCsvFeatureCategoryIssue = (
  features: string,
  category: string | undefined,
  supportsTechnicalSpecs: boolean,
): ProductCsvFeatureCategoryIssue | undefined => {
  if (!features.trim()) return undefined;
  if (!category?.trim()) return "missing_type";
  if (!supportsTechnicalSpecs) return "unsupported_type";

  const entries = features.split(/\s*\|\s*/).map((entry) => entry.trim()).filter(Boolean);
  const malformed = entries.some((entry) => {
    const separator = entry.indexOf(":");
    return separator < 1 || !entry.slice(separator + 1).trim();
  });

  return malformed ? "malformed_features" : undefined;
};
