import { describe, expect, it } from "vitest";

import { getProductCsvFeatureCategoryIssue } from "./product-csv-features";

describe("getProductCsvFeatureCategoryIssue", () => {
  it("does not require a technical category when the row has no features", () => {
    expect(getProductCsvFeatureCategoryIssue("", undefined, false)).toBeUndefined();
    expect(getProductCsvFeatureCategoryIssue("  ", "repuesto", false)).toBeUndefined();
  });

  it("blocks technical features without a product type", () => {
    expect(getProductCsvFeatureCategoryIssue("RAM: 8 GB", undefined, false)).toBe("missing_type");
  });

  it("blocks technical features for product types without a technical sheet", () => {
    expect(getProductCsvFeatureCategoryIssue("Material: OLED", "repuesto", false)).toBe("unsupported_type");
  });

  it("allows technical features for supported product types", () => {
    expect(getProductCsvFeatureCategoryIssue("RAM: 8 GB", "celular", true)).toBeUndefined();
  });

  it("blocks malformed feature values that the parser would otherwise ignore", () => {
    expect(getProductCsvFeatureCategoryIssue("RAM 8 GB", "celular", true)).toBe("malformed_features");
    expect(getProductCsvFeatureCategoryIssue("RAM:", "celular", true)).toBe("malformed_features");
    expect(getProductCsvFeatureCategoryIssue("RAM: 8 GB | Processor", "celular", true)).toBe("malformed_features");
  });
});
