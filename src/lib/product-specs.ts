import type { ProductTechnicalSpecKey, ProductTechnicalSpecs } from "./types";

export type DeviceCategory = "celular" | "tablet" | "reloj";

export interface ProductTechnicalSpecField {
  key: ProductTechnicalSpecKey;
  labelKey: string;
  placeholder: string;
}

export const DEVICE_TECHNICAL_SPEC_FIELDS: Record<DeviceCategory, ProductTechnicalSpecField[]> = {
  celular: [
    { key: "storage", labelKey: "product.spec.storage", placeholder: "128 GB" },
    { key: "ram", labelKey: "product.spec.ram", placeholder: "4 GB" },
    { key: "processor", labelKey: "product.spec.processor", placeholder: "A15 Bionic" },
    { key: "screen", labelKey: "product.spec.screen", placeholder: "6,1 pulgadas OLED" },
    { key: "cameras", labelKey: "product.spec.cameras", placeholder: "12 MP + 12 MP" },
    { key: "battery", labelKey: "product.spec.battery", placeholder: "3.240 mAh" },
    { key: "connectivity", labelKey: "product.spec.connectivity", placeholder: "5G, Wi-Fi 6, Bluetooth" },
    { key: "color", labelKey: "product.spec.color", placeholder: "Verde" },
  ],
  tablet: [
    { key: "storage", labelKey: "product.spec.storage", placeholder: "128 GB" },
    { key: "ram", labelKey: "product.spec.ram", placeholder: "8 GB" },
    { key: "processor", labelKey: "product.spec.processor", placeholder: "M2 / Snapdragon" },
    { key: "screen", labelKey: "product.spec.screen", placeholder: "11 pulgadas" },
    { key: "cameras", labelKey: "product.spec.cameras", placeholder: "12 MP trasera / 12 MP frontal" },
    { key: "battery", labelKey: "product.spec.battery", placeholder: "7.600 mAh" },
    { key: "connectivity", labelKey: "product.spec.connectivity", placeholder: "Wi-Fi / Wi-Fi + Cellular" },
    { key: "color", labelKey: "product.spec.color", placeholder: "Gris espacial" },
  ],
  reloj: [
    { key: "caseSize", labelKey: "product.spec.caseSize", placeholder: "45 mm" },
    { key: "screen", labelKey: "product.spec.screen", placeholder: "AMOLED" },
    { key: "connectivity", labelKey: "product.spec.connectivity", placeholder: "Bluetooth / LTE" },
    { key: "compatibility", labelKey: "product.spec.compatibility", placeholder: "Android / iOS" },
    { key: "battery", labelKey: "product.spec.battery", placeholder: "Hasta 18 horas" },
    { key: "material", labelKey: "product.spec.material", placeholder: "Aluminio" },
    { key: "waterResistance", labelKey: "product.spec.waterResistance", placeholder: "5 ATM" },
    { key: "sensors", labelKey: "product.spec.sensors", placeholder: "Pulso, SpO₂, GPS" },
    { key: "color", labelKey: "product.spec.color", placeholder: "Negro" },
  ],
};

export const isDeviceCategory = (category?: string): category is DeviceCategory =>
  category === "celular" || category === "tablet" || category === "reloj";

/** Filtra campos que no corresponden al tipo de equipo y normaliza valores vacíos. */
export const getProductTechnicalSpecsForCategory = (
  category: string | undefined,
  specs?: ProductTechnicalSpecs | null,
): ProductTechnicalSpecs | undefined => {
  if (!isDeviceCategory(category) || !specs) return undefined;

  const normalized: ProductTechnicalSpecs = {};
  for (const field of DEVICE_TECHNICAL_SPEC_FIELDS[category]) {
    const value = specs[field.key];
    if (typeof value === "string" && value.trim()) normalized[field.key] = value.trim().slice(0, 120);
  }

  return Object.keys(normalized).length ? normalized : undefined;
};
