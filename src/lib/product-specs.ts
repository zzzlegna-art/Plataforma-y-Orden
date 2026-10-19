import type { ProductTechnicalSpecKey, ProductTechnicalSpecs } from "./types";

export type DeviceCategory = "celular" | "tablet" | "reloj" | "audifono";

export interface ProductTechnicalSpecField {
  key: ProductTechnicalSpecKey;
  labelKey: string;
  placeholder: string;
}

const field = (
  key: ProductTechnicalSpecKey,
  placeholder: string,
): ProductTechnicalSpecField => ({ key, labelKey: `product.spec.${key}`, placeholder });

const STORAGE = field("storage", "128 GB");
const RAM = field("ram", "8 GB");
const PROCESSOR = field("processor", "Chip / procesador");
const SCREEN = field("screen", "OLED / AMOLED / LCD");
const CAMERAS = field("cameras", "Resolución y configuración");
const BATTERY = field("battery", "Capacidad o autonomía");
const CONNECTIVITY = field("connectivity", "Wi-Fi, Bluetooth, 5G");
const COLOR = field("color", "Color del fabricante");
const COMPATIBILITY = field("compatibility", "Modelos o sistemas compatibles");
const MATERIAL = field("material", "Material");
const WATER_RESISTANCE = field("waterResistance", "IP68 / 5 ATM, si aplica");

export const DEVICE_TECHNICAL_SPEC_FIELDS: Record<DeviceCategory, ProductTechnicalSpecField[]> = {
  celular: [
    STORAGE,
    RAM,
    PROCESSOR,
    SCREEN,
    field("screenResolution", "Resolución de pantalla"),
    field("refreshRate", "60 / 90 / 120 Hz"),
    CAMERAS,
    BATTERY,
    CONNECTIVITY,
    field("cellularConnectivity", "5G, LTE, eSIM"),
    field("operatingSystem", "iOS / Android"),
    field("biometric", "Face ID / huella"),
    WATER_RESISTANCE,
    COLOR,
  ],
  tablet: [
    STORAGE,
    RAM,
    PROCESSOR,
    SCREEN,
    field("screenResolution", "Resolución de pantalla"),
    field("refreshRate", "60 / 120 Hz"),
    CAMERAS,
    BATTERY,
    CONNECTIVITY,
    field("stylusSupport", "Lápiz compatible"),
    field("keyboardSupport", "Teclados compatibles"),
    field("operatingSystem", "iPadOS / Android / Windows"),
    field("biometric", "Huella / reconocimiento facial"),
    COLOR,
  ],
  reloj: [
    field("caseSize", "40 / 42 / 45 / 49 mm"),
    SCREEN,
    field("screenResolution", "Resolución de pantalla"),
    CONNECTIVITY,
    field("cellularConnectivity", "GPS / GPS + Cellular"),
    COMPATIBILITY,
    BATTERY,
    MATERIAL,
    WATER_RESISTANCE,
    field("sensors", "Pulso, SpO₂, temperatura"),
    field("gps", "GPS integrado / conectado"),
    field("operatingSystem", "watchOS / Wear OS"),
    COLOR,
  ],
  audifono: [
    field("compatibility", "Dispositivos compatibles"),
    field("noiseCancellation", "Cancelación activa de ruido (ANC)"),
    field("transparencyMode", "Modo ambiente / transparencia"),
    field("spatialAudio", "Audio espacial / seguimiento de cabeza"),
    field("microphones", "Micrófonos y funciones de llamadas"),
    field("soundLevel", "Nivel de sonido / sensibilidad (dB, si se publica)"),
    field("battery", "Autonomía de los audífonos"),
    field("caseBattery", "Autonomía total con estuche"),
    field("chargingCase", "USB-C / Lightning / otro"),
    field("wirelessCharging", "Carga inalámbrica"),
    field("connectivity", "Bluetooth / conexión multipunto"),
    field("bluetoothVersion", "Bluetooth 5.x"),
    field("audioCodec", "Códecs de audio compatibles"),
    WATER_RESISTANCE,
    MATERIAL,
    COLOR,
  ],
};

