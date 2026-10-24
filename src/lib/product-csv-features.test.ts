import { describe, expect, it } from "vitest";

import { getProductCsvFeatureCategoryIssue } from "./product-csv-features";

describe("getProductCsvFeatureCategoryIssue", () => {
  it("no exige categoría técnica cuando no hay características", () => {
    expect(getProductCsvFeatureCategoryIssue("", undefined, false)).toBeUndefined();
    expect(getProductCsvFeatureCategoryIssue("  ", "repuesto", false)).toBeUndefined();
  });

  it("marca las características sin tipo de producto como revisión", () => {
    expect(getProductCsvFeatureCategoryIssue("RAM: 8 GB", undefined, false)).toBe("missing_type");
  });

  it("rechaza características para tipos que no admiten ficha técnica", () => {
    expect(getProductCsvFeatureCategoryIssue("Material: OLED", "repuesto", false)).toBe("unsupported_type");
  });

  it("permite importar características cuando el tipo admite ficha técnica", () => {
    expect(getProductCsvFeatureCategoryIssue("RAM: 8 GB", "celular", true)).toBeUndefined();
  });
});
