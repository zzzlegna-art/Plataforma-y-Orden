import { normalizeCatalogText } from "./catalog-text";
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
const REAR_CAMERA = field("rearCamera", "48 MP + 12 MP / 4K");
const FRONT_CAMERA = field("frontCamera", "12 MP / 4K");
const BATTERY = field("battery", "Capacidad o autonomía");
const CONNECTIVITY = field("connectivity", "Wi-Fi, Bluetooth, 5G");
const COLOR = field("color", "Color del fabricante");
const COMPATIBILITY = field("compatibility", "Modelos o sistemas compatibles");
const MATERIAL = field("material", "Material");
const WATER_RESISTANCE = field("waterResistance", "IP68 / 5 ATM, si aplica");
const HEADPHONE_RESISTANCE: ProductTechnicalSpecField = {
  ...field("waterResistance", "IPX4 / IP54 / IP67, si aplica"),
  labelKey: "product.spec.headphoneResistance",
};
const HEADPHONE_AUTONOMY: ProductTechnicalSpecField = {
  ...field("battery", "6 horas por carga / 30 h con estuche"),
  labelKey: "product.spec.autonomy",
};
const SOUND_ISOLATION: ProductTechnicalSpecField = {
  ...field("noiseCancellation", "ANC / aislamiento pasivo"),
  labelKey: "product.spec.soundIsolation",
};
const WATCH_RESISTANCE: ProductTechnicalSpecField = {
  ...field("waterResistance", "IP68 / 5 ATM / resistente al agua"),
  labelKey: "product.spec.watchResistance",
};

export const DEVICE_TECHNICAL_SPEC_FIELDS: Record<DeviceCategory, ProductTechnicalSpecField[]> = {
  celular: [
    STORAGE,
    RAM,
    PROCESSOR,
    REAR_CAMERA,
    FRONT_CAMERA,
    CONNECTIVITY,
    field("compatibility", "SIM / eSIM / Dual SIM"),
  ],
  tablet: [
    STORAGE,
    RAM,
    PROCESSOR,
    REAR_CAMERA,
    FRONT_CAMERA,
    CONNECTIVITY,
    field("compatibility", "SIM / eSIM / Dual SIM / lápiz compatible"),
  ],
  reloj: [
    STORAGE,
    SCREEN,
    PROCESSOR,
    WATCH_RESISTANCE,
    CONNECTIVITY,
    field("compatibility", "iPhone / Android / dispositivos compatibles"),
    field("sensors", "Pulso, SpO₂, temperatura, ECG"),
  ],
  audifono: [
    PROCESSOR,
    HEADPHONE_RESISTANCE,
    field("connectivity", "Bluetooth / conexión multipunto"),
    field("compatibility", "iPhone / Android / PC / otros dispositivos"),
    HEADPHONE_AUTONOMY,
    field("sensors", "Detección en oído, controles táctiles"),
    SOUND_ISOLATION,
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
  normalizarTexto = true,
): ProductTechnicalSpecs | undefined => {
  if (!category || !specs || !enabled) return undefined;
  const fields = getProductTechnicalSpecFieldsForCategory(category);
  if (!fields.length) return undefined;

  const normalized: ProductTechnicalSpecs = {};
  // Al leer desde la base, la referencia de concurrencia debe conservar los valores exactos.
  // La normalización se aplica al guardar, no al construir la copia con la que se comparará.
  const normalizar = (value: string) => normalizarTexto ? normalizeCatalogText(value) : value;
  for (const field of fields) {
    const value = specs[field.key];
    if (
      typeof value === "string" &&
      (normalizarTexto ? Boolean(value.trim()) : true)
    ) {
      normalized[field.key] = normalizar(value);
    }
  }

  // Conserva las cámaras del formato anterior hasta que se completen ambos campos nuevos.
  // Así editar un celular o una tablet existente no borra silenciosamente la ficha antigua.
  if (["celular", "tablet"].includes(normalizeCategory(category))) {
    const legacyCameras = typeof specs.cameras === "string" ? normalizar(specs.cameras) : "";
    const hasRearCamera = Boolean(normalized.rearCamera);
    const hasFrontCamera = Boolean(normalized.frontCamera);
    if (
      (normalizarTexto ? Boolean(legacyCameras) : typeof specs.cameras === "string") &&
      !(hasRearCamera && hasFrontCamera)
    ) {
      normalized.cameras = legacyCameras;
    }
  }

  // Mantiene en los datos guardados las características antiguas de los relojes que ya no
  // se muestran en el formulario simplificado, para evitar perder información histórica.
  if (normalizeCategory(category) === "reloj") {
    const legacyWatchKeys = [
      "caseSize",
      "screenResolution",
      "refreshRate",
      "cellularConnectivity",
      "battery",
      "material",
      "gps",
      "operatingSystem",
      "biometric",
      "color",
    ] as const;
    for (const key of legacyWatchKeys) {
      const value = specs[key];
      if (
        !normalized[key] &&
        typeof value === "string" &&
        (normalizarTexto ? Boolean(value.trim()) : true)
      ) {
        normalized[key] = normalizar(value);
      }
    }
  }

  // Conserva atributos detallados de audífonos antiguos aunque la ficha simplificada ya no
  // los muestre, para evitar borrar información al editar y guardar un producto existente.
  if (normalizeCategory(category) === "audifono") {
    const legacyHeadphoneKeys = [
      "transparencyMode",
      "spatialAudio",
      "microphones",
      "soundLevel",
      "caseBattery",
      "chargingCase",
      "wirelessCharging",
      "bluetoothVersion",
      "audioCodec",
      "material",
      "color",
    ] as const;
    for (const key of legacyHeadphoneKeys) {
      const value = specs[key];
      if (!normalized[key] && typeof value === "string" && value.trim()) {
        normalized[key] = normalizeCatalogText(value);
      }
    }
  }

  const customFields = Array.isArray(specs.customFields)
    ? specs.customFields.flatMap((item, index) => {
        if (!item || typeof item.name !== "string" || typeof item.value !== "string") return [];
        const name = normalizar(item.name);
        const value = normalizar(item.value);
        if (normalizarTexto && (!name || !value)) return [];
        const id = typeof item.id === "string" && item.id.trim() ? item.id : `custom-${index}`;
        return [{ id, name, value }];
      })
    : [];

  if (customFields.length) normalized.customFields = customFields;
  return Object.keys(normalized).length ? normalized : undefined;
};
