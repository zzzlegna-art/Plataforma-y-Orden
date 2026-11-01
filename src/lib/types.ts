/**
 * Tipos del dominio de inventario.
 * Todos los identificadores son strings (uuid) y las fechas ISO en texto, para que
 * un futuro backend (Postgres) use exactamente las mismas formas.
 *
 * Modelo basado en el prototipo "Bodega 6A": los equipos viven en dos ubicaciones
 * (bodega central y local) y cada serial/IMEI tiene un estado único que combina
 * su ubicación y situación comercial.
 */

/** Roles del sistema: administrador o bodeguero (encargado de la operación diaria
 *  y de las garantías). */
export type Role = "admin" | "bodeguero";

export type UnitCondition = "nuevo" | "seminuevo";

/**
 * Estado de una unidad física (serial/IMEI).
 * - en_bodega: almacenada en la bodega central (disponible para pedidos/traslados)
 * - en_local: en el local (disponible para venta)
 * - vendido: entregada al cliente (venta o pedido mayorista)
 * - en_reparacion: en garantía o servicio técnico
 * - defectuoso: dañada, apartada
 * - en_transito: en un traslado en curso entre bodega y local
 * - entregado_garantia: entregada al cliente como resolución de garantía
 * - liberado: fuera del sistema (se puede reingresar)
 */
export type UnitStatus =
  | "en_bodega"
  | "en_local"
  | "vendido"
  | "en_reparacion"
  | "defectuoso"
  | "en_transito"
  | "entregado_garantia"
  | "liberado";

export type ReceptionStatus = "captura" | "confirmada" | "descartada";

export type MovementType =
  | "entrada"
  | "salida"
  | "ajuste"
  | "devolucion"
  | "garantia"
  | "liberacion"
  | "correccion";

export type MovementReference = "recepcion" | "pedido" | "garantia" | "manual";

export type OrderStatus =
  | "en_preparacion"
  | "preparado"
  | "despachado"
  | "cancelado";

/**
 * Estados del caso de garantía:
 * - recibido: el equipo se recibió del cliente (aún no se envía a taller)
 * - en_servicio_tecnico: enviado al técnico externo / taller
 * - reenvio_pendiente: diagnosticado y resuelto, listo para entregar al cliente
 * - entregado: entregado al cliente (caso cerrado)
 * - devuelto: el caso se cerró devolviendo el equipo sin resolución
 */
export type WarrantyStatus =
  | "recibido"
  | "en_servicio_tecnico"
  | "reenvio_pendiente"
  | "entregado"
  | "devuelto";

/** Resoluciones nuevas: reparado, cambio o sin falla. "Defectuoso" se conserva solo para leer registros históricos. */
export type WarrantyResolution = "reparado" | "cambio" | "sin_falla" | "defectuoso";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "confirm"
  | "discard"
  | "assign"
  | "release"
  | "status"
  | "resolve"
  | "login";

export type AuditEntity =
  | "product"
  | "productType"
  | "category"
  | "brand"
  | "reception"
  | "unit"
  | "order"
  | "customer"
  | "warranty"
  | "user"
  | "tecnico"
  | "serial_previo"
  | "session";

/**
 * Personal del sistema. Las credenciales viven en el servicio de autenticación
 * del backend; aquí solo se guarda el perfil (rol y estado).
 */
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

