/** Acciones de recepción de mercancía (entrada de stock por serial/IMEI). */

import {
  createId,
  DomainError,
  logAudit,
  logMovement,
  nextSequentialCode,
  nowIso,
} from "../db";
import type { Actor, Db, Reception, ReceptionItem, Unit, UnitCondition } from "../types";
import { errorDeSerialCelular, normalizarImei } from "../imei";
import { esProductoRepuesto } from "../products";
import { isSameText, requirePermission, requireText } from "./guards";

const findReception = (db: Db, id: string) => {
  const reception = db.receptions.find((item) => item.id === id);
  if (!reception) throw new DomainError("errors.notFound");
  return reception;
};

const assertEditable = (reception: Reception) => {
  if (reception.status !== "captura") {
    throw new DomainError("errors.receptionNotEditable");
  }
};

/**
 * Unidad ACTIVA con ese serial. Las unidades liberadas quedan fuera del
 * inventario, así que su serial puede volver a entrar por recepción (se
 * reactiva la misma unidad para no duplicar seriales).
 */
const unitActivaPorSerial = (db: Db, serial: string) =>
  db.units.find((unit) => isSameText(unit.serial, serial) && unit.status !== "liberado");

const unitLiberadaPorSerial = (db: Db, serial: string) =>
  db.units.find((unit) => isSameText(unit.serial, serial) && unit.status === "liberado");

export const receptionItems = (db: Db, receptionId: string) =>
  db.receptionItems.filter((item) => item.receptionId === receptionId);

export const createReception = (
  db: Db,
  actor: Actor,
  input: { reference?: string; receivedAt?: string; notes?: string },
): Reception => {
  requirePermission(actor, "receptions.manage");
  const reception: Reception = {
    id: createId(),
    code: nextSequentialCode(
      db.receptions.map((item) => item.code),
      "REC",
    ),
    reference: input.reference?.trim() || undefined,
    status: "captura",
    receivedAt: input.receivedAt || nowIso(),
    notes: input.notes?.trim() || undefined,
    createdBy: actor.id,
    createdAt: nowIso(),
  };
  db.receptions.unshift(reception);
  return reception;
};

export const updateReception = (
  db: Db,
  actor: Actor,
  input: { id: string; reference?: string; receivedAt?: string; notes?: string },
) => {
  requirePermission(actor, "receptions.manage");
  const reception = findReception(db, input.id);
  assertEditable(reception);
  reception.reference = input.reference?.trim() || undefined;
  reception.receivedAt = input.receivedAt || reception.receivedAt;
  reception.notes = input.notes?.trim() || undefined;
  return reception;
};

