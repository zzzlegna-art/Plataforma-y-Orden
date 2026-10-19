import { describe, expect, it } from "vitest";

import {
  getProductTechnicalSpecFieldsForCategory,
  getProductTechnicalSpecsForCategory,
} from "./product-specs";

describe("getProductTechnicalSpecFieldsForCategory", () => {
  it("muestra exactamente siete características para celulares y tablets", () => {
    const expectedFields = [
      "storage",
      "ram",
      "processor",
      "rearCamera",
      "frontCamera",
      "connectivity",
      "compatibility",
    ];

    expect(getProductTechnicalSpecFieldsForCategory("celular").map((field) => field.key)).toEqual(expectedFields);
    expect(getProductTechnicalSpecFieldsForCategory("tablet").map((field) => field.key)).toEqual(expectedFields);
  });

  it("muestra exactamente siete características para relojes en el orden solicitado", () => {
    expect(getProductTechnicalSpecFieldsForCategory("reloj").map((field) => field.key)).toEqual([
      "storage",
      "screen",
      "processor",
      "waterResistance",
      "connectivity",
      "compatibility",
      "sensors",
    ]);
    expect(getProductTechnicalSpecFieldsForCategory("reloj")[3].labelKey).toBe("product.spec.watchResistance");
  });

  it("muestra exactamente siete características para audífonos en el orden solicitado", () => {
    const fields = getProductTechnicalSpecFieldsForCategory("audifono");
    expect(fields.map((field) => field.key)).toEqual([
      "processor",
      "waterResistance",
      "connectivity",
      "compatibility",
      "battery",
      "sensors",
      "noiseCancellation",
    ]);
    expect(fields.map((field) => field.labelKey)).toEqual([
      "product.spec.processor",
      "product.spec.headphoneResistance",
      "product.spec.connectivity",
      "product.spec.compatibility",
      "product.spec.autonomy",
      "product.spec.sensors",
      "product.spec.soundIsolation",
    ]);
  });

  it("conserva las características históricas de audífonos al simplificar la ficha", () => {
    expect(
      getProductTechnicalSpecsForCategory("audifono", {
        processor: "H2",
        waterResistance: "IP54",
        connectivity: "Bluetooth 5.3",
        compatibility: "iPhone",
        battery: "6 h / 30 h con estuche",
        sensors: "Detección en oído",
        noiseCancellation: "ANC",
        transparencyMode: "Modo ambiente",
        caseBattery: "30 h",
        chargingCase: "USB-C",
      }),
    ).toEqual({
      processor: "H2",
      waterResistance: "IP54",
      connectivity: "Bluetooth 5.3",
      compatibility: "iPhone",
      battery: "6 h / 30 h con estuche",
      sensors: "Detección en oído",
      noiseCancellation: "ANC",
      transparencyMode: "Modo ambiente",
      caseBattery: "30 h",
      chargingCase: "USB-C",
    });
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

  it("conserva características históricas de relojes aunque ya no aparezcan en el formulario", () => {
    expect(
      getProductTechnicalSpecsForCategory("reloj", {
        storage: "32 GB",
        screen: "OLED",
        processor: "S9",
        waterResistance: "5 ATM",
        connectivity: "Bluetooth, Wi-Fi",
        compatibility: "iPhone",
        sensors: "Pulso, temperatura",
        battery: "18 horas",
        caseSize: "45 mm",
        operatingSystem: "watchOS",
      }),
    ).toEqual({
      storage: "32 GB",
      screen: "OLED",
      processor: "S9",
      waterResistance: "5 ATM",
      connectivity: "Bluetooth, Wi-Fi",
      compatibility: "iPhone",
      sensors: "Pulso, temperatura",
      caseSize: "45 mm",
      battery: "18 horas",
      operatingSystem: "watchOS",
    });
  });

  it("conserva las cámaras antiguas de celulares y tablets hasta completar los dos campos nuevos", () => {
    for (const category of ["celular", "tablet"]) {
      expect(
        getProductTechnicalSpecsForCategory(category, {
          cameras: "Trasera 48 MP, frontal 12 MP",
          rearCamera: "48 MP",
        }),
      ).toEqual({
        rearCamera: "48 MP",
        cameras: "Trasera 48 MP, frontal 12 MP",
      });

      expect(
        getProductTechnicalSpecsForCategory(category, {
          cameras: "Trasera 48 MP, frontal 12 MP",
          rearCamera: "48 MP",
          frontCamera: "12 MP",
        }),
      ).toEqual({
        rearCamera: "48 MP",
        frontCamera: "12 MP",
      });
    }
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