/** Identidad autenticada que acompaña a cada acción. */
export interface Actor {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Brand {
  id: string;
  name: string;
  createdAt: string;
}

/** Categorías de producto (modelo del prototipo Bodega 6A). */
/**
 * Tipo de producto (celular, tablet, repuesto...). Ya no es una lista fija: se administra
 * desde Administración (tabla bodega_product_types) y puede crecer con tipos nuevos. "repuesto"
 * es el único con un significado especial fijo en el código (sin condición nuevo/seminuevo, se
 * entra por cantidad) — ver esProductoRepuesto en src/lib/products.ts.
 */
export type ProductCategory = string;

/** Un tipo de producto administrable (Administración > Tipos de producto). */
export interface ProductType {
  id: string;
  /** Clave estable que se guarda en Product.categoria (por ejemplo "celular", "parlante"). */
  key: string;
  name: string;
  /** A qué grupo de clientes mayoristas pertenece (ver Customer.categoriaMayorista). */
  mayoristaGroup: "celulares" | "repuestos";
  createdAt: string;
}

export type TipoRepuesto = "bateria" | "display" | "otro";

export const PRODUCT_TECHNICAL_SPEC_KEYS = [
  "storage", "ram", "processor", "screen", "screenResolution", "refreshRate", "cameras", "rearCamera", "frontCamera",
  "battery", "connectivity", "color", "caseSize", "compatibility", "material", "waterResistance",
  "sensors", "operatingSystem", "biometric", "stylusSupport", "keyboardSupport", "gps",
  "cellularConnectivity", "noiseCancellation", "transparencyMode", "spatialAudio", "microphones",
  "soundLevel", "caseBattery", "chargingCase", "wirelessCharging", "bluetoothVersion", "audioCodec",
  "graphics", "ports", "dimensions", "weight", "power", "audioFeatures", "latency",
] as const;
export type ProductTechnicalSpecKey = (typeof PRODUCT_TECHNICAL_SPEC_KEYS)[number];

export interface ProductCustomTechnicalSpec {
  id: string;
  name: string;
  value: string;
}

/** Las claves conocidas se presentan como campos por categoría; customFields permite atributos propios por referencia. */
export type ProductTechnicalSpecs = Partial<Record<ProductTechnicalSpecKey, string>> & {
  customFields?: ProductCustomTechnicalSpec[];
};

export interface ProductColorVariant {
  /** Nombre comercial del color dentro de esta referencia; ej. Blanco, Azul, Borgoña. */
  color: string;
  /** Costo de referencia por color. El IMEI conserva el costo real de compra. */
  cost: number;
  /** Precio de venta sugerido del color. Se puede ajustar antes de confirmar venta. */
  price: number;
  /** Fotografía opcional de esta variante, sin reemplazar la imagen principal del modelo. */
  imageUrl?: string;
  /** Color real de la muestra visual; no afecta stock, precios ni serialización. */
  swatchHex?: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  imageUrl?: string;
  technicalSpecs?: ProductTechnicalSpecs;
  colorVariants?: ProductColorVariant[];
  categoryId?: string;
  brandId?: string;
  categoria?: ProductCategory;
  tipoRepuesto?: TipoRepuesto;
  price: number;
  cost: number;
  minStock: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Control físico en curso: cuándo se inició (lo fija el servidor). */
  controlStartedAt?: string;
  controlStartedBy?: string;
}

export interface Reception {
  id: string;
  code: string;
  supplierId?: string;
  reference?: string;
  status: ReceptionStatus;
  receivedAt: string;
  confirmedAt?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

/** Línea en captura de una recepción; se convierte en unidad al confirmar. */
export interface ReceptionItem {
  id: string;
  color?: string;
  receptionId: string;
  productId: string;
  serial: string;
  condition: UnitCondition;
  cost?: number;
  createdAt: string;
}

export interface Unit {
  id: string;
  color?: string;
  productId: string;
  serial: string;
  condition: UnitCondition;
  status: UnitStatus;
  cost?: number;
  /** Ubicación física conciliada de este IMEI; sin valor hasta verificar inventario. */
  siteId?: string;
  receptionId?: string;
  location?: string;
  notes?: string;
  receivedAt: string;
  createdBy: string;
  /** Última vez que se verificó físicamente (control físico); la fija el servidor. */
  checkedAt?: string;
  checkedBy?: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  unitId?: string;
  type: MovementType;
  quantity: number;
  referenceType: MovementReference;
  referenceId?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

/** Para mayoristas: qué categoría de producto pueden llevar. */
export type CustomerCategoriaMayorista = "celulares" | "repuestos" | "ambos";

export interface Customer {
  id: string;
  name: string;
  /** "mayorista" (externo, recibe pedidos) o "detalle" (cliente del local). */
  tipo?: "mayorista" | "detalle";
  categoriaMayorista?: CustomerCategoriaMayorista;
  taxId?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Order {
  id: string;
  code: string;
  customerId: string;
  status: OrderStatus;
  orderDate: string;
  deliveryDate?: string;
  notes?: string;
  total: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  color?: string;
  orderId: string;
  productId: string;
  quantity: number;
  /** Condición solicitada (nuevo/seminuevo); los repuestos no la usan. */
  condition?: UnitCondition;
  unitPrice: number;
  subtotal: number;
}

/** Serial/IMEI asignado a una línea del pedido. */
export interface OrderItemUnit {
  id: string;
  orderItemId: string;
  unitId: string;
  /** Cuándo se asignó (se serializó) este equipo al pedido. */
  createdAt: string;
}

/** Técnico externo al que se envían equipos a reparar (garantías). */
export interface Technician {
  id: string;
  nombre: string;
  activo: boolean;
  createdAt: string;
}

/** Seriales vendidos antes de la plataforma (garantías previas y referencias). */
export interface SerialPrevio {
  id: string;
  serial: string;
  referencia?: string;
  cliente?: string;
  /** Fecha de venta original, no la fecha en que se importó. ISO YYYY-MM-DD. */
  fechaVenta?: string;
  archivoOrigen?: string;
  hojaOrigen?: string;
  filaOrigen?: number;
  notas?: string;
  createdBy: string;
  createdAt: string;
}

export interface Warranty {
  id: string;
  code: string;
  /** Unidad relacionada; puede no existir en garantías "previas". */
  unitId?: string;
  productId?: string;
  customerId?: string;
  orderId?: string;
  tecnicoId?: string;
  reason: string;
  status: WarrantyStatus;
  /** Texto del diagnóstico del taller. */
  diagnostico?: string;
  resolucion?: WarrantyResolution;
  /** Unidad que se entregará al cliente cuando la resolución es "cambio". */
  replacementUnitId?: string;
  costo?: number;
  receivedAt: string;
  resolvedAt?: string;
  notes?: string;
  /** Datos manuales de una "garantía previa" (venta anterior a la plataforma). */
  imeiManual?: string;
  referenciaManual?: string;
  clienteManual?: string;
  fechaVentaManual?: string;
  createdBy: string;
}

export interface WarrantyEvent {
  id: string;
  warrantyId: string;
  status: WarrantyStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  details?: string;
  createdAt: string;
}

export interface AppSettings {
  currency: string;
  companyName: string;
}

/** Base de datos local completa. */
export interface Db {
  version: number;
  settings: AppSettings;
  users: User[];
  categories: Category[];
  brands: Brand[];
  productTypes: ProductType[];
  products: Product[];
  receptions: Reception[];
  receptionItems: ReceptionItem[];
  units: Unit[];
  movements: StockMovement[];
  customers: Customer[];
  orders: Order[];
  orderItems: OrderItem[];
  orderItemUnits: OrderItemUnit[];
  tecnicos: Technician[];
  serialesPrevios: SerialPrevio[];
  warranties: Warranty[];
  warrantyEvents: WarrantyEvent[];
  auditLogs: AuditLog[];
}
