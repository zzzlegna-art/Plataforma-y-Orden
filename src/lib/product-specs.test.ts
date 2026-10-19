import { describe, expect, it } from "vitest";

import {
  getProductTechnicalSpecFieldsForCategory,
  getProductTechnicalSpecsForCategory,
} from "./product-specs";

describe("getProductTechnicalSpecFieldsForCategory", () => {
  it("incluye características específicas para audífonos", () => {
    const keys = getProductTechnicalSpecFieldsForCategory("audifono").map((field) => field.key);
    expect(keys).toContain("noiseCancellation");
    expect(keys).toContain("transparencyMode");
    expect(keys).toContain("caseBattery");
    expect(keys).toContain("soundLevel");
  });

  it("ofrece un perfil común para nuevos tipos tecnológicos", () => {
    const keys = getProductTechnicalSpecFieldsForCategory("dispositivo-nuevo").map((field) => field.key);
    expect(keys).toContain("storage");
    expect(keys).toContain("connectivity");
    expect(keys).toContain("color");
  });

  it("no genera ficha técnica para repuestos", () => {
    expect(getProductTechnicalSpecFieldsForCategory("repuesto")).toEqual([]);
  });
});

describe("getProductTechnicalSpecsForCategory", () => {
  it("conserva solo campos de la categoría y atributos personalizados completos", () => {
    expect(
      getProductTechnicalSpecsForCategory("audifono", {
        noiseCancellation: "  ANC  ",
        storage: "No aplica",
        customFields: [
          { id: "1", name: "   Impedancia ", value: " 32 ohmios " },
          { id: "2", name: "Campo vacío", value: " " },
        ],
      }),
    ).toEqual({
      noiseCancellation: "ANC",
      customFields: [{ id: "1", name: "Impedancia", value: "32 ohmios" }],
    });
  });

  it("omite características cuando la categoría no debe mostrar ficha técnica", () => {
    expect(
      getProductTechnicalSpecsForCategory("repuesto", {
        color: "Negro",
        customFields: [{ id: "1", name: "Tamaño", value: "Grande" }],
      }),
    ).toBeUndefined();
    expect(
      getProductTechnicalSpecsForCategory("celular", { color: "Negro" }, false),
    ).toBeUndefined();
  });
});