const GENERIC_TECHNICAL_SPEC_FIELDS: ProductTechnicalSpecField[] = [
  STORAGE,
  RAM,
  PROCESSOR,
  SCREEN,
  field("screenResolution", "Resolución"),
  field("refreshRate", "Frecuencia en Hz"),
  BATTERY,
  CONNECTIVITY,
  COMPATIBILITY,
  field("operatingSystem", "Sistema operativo"),
  field("ports", "Puertos y conexiones"),
  field("dimensions", "Dimensiones"),
  field("weight", "Peso"),
  WATER_RESISTANCE,
  COLOR,
];

const CATEGORY_TECHNICAL_SPEC_FIELDS: Record<string, ProductTechnicalSpecField[]> = {
  celular: DEVICE_TECHNICAL_SPEC_FIELDS.celular,
  tablet: DEVICE_TECHNICAL_SPEC_FIELDS.tablet,
  reloj: DEVICE_TECHNICAL_SPEC_FIELDS.reloj,
  audifono: DEVICE_TECHNICAL_SPEC_FIELDS.audifono,
  audifonos: DEVICE_TECHNICAL_SPEC_FIELDS.audifono,
  airpod: DEVICE_TECHNICAL_SPEC_FIELDS.audifono,
  airpods: DEVICE_TECHNICAL_SPEC_FIELDS.audifono,
  headphone: DEVICE_TECHNICAL_SPEC_FIELDS.audifono,
  headphones: DEVICE_TECHNICAL_SPEC_FIELDS.audifono,
  earbuds: DEVICE_TECHNICAL_SPEC_FIELDS.audifono,
  auricular: DEVICE_TECHNICAL_SPEC_FIELDS.audifono,
  auriculares: DEVICE_TECHNICAL_SPEC_FIELDS.audifono,
  smartwatch: DEVICE_TECHNICAL_SPEC_FIELDS.reloj,
  smartwatches: DEVICE_TECHNICAL_SPEC_FIELDS.reloj,
  relojinteligente: DEVICE_TECHNICAL_SPEC_FIELDS.reloj,
  relojesinteligentes: DEVICE_TECHNICAL_SPEC_FIELDS.reloj,
  parlante: [
    field("power", "Potencia de salida (W)"),
    CONNECTIVITY,
    BATTERY,
    field("audioFeatures", "Audio estéreo, ecualización, etc."),
    field("microphones", "Micrófono / manos libres"),
    WATER_RESISTANCE,
    COMPATIBILITY,
    field("ports", "USB-C, AUX, etc."),
    COLOR,
    field("dimensions", "Dimensiones"),
  ],
  parlantes: [
    field("power", "Potencia de salida (W)"),
    CONNECTIVITY,
    BATTERY,
    field("audioFeatures", "Audio estéreo, ecualización, etc."),
    field("microphones", "Micrófono / manos libres"),
    WATER_RESISTANCE,
    COMPATIBILITY,
    field("ports", "USB-C, AUX, etc."),
    COLOR,
    field("dimensions", "Dimensiones"),
  ],
  computador: [
    PROCESSOR, RAM, STORAGE, SCREEN, field("graphics", "Gráficos integrados / dedicados"),
    BATTERY, CONNECTIVITY, field("operatingSystem", "Windows / macOS / Linux"),
    field("ports", "USB, HDMI, audio, etc."), field("dimensions", "Dimensiones"),
    field("weight", "Peso"), COLOR,
  ],
  portatil: [
    PROCESSOR, RAM, STORAGE, SCREEN, field("graphics", "Gráficos integrados / dedicados"),
    BATTERY, CONNECTIVITY, field("operatingSystem", "Windows / macOS / Linux"),
    field("ports", "USB, HDMI, audio, etc."), field("dimensions", "Dimensiones"),
    field("weight", "Peso"), COLOR,
  ],
  laptop: [
    PROCESSOR, RAM, STORAGE, SCREEN, field("graphics", "Gráficos integrados / dedicados"),
    BATTERY, CONNECTIVITY, field("operatingSystem", "Windows / macOS / Linux"),
    field("ports", "USB, HDMI, audio, etc."), field("dimensions", "Dimensiones"),
    field("weight", "Peso"), COLOR,
  ],
  pc: [
    PROCESSOR, RAM, STORAGE, field("graphics", "Gráficos integrados / dedicados"),
    CONNECTIVITY, field("operatingSystem", "Windows / macOS / Linux"),
    field("ports", "USB, HDMI, audio, etc."), COLOR,
  ],
  consola: [
    PROCESSOR, RAM, STORAGE, field("graphics", "GPU / resolución / FPS"),
    CONNECTIVITY, COMPATIBILITY, field("ports", "HDMI, USB, etc."), COLOR,
  ],
  consolas: [
    PROCESSOR, RAM, STORAGE, field("graphics", "GPU / resolución / FPS"),
    CONNECTIVITY, COMPATIBILITY, field("ports", "HDMI, USB, etc."), COLOR,
  ],
  monitor: [
    SCREEN, field("screenResolution", "1080p / 1440p / 4K"),
    field("refreshRate", "60 / 144 / 240 Hz"), CONNECTIVITY,
    field("ports", "HDMI, DisplayPort, USB-C"), COMPATIBILITY, COLOR,
  ],
  camara: [
    SCREEN, CAMERAS, STORAGE, BATTERY, CONNECTIVITY, COMPATIBILITY,
    field("ports", "USB-C / HDMI / otro"), COLOR,
  ],
  camaras: [
    SCREEN, CAMERAS, STORAGE, BATTERY, CONNECTIVITY, COMPATIBILITY,
    field("ports", "USB-C / HDMI / otro"), COLOR,
  ],
};

