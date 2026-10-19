/**
 * Modelo de datos del inventario.
 *
 * La app trabaja sobre este objeto en memoria; quien lo carga y lo guarda es la
 * capa de backend (`src/lib/backend.ts`). Las páginas y las acciones de dominio
 * no saben si los datos vienen del servidor o de una copia local.
 */

import type {
  Actor,
  AuditAction,
  AuditEntity,
  AuditLog,
  Db,
  MovementReference,
  MovementType,
  StockMovement,
} from "./types";

export const DB_VERSION = 5;

/** Error de dominio con clave de traducción para mostrar en la interfaz. */
export class DomainError extends Error {
  key: string;
  params?: Record<string, string | number>;

  constructor(key: string, params?: Record<string, string | number>) {
    super(key);
    this.name = "DomainError";
    this.key = key;
    this.params = params;
  }
}

export const emptyDb = (): Db => ({
  version: DB_VERSION,
  settings: { currency: "COP", companyName: "Mi Empresa" },
  users: [],
  categories: [],
  productTypes: [],
  brands: [],
  products: [],
  receptions: [],
  receptionItems: [],
  units: [],
  movements: [],
  customers: [],
  orders: [],
  orderItems: [],
  orderItemUnits: [],
  tecnicos: [],
  serialesPrevios: [],
  warranties: [],
  warrantyEvents: [],
  auditLogs: [],
});

export const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export const nowIso = () => new Date().toISOString();

/**
 * Código consecutivo legible (REC-00001, PED-00003, GAR-00007).
 * Toma el mayor consecutivo existente para que borrar registros no reutilice códigos.
 */
export const nextSequentialCode = (existing: string[], prefix: string, pad = 5) => {
  const highest = existing.reduce((max, code) => {
    const match = code?.match(/(\d+)$/);
    const value = match ? Number(match[1]) : 0;
    return value > max ? value : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(pad, "0")}`;
};

/** Zona horaria de la bodega: los códigos del día se calculan con su fecha, no la del navegador. */
export const ZONA_HORARIA = "America/Bogota";

/** Fecha YYMMDD (por ejemplo 260921) en la zona horaria de la bodega. */
export const selloDelDia = (fecha: Date = new Date()) => {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${valor("year")}${valor("month")}${valor("day")}`;
};

/**
 * Código con la fecha y un consecutivo del día (PED-260921-001, GAR-260921-002).
 * Solo cuenta los códigos del mismo día y prefijo; el servidor vuelve a comprobarlo
 * y, si otro dispositivo se le adelantó, asigna el siguiente libre.
 */
export const nextDailyCode = (
  existing: string[],
  prefix: string,
  fecha: Date = new Date(),
  pad = 3,
) => {
  const dia = selloDelDia(fecha);
  const patron = new RegExp(`^${prefix}-${dia}-(\\d+)$`);
  const highest = existing.reduce((max, code) => {
    const match = code?.match(patron);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${dia}-${String(highest + 1).padStart(pad, "0")}`;
};

/** Caché en memoria: la app trabaja siempre sobre el mismo objeto. */
export const cloneDb = (db: Db): Db =>
  typeof structuredClone === "function"
    ? structuredClone(db)
    : (JSON.parse(JSON.stringify(db)) as Db);

/** Bitácora de actividad: quién, qué, sobre qué y cuándo. */
export const logAudit = (
  db: Db,
  actor: Actor,
  entry: {
    action: AuditAction;
    entity: AuditEntity;
    entityId?: string;
    details?: string;
  },
) => {
  const log: AuditLog = {
    id: createId(),
    userId: actor.id,
    userEmail: actor.email,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    details: entry.details,
    createdAt: nowIso(),
  };
  db.auditLogs.unshift(log);
  if (db.auditLogs.length > 500) db.auditLogs.length = 500;
  return log;
};

/** Movimiento de stock: el rastro que sostiene la auditoría de inventario. */
export const logMovement = (
  db: Db,
  actor: Actor,
  entry: {
    productId: string;
    unitId?: string;
    type: MovementType;
    quantity?: number;
    referenceType: MovementReference;
    referenceId?: string;
    notes?: string;
    createdAt?: string;
  },
) => {
  const movement: StockMovement = {
    id: createId(),
    productId: entry.productId,
    unitId: entry.unitId,
    type: entry.type,
    quantity: entry.quantity ?? 1,
    referenceType: entry.referenceType,
    referenceId: entry.referenceId,
    notes: entry.notes,
    createdBy: actor.id,
    createdAt: entry.createdAt ?? nowIso(),
  };
  db.movements.unshift(movement);
  return movement;
};
