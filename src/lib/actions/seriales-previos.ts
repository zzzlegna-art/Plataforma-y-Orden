/**
 * Seriales previos: registro de equipos vendidos antes de la plataforma.
 * Sirve como referencia para garantías previas y consultas del historial.
 */

import { createId, DomainError, logAudit, nowIso } from "../db";
import type { Actor, Db, SerialPrevio } from "../types";

const requireAdmin = (actor: Actor) => {
  if (actor.role !== "admin") throw new DomainError("errors.forbidden");
};

/**
 * Importa una lista de seriales pegada desde Excel. Los que ya existan
 * (en la lista o en el registro) se omiten y se cuentan como duplicados.
 */
export const importarSerialesPrevios = (
  db: Db,
  actor: Actor,
  input: { seriales: string[]; notas?: string },
): { importados: number; duplicados: number } => {
  requireAdmin(actor);
  if (input.seriales.length > 20_000) {
    throw new DomainError("errors.saveFailed", { detalle: "Máximo 20.000 seriales por lote." });
  }
  const notas = input.notas?.trim() || undefined;
  let importados = 0;
  let duplicados = 0;
  const vistos = new Set<string>();
  const existentes = new Set(db.serialesPrevios.map((item) => item.serial.trim().toLocaleLowerCase()));

  input.seriales.forEach((raw) => {
    const serial = raw.trim();
    if (!serial) return;
    const clave = serial.toLocaleLowerCase();
    if (vistos.has(clave) || existentes.has(clave)) {
      duplicados += 1;
      return;
    }
    vistos.add(clave);
    const item: SerialPrevio = {
      id: createId(),
      serial,
      notas,
      createdBy: actor.id,
      createdAt: nowIso(),
    };
    db.serialesPrevios.push(item);
    importados += 1;
  });

  if (importados > 0) {
    logAudit(db, actor, {
      action: "create",
      entity: "serial_previo",
      // Sin entityId: la columna es uuid y este registro no corresponde a una sola fila.
      details: `${importados} seriales previos importados (lote)`,
    });
  }
  return { importados, duplicados };
};

/** Elimina un serial previo del registro (solo administradores). */
export const eliminarSerialPrevio = (db: Db, actor: Actor, input: { id: string }) => {
  requireAdmin(actor);
  const item = db.serialesPrevios.find((entry) => entry.id === input.id);
  if (!item) throw new DomainError("errors.notFound");
  db.serialesPrevios = db.serialesPrevios.filter((entry) => entry.id !== item.id);
  logAudit(db, actor, {
    action: "delete",
    entity: "serial_previo",
    entityId: item.id,
    details: item.serial,
  });
};