/** Siguiente serial interno para repuestos: REP-0001, REP-0002, … */
const nextRepuestoSecuencial = (db: Db) => {
  const seriales = [
    ...db.units.map((unit) => unit.serial),
    ...db.receptionItems.map((item) => item.serial),
  ];
  const max = seriales.reduce((highest, serial) => {
    const match = /^REP-(\d+)$/.exec((serial ?? "").trim());
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `REP-${String(max + 1).padStart(4, "0")}`;
};

/**
 * Agrega una línea de captura. Los celulares/tablets/relojes entran por
 * serial/IMEI (uno por llamada); los repuestos entran por cantidad y se les
 * genera un serial interno (REP-####) para que sigan siendo unidades.
 */
export const addReceptionItem = (
  db: Db,
  actor: Actor,
  input: {
    receptionId: string;
    productId: string;
    serial?: string;
    condition: UnitCondition;
    cost?: number;
    quantity?: number;
  },
): ReceptionItem[] => {
  requirePermission(actor, "receptions.manage");
  const reception = findReception(db, input.receptionId);
  assertEditable(reception);
  const product = db.products.find((item) => item.id === input.productId);
  if (!product) throw new DomainError("errors.productRequired");

  const isRepuesto = esProductoRepuesto(db, product);
  const quantity = isRepuesto
    ? Math.min(Math.max(Math.trunc(input.quantity ?? 1), 1), 500)
    : 1;

  const items: ReceptionItem[] = [];
  for (let index = 0; index < quantity; index += 1) {
    let serial = input.serial?.trim() ?? "";
    if (isRepuesto) {
      serial = nextRepuestoSecuencial(db);
    } else {
      serial = requireText(serial, "errors.serialRequired");
      // Los celulares entran con IMEI de 15 dígitos, o un código interno si llegan
      // apagados y todavía no se les puede leer el IMEI (se corrige después).
      if (product.categoria === "celular") {
        const errorImei = errorDeSerialCelular(serial);
        if (errorImei) throw new DomainError(errorImei);
        serial = normalizarImei(serial);
      }
      if (serial.length < 5) throw new DomainError("errors.serialTooShort");

      const duplicatedHere = db.receptionItems.some(
        (item) =>
          item.receptionId === input.receptionId &&
          isSameText(item.serial, serial),
      );
      if (duplicatedHere) throw new DomainError("errors.serialDuplicateInReception");

      const existsInStock = unitActivaPorSerial(db, serial);
      if (existsInStock) throw new DomainError("errors.serialAlreadyInStock", { serial });
    }

    const item: ReceptionItem = {
      id: createId(),
      receptionId: input.receptionId,
      productId: input.productId,
      serial,
      condition: input.condition,
      cost: input.cost !== undefined && input.cost > 0 ? input.cost : undefined,
      createdAt: nowIso(),
    };
    db.receptionItems.push(item);
    items.push(item);
  }
  return items;
};

export const updateReceptionItem = (
  db: Db,
  actor: Actor,
  input: { id: string; productId?: string; serial?: string; condition?: UnitCondition },
) => {
  requirePermission(actor, "receptions.manage");
  const item = db.receptionItems.find((row) => row.id === input.id);
  if (!item) throw new DomainError("errors.notFound");
  assertEditable(findReception(db, item.receptionId));

  const productoFinal = db.products.find(
    (product) => product.id === (input.productId ?? item.productId),
  );
  const esCelular = productoFinal?.categoria === "celular";
  if (esCelular && (input.serial !== undefined || input.productId)) {
    const errorImei = errorDeSerialCelular(input.serial ?? item.serial);
    if (errorImei) throw new DomainError(errorImei);
  }

  if (input.serial !== undefined) {
    let serial = requireText(input.serial, "errors.serialRequired");
    if (esCelular) serial = normalizarImei(serial);
    if (serial.length < 5) throw new DomainError("errors.serialTooShort");
    const duplicatedHere = db.receptionItems.some(
      (row) =>
        row.id !== item.id &&
        row.receptionId === item.receptionId &&
        isSameText(row.serial, serial),
    );
    if (duplicatedHere) throw new DomainError("errors.serialDuplicateInReception");
    if (unitActivaPorSerial(db, serial)) {
      throw new DomainError("errors.serialAlreadyInStock", { serial });
    }
    item.serial = serial;
  }
  if (input.productId) item.productId = input.productId;
  if (input.condition) item.condition = input.condition;
  return item;
};

export const removeReceptionItem = (
  db: Db,
  actor: Actor,
  input: { id: string },
) => {
  requirePermission(actor, "receptions.manage");
  const item = db.receptionItems.find((row) => row.id === input.id);
  if (!item) throw new DomainError("errors.notFound");
  assertEditable(findReception(db, item.receptionId));
  db.receptionItems = db.receptionItems.filter((row) => row.id !== item.id);
};

export const discardReception = (db: Db, actor: Actor, input: { id: string }) => {
  requirePermission(actor, "receptions.manage");
  const reception = findReception(db, input.id);
  assertEditable(reception);
  db.receptionItems = db.receptionItems.filter(
    (item) => item.receptionId !== reception.id,
  );
  db.receptions = db.receptions.filter((item) => item.id !== reception.id);
  logAudit(db, actor, {
    action: "discard",
    entity: "reception",
    entityId: reception.id,
    details: reception.code,
  });
};

/**
 * Confirmar una recepción crea una unidad disponible por cada serial capturado
 * y registra el movimiento de entrada. Si el serial corresponde a una unidad
 * liberada, se reactiva esa misma unidad (no se duplica el serial).
 */
export const confirmReception = (
  db: Db,
  actor: Actor,
  input: { id: string },
): Reception => {
  requirePermission(actor, "receptions.manage");
  const reception = findReception(db, input.id);
  assertEditable(reception);

  const items = receptionItems(db, reception.id);
  if (items.length === 0) throw new DomainError("errors.receptionEmpty");

  const serials = items.map((item) => item.serial);
  const duplicated = serials.find(
    (serial, index) =>
      serials.findIndex((other) => isSameText(other, serial)) !== index,
  );
  if (duplicated) {
    throw new DomainError("errors.serialDuplicateInReception");
  }
  const alreadyInStock = items.find((item) => unitActivaPorSerial(db, item.serial));
  if (alreadyInStock) {
    throw new DomainError("errors.serialAlreadyInStock", {
      serial: alreadyInStock.serial,
    });
  }

  const confirmedAt = nowIso();
  items.forEach((item) => {
    const liberada = unitLiberadaPorSerial(db, item.serial);
    if (liberada) {
      // Reingreso: se reactiva la unidad existente conservando su historial.
      liberada.productId = item.productId;
      liberada.condition = item.condition;
      liberada.cost = item.cost;
      liberada.status = "en_bodega";
      liberada.receptionId = reception.id;
      liberada.location = undefined;
      liberada.receivedAt = reception.receivedAt;
      liberada.createdBy = actor.id;
      logMovement(db, actor, {
        productId: liberada.productId,
        unitId: liberada.id,
        type: "entrada",
        referenceType: "recepcion",
        referenceId: reception.id,
        notes: `Reingreso por recepción ${reception.code}`,
        createdAt: confirmedAt,
      });
      return;
    }

    const unit: Unit = {
      id: createId(),
      productId: item.productId,
      serial: item.serial,
      condition: item.condition,
      cost: item.cost,
      status: "en_bodega",
      receptionId: reception.id,
      receivedAt: reception.receivedAt,
      createdBy: actor.id,
    };
    db.units.push(unit);
    logMovement(db, actor, {
      productId: unit.productId,
      unitId: unit.id,
      type: "entrada",
      referenceType: "recepcion",
      referenceId: reception.id,
      notes: `Entrada por recepción ${reception.code}`,
      createdAt: confirmedAt,
    });
  });

  reception.status = "confirmada";
  reception.confirmedAt = confirmedAt;
  db.receptionItems = db.receptionItems.filter(
    (item) => item.receptionId !== reception.id,
  );

  logAudit(db, actor, {
    action: "confirm",
    entity: "reception",
    entityId: reception.id,
    details: `${reception.code} · ${items.length} unidades`,
  });
  return reception;
};