const normalizeCategory = (category: string): string =>
  category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export const isDeviceCategory = (category?: string): category is DeviceCategory =>
  Boolean(category && Object.prototype.hasOwnProperty.call(DEVICE_TECHNICAL_SPEC_FIELDS, category));

/**
 * Devuelve el perfil técnico de la categoría. Los tipos tecnológicos creados por el usuario
 * reciben campos comunes y pueden complementarse con características personalizadas.
 * Repuestos no reciben ficha técnica.
 */
export const getProductTechnicalSpecFieldsForCategory = (
  category?: string,
): ProductTechnicalSpecField[] => {
  const normalized = category ? normalizeCategory(category) : "";
  if (!normalized || ["repuesto", "repuestos", "accesorio", "accesorios"].includes(normalized)) return [];
  return CATEGORY_TECHNICAL_SPEC_FIELDS[normalized] ?? GENERIC_TECHNICAL_SPEC_FIELDS;
};

/** Filtra campos ajenos a la categoría, limpia valores vacíos y conserva atributos personalizados. */
export const getProductTechnicalSpecsForCategory = (
  category: string | undefined,
  specs?: ProductTechnicalSpecs | null,
  enabled = true,
): ProductTechnicalSpecs | undefined => {
  if (!category || !specs || !enabled) return undefined;
  const fields = getProductTechnicalSpecFieldsForCategory(category);
  if (!fields.length) return undefined;

  const normalized: ProductTechnicalSpecs = {};
  for (const field of fields) {
    const value = specs[field.key];
    if (typeof value === "string" && value.trim()) normalized[field.key] = value.trim().slice(0, 120);
  }

  const customFields = Array.isArray(specs.customFields)
    ? specs.customFields.flatMap((item, index) => {
        if (!item || typeof item.name !== "string" || typeof item.value !== "string") return [];
        const name = item.name.trim().slice(0, 80);
        const value = item.value.trim().slice(0, 120);
        if (!name || !value) return [];
        const id = typeof item.id === "string" && item.id.trim() ? item.id : `custom-${index}`;
        return [{ id, name, value }];
      })
    : [];

  if (customFields.length) normalized.customFields = customFields;
  return Object.keys(normalized).length ? normalized : undefined;
};
