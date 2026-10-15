/**
 * Acciones sobre unidades (seriales/IMEIs): ajustes manuales de estado,
 * liberación/reingreso y corrección del serial.
 */

import { createId, DomainError, logAudit, logMovement, nowIso } from "../db";
import { errorDeSerialCelular, normalizarImei } from "../imei";
import type { Actor, Db, Unit, UnitStatus } from "../types";
import { isSameText, requirePermission, requireText } from "./guards";

const findUnit = (db: Db, unitId: string) => {
  const unit = db.units.find((item) => item.id === unitId);
  if (!unit) throw new DomainError("errors.notFound");
  return unit;
};

const assertNotComprometida = (db: Db, unit: Unit) => {
  // Unidades en garantía, vendidas o en traslado no se tocan a mano.
  if (unit.status === "en_reparacion" || unit.status === "vendido" || unit.status === "en_transito") {
    throw new DomainError("errors.unitComprometida");
  }
  if (unit.status === "entregado_garantia") {
    throw new DomainError("errors.unitComprometida");
  }
  // Unidades apartadas en un pedido en preparación tampoco.
  const activeAssignment = db.orderItemUnits.find((row) => {
    if (row.unitId !== unit.id) return false;
    const item = db.orderItems.find((orderItem) => orderItem.id === row.orderItemId);
    const order = item ? db.orders.find((o) => o.id === item.orderId) : undefined;
    return order && order.status === "en_preparacion";
  });
  if (activeAssignment) throw new DomainError("errors.unitInOrder");
};

export const updateUnit = (
  db: Db,
  actor: Actor,
  input: { id: string; location?: string; notes?: string },
): Unit => {
  requirePermission(actor, "inventory.manage");
  const unit = findUnit(db, input.id);
  unit.location = input.location?.trim() || undefined;
  unit.notes = input.notes?.trim() || undefined;
  logAudit(db, actor, {
    action: "update",
    entity: "unit",
    entityId: unit.id,
    details: unit.serial,
  });
  return unit;
};

/**
 * Ajuste manual de estado entre los estados "en inventario":
 * en_bodega, en_local, defectuoso. La liberación y el reingreso
 * tienen sus propias acciones (solo administradores).
 */
export const setUnitStatus = (
  db: Db,
  actor: Actor,
  input: { id: string; status: UnitStatus; notes?: string },
): Unit => {
  requirePermission(actor, "inventory.manage");
  const unit = findUnit(db, input.id);
  const MANUAL: UnitStatus[] = ["en_bodega", "en_local", "defectuoso"];
  if (!MANUAL.includes(input.status)) {
    throw new DomainError("errors.statusNotManual");
  }
  if (input.status === unit.status) return unit;
  assertNotComprometida(db, unit);

  const previous = unit.status;
  unit.status = input.status;
  logMovement(db, actor, {
    productId: unit.productId,
    unitId: unit.id,
    type: input.status === "defectuoso" ? "ajuste" : "ajuste",
    referenceType: "manual",
    notes: input.notes?.trim() || `Cambio de ${previous} a ${input.status}`,
  });
  logAudit(db, actor, {
    action: "status",
    entity: "unit",
    entityId: unit.id,
    details: `${unit.serial} · ${previous} → ${input.status}`,
  });
  return unit;
};

const requireAdmin = (actor: Actor) => {
  if (actor.role !== "admin") throw new DomainError("errors.forbidden");
};

/** Estados desde los que se puede liberar una unidad. */
const LIBERABLES: UnitStatus[] = ["en_bodega", "en_local", "defectuoso"];

/** Saca una unidad del inventario activo conservando su historial. */
export const liberarUnit = (
  db: Db,
  actor: Actor,
  input: { id: string; motivo?: string },
): Unit => {
  requireAdmin(actor);
  const unit = findUnit(db, input.id);
  if (unit.status === "liberado") throw new DomainError("errors.unitYaLiberada");
  if (!LIBERABLES.includes(unit.status)) {
    throw new DomainError("errors.unitNotLiberable", { estado: unit.status });
  }
  assertNotComprometida(db, unit);

  unit.status = "liberado";
  logMovement(db, actor, {
    productId: unit.productId,
    unitId: unit.id,
    type: "liberacion",
    referenceType: "manual",
    notes: input.motivo?.trim() || "Liberado del sistema",
  });
  logAudit(db, actor, {
    action: "status",
    entity: "unit",
    entityId: unit.id,
    details: `${unit.serial} · liberado`,
  });
  return unit;
};

/** Reingresa una unidad liberada al inventario (bodega o local). */
export const reingresarUnit = (
  db: Db,
  actor: Actor,
  input: { id: string; status: "en_bodega" | "en_local"; motivo?: string },
): Unit => {
  requireAdmin(actor);
  const unit = findUnit(db, input.id);
  if (unit.status !== "liberado") throw new DomainError("errors.unitNotLiberada");

  unit.status = input.status;
  logMovement(db, actor, {
    productId: unit.productId,
    unitId: unit.id,
    type: "entrada",
    referenceType: "manual",
    notes: input.motivo?.trim() || "Reingreso al sistema",
  });
  logAudit(db, actor, {
    action: "status",
    entity: "unit",
    entityId: unit.id,
    details: `${unit.serial} · reingresado a ${input.status}`,
  });
  return unit;
};

/** Corrige el serial/IMEI mal escrito sin perder el historial de la unidad. */
export const corregirUnitSerial = (
  db: Db,
  actor: Actor,
  input: { id: string; nuevoSerial: string; motivo?: string },
): Unit => {
  requireAdmin(actor);
  const unit = findUnit(db, input.id);
  let nuevo = requireText(input.nuevoSerial, "errors.serialRequired");
  // Los celulares se identifican por IMEI válido (15 dígitos + Luhn) o por un código
  // interno (ceros al inicio) asignado a equipos que llegaron sin serial.
  if (db.products.find((p) => p.id === unit.productId)?.categoria === "celular") {
    const errorImei = errorDeSerialCelular(nuevo);
    if (errorImei) throw new DomainError(errorImei);
    nuevo = normalizarImei(nuevo);
  }
  if (isSameText(nuevo, unit.serial)) throw new DomainError("errors.serialIgual");
  if (db.units.some((other) => other.id !== unit.id && isSameText(other.serial, nuevo))) {
    throw new DomainError("errors.serialAlreadyInStock", { serial: nuevo });
  }
  const anterior = unit.serial;
  unit.serial = nuevo;
  logMovement(db, actor, {
    productId: unit.productId,
    unitId: unit.id,
    type: "correccion",
    referenceType: "manual",
    notes: input.motivo?.trim() || `Corrección de ${anterior} a ${nuevo}`,
  });
  logAudit(db, actor, {
    action: "update",
    entity: "unit",
    entityId: unit.id,
    details: `${anterior} → ${nuevo}`,
  });
  return unit;
};

/** Reporta una novedad sobre una unidad (queda en auditoría). */
export const reportarNovedad = (
  db: Db,
  actor: Actor,
  input: { id: string; descripcion: string },
): Unit => {
  requirePermission(actor, "inventory.manage");
  const unit = findUnit(db, input.id);
  const descripcion = requireText(input.descripcion, "errors.novedadRequired");
  const id = createId();
  db.auditLogs.unshift({
    id,
    userId: actor.id,
    userEmail: actor.email,
    action: "update",
    entity: "unit",
    entityId: unit.id,
    details: `Novedad en ${unit.serial}: ${descripcion}`,
    createdAt: nowIso(),
  });
  unit.notes = unit.notes ? `${unit.notes}\n${descripcion}` : descripcion;
  return unit;
};

export interface LiberarLoteResultado {
  imei: string;
  resultado: "liberado" | "no_encontrado" | "ya_liberado" | "no_permitido";
  detalle: string;
}

/** Libera varios seriales a la vez pegando una lista (solo administradores). */
export const liberarUnitsLote = (
  db: Db,
  actor: Actor,
  input: { imeis: string[]; motivo?: string },
): LiberarLoteResultado[] => {
  requireAdmin(actor);
  const motivo = input.motivo?.trim() || undefined;
  return input.imeis.map((imei) => {
    const unit = db.units.find((item) => isSameText(item.serial, imei));
    if (!unit) {
      return { imei, resultado: "no_encontrado", detalle: "No existe en el sistema" };
    }
    if (unit.status === "liberado") {
      return { imei, resultado: "ya_liberado", detalle: "Ya estaba liberado" };
    }
    if (!LIBERABLES.includes(unit.status)) {
      return {
        imei,
        resultado: "no_permitido",
        detalle: `En estado ${unit.status}: vendido, en garantía o en traslado`,
      };
    }
    try {
      assertNotComprometida(db, unit);
    } catch (error) {
      if (error instanceof DomainError) {
        return {
          imei,
          resultado: "no_permitido",
          detalle: "Está apartada en un pedido en preparación",
        };
      }
      throw error;
    }
    unit.status = "liberado";
    logMovement(db, actor, {
      productId: unit.productId,
      unitId: unit.id,
      type: "liberacion",
      referenceType: "manual",
      notes: motivo || "Liberado por lote",
    });
    logAudit(db, actor, {
      action: "status",
      entity: "unit",
      entityId: unit.id,
      details: `${unit.serial} · liberado (lote)`,
    });
    return { imei, resultado: "liberado", detalle: motivo ?? "Liberado" };
  });
};
