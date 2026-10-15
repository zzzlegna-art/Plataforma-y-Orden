/**
 * Acciones de garantías (flujo avanzado basado en el prototipo Bodega 6A):
 * recepción por IMEI (uno/lote), por pedido, garantía previa y falla en
 * inventario; envío a técnico externo; diagnóstico con resolución y costo;
 * entrega al cliente (con reemplazo) o devolución.
 */

import { createId, DomainError, logAudit, logMovement, nextDailyCode, nowIso } from "../db";
import type {
  Actor,
  Db,
  Technician,
  Unit,
  Warranty,
  WarrantyEvent,
  WarrantyResolution,
  WarrantyStatus,
} from "../types";
import { isSameText, requirePermission, requireText } from "./guards";

/** Estados del caso que siguen en trámite. */
export const isOpenWarranty = (status: WarrantyStatus) =>
  status === "recibido" ||
  status === "en_servicio_tecnico" ||
  status === "reenvio_pendiente";

/**
 * Si la garantía tiene a quién entregarle el equipo: un cliente registrado, un pedido o, en una
 * garantía previa, el cliente escrito a mano. Sin ninguno de los tres es una falla de inventario.
 * (Antes se ignoraba el cliente manual y una garantía previa se trataba como falla de inventario.)
 */
export const garantiaTieneCliente = (
  warranty: Pick<Warranty, "customerId" | "orderId" | "clienteManual">,
): boolean => Boolean(warranty.customerId || warranty.orderId || warranty.clienteManual?.trim());

const findWarranty = (db: Db, id: string) => {
  const warranty = db.warranties.find((item) => item.id === id);
  if (!warranty) throw new DomainError("errors.notFound");
  return warranty;
};

const findUnitBySerial = (db: Db, serial: string) =>
  db.units.find((unit) => isSameText(unit.serial, serial));

const addEvent = (
  db: Db,
  actor: Actor,
  warrantyId: string,
  status: WarrantyStatus,
  notes?: string,
): WarrantyEvent => {
  const event: WarrantyEvent = {
    id: createId(),
    warrantyId,
    status,
    notes: notes?.trim() || undefined,
    createdBy: actor.id,
    createdAt: nowIso(),
  };
  db.warrantyEvents.push(event);
  return event;
};

const newCode = (db: Db) =>
  nextDailyCode(db.warranties.map((item) => item.code), "GAR");

/** Encuentra el pedido/venta entregado al que pertenece una unidad. */
const findSaleForUnit = (db: Db, unitId: string) => {
  const row = db.orderItemUnits.find((r) => r.unitId === unitId);
  if (!row) return undefined;
  const item = db.orderItems.find((i) => i.id === row.orderItemId);
  if (!item) return undefined;
  const order = db.orders.find((o) => o.id === item.orderId && o.status === "despachado");
  return order;
};

/** Valida que la unidad de reemplazo exista, esté disponible y sea del producto del caso. */
const requireReplacement = (db: Db, warranty: Warranty, replacementUnitId?: string): Unit => {
  const replacement = replacementUnitId
    ? db.units.find((item) => item.id === replacementUnitId)
    : undefined;
  if (!replacement) throw new DomainError("errors.replacementRequired");
  if (replacement.status !== "en_bodega" && replacement.status !== "en_local") {
    throw new DomainError("errors.unitNotAvailable", { serial: replacement.serial });
  }
  // En una garantía previa no hay producto en el sistema: no hay con qué compararlo.
  if (warranty.productId && replacement.productId !== warranty.productId) {
    throw new DomainError("errors.unitProductMismatch");
  }
  return replacement;
};

/** Pedido (de cualquier estado) al que está asignada una unidad, si lo hay. */
const pedidoDeUnidad = (db: Db, unitId: string) => {
  const fila = db.orderItemUnits.find((row) => row.unitId === unitId);
  const linea = fila ? db.orderItems.find((item) => item.id === fila.orderItemId) : undefined;
  return linea ? db.orders.find((order) => order.id === linea.orderId) : undefined;
};

/**
 * Garantía previa: el equipo del cliente nunca estuvo en el sistema. Cuando queda en manos de la
 * bodega (cambio de equipo o devolución), se da de alta como unidad disponible para poder venderla
 * y consultar su historial. Si el serial ya existía como "liberado" se reutiliza; si ya está
 * activo en el inventario no se toca. Devuelve la unidad solo si la dio de alta o la reactivó.
 */
const darDeAltaEquipoPrevio = (
  db: Db,
  actor: Actor,
  warranty: Warranty,
  productId: string,
  nota: string,
): Unit | undefined => {
  const serial = warranty.imeiManual;
  if (!serial) return undefined;
  const existente = findUnitBySerial(db, serial);
  if (existente && existente.status !== "liberado") return undefined;
  const unidad: Unit = existente ?? {
    id: createId(),
    productId,
    serial,
    condition: "seminuevo",
    status: "en_bodega",
    receivedAt: nowIso(),
    createdBy: actor.id,
  };
  unidad.status = "en_bodega";
  if (!existente) db.units.push(unidad);
  logMovement(db, actor, {
    productId: unidad.productId,
    unitId: unidad.id,
    type: "entrada",
    referenceType: "garantia",
    referenceId: warranty.id,
    notes: nota,
  });
  return unidad;
};

/** Producto del catálogo cuyo nombre coincide exactamente con la referencia escrita a mano. */
const productoPorReferencia = (db: Db, referencia?: string): string | undefined => {
  if (!referencia?.trim()) return undefined;
  const coincidencias = db.products.filter((product) => isSameText(product.name, referencia));
  return coincidencias.length === 1 ? coincidencias[0].id : undefined;
};

const assertNoOpenWarranty = (db: Db, unit: Unit) => {
  const open = db.warranties.find(
    (warranty) => warranty.unitId === unit.id && isOpenWarranty(warranty.status),
  );
  if (open) throw new DomainError("errors.warrantyOpen", { code: open.code });
};

const receiveUnit = (
  db: Db,
  actor: Actor,
  unit: Unit,
  reason: string,
  saleOrder?: ReturnType<typeof findSaleForUnit>,
): Warranty => {
  const warranty: Warranty = {
    id: createId(),
    code: newCode(db),
    unitId: unit.id,
    productId: unit.productId,
    customerId: saleOrder?.customerId,
    orderId: saleOrder?.id,
    reason,
    status: "recibido",
    receivedAt: nowIso(),
    createdBy: actor.id,
  };
  db.warranties.unshift(warranty);
  unit.status = "en_reparacion";
  logMovement(db, actor, {
    productId: unit.productId,
    unitId: unit.id,
    type: "garantia",
    referenceType: "garantia",
    referenceId: warranty.id,
    notes: `Equipo recibido en garantía ${warranty.code}`,
  });
  addEvent(db, actor, warranty.id, "recibido", reason);
  logAudit(db, actor, {
    action: "create",
    entity: "warranty",
    entityId: warranty.id,
    details: `${warranty.code} · ${unit.serial}`,
  });
  return warranty;
};

export interface WarrantyItemInput {
  imei: string;
  observacion: string;
}

export interface WarrantyItemResult {
  imei: string;
  ok: boolean;
  motivo_error?: string;
  /** Parámetros del mensaje de error (serial, código del caso abierto…). */
  motivo_params?: Record<string, string | number>;
  /** Id de la garantía creada, si ok. Sirve para enlazar los documentos del lote. */
  warrantyId?: string;
}

/** Convierte un error de una fila del lote en el resultado que ve la pantalla. */
const resultadoConError = (imei: string, error: unknown): WarrantyItemResult =>
  error instanceof DomainError
    ? { imei, ok: false, motivo_error: error.key, motivo_params: error.params }
    : { imei, ok: false, motivo_error: "errors.unexpected" };

/**
 * Recibe en garantía un equipo vendido (por IMEI). La unidad pasa a
 * "en_reparacion" y sale del inventario activo.
 */
export const createWarrantyByImei = (
  db: Db,
  actor: Actor,
  input: { imei: string; observacion: string },
): Warranty => {
  requirePermission(actor, "warranties.manage");
  const unit = findUnitBySerial(db, input.imei);
  if (!unit) throw new DomainError("errors.unitNotFound", { serial: input.imei });
  if (unit.status !== "vendido" && unit.status !== "entregado_garantia") {
    throw new DomainError("errors.unitNotReturnable", { serial: input.imei });
  }
  assertNoOpenWarranty(db, unit);
  const reason = requireText(input.observacion, "errors.warrantyReasonRequired");
  return receiveUnit(db, actor, unit, reason, findSaleForUnit(db, unit.id));
};

/** Recibe varios equipos en garantía; devuelve el resultado por IMEI. */
export const createWarrantiesByImeis = (
  db: Db,
  actor: Actor,
  input: { items: WarrantyItemInput[] },
): WarrantyItemResult[] =>
  input.items.map((item) => {
    try {
      const warranty = createWarrantyByImei(db, actor, item);
      return { imei: item.imei, ok: true, warrantyId: warranty.id };
    } catch (error) {
      return resultadoConError(item.imei, error);
    }
  });

/** Recibe en garantía equipos de un pedido entregado específico. */
export const createWarrantyByOrder = (
  db: Db,
  actor: Actor,
  input: { orderId: string; items: WarrantyItemInput[] },
): number => {
  requirePermission(actor, "warranties.manage");
  const order = db.orders.find((item) => item.id === input.orderId);
  if (!order) throw new DomainError("errors.notFound");
  const orderUnits = new Set(
    db.orderItemUnits
      .filter((row) =>
        db.orderItems.some((item) => item.id === row.orderItemId && item.orderId === order.id),
      )
      .map((row) => row.unitId),
  );
  let count = 0;
  input.items.forEach((item) => {
    const unit = findUnitBySerial(db, item.imei);
    if (!unit || !orderUnits.has(unit.id)) {
      throw new DomainError("errors.unitNotInOrder", { serial: item.imei });
    }
    if (unit.status !== "vendido" && unit.status !== "entregado_garantia") {
      throw new DomainError("errors.unitNotReturnable", { serial: item.imei });
    }
    assertNoOpenWarranty(db, unit);
    const reason = requireText(item.observacion, "errors.warrantyReasonRequired");
    receiveUnit(db, actor, unit, reason, order);
    count += 1;
  });
  return count;
};

/**
 * "Garantía previa": reclamo de un equipo vendido antes de la plataforma.
 * No existe unidad en el sistema; el caso se guarda con datos manuales.
 */
export const createWarrantyPrevia = (
  db: Db,
  actor: Actor,
  input: {
    imeiManual: string;
    referenciaManual: string;
    clienteManual: string;
    fechaVentaManual?: string;
    observacion: string;
  },
): Warranty => {
  requirePermission(actor, "warranties.manage");
  const imeiManual = requireText(input.imeiManual, "errors.serialRequired");
  // Si el equipo ya existe en el inventario debe recibirse por IMEI (queda ligado a su venta).
  // Las unidades "liberado" cuentan como fuera del sistema (su serial ya puede reutilizarse en
  // otra unidad), así que no bloquean la garantía previa.
  const unidadExistente = findUnitBySerial(db, imeiManual);
  if (unidadExistente && unidadExistente.status !== "liberado") {
    throw new DomainError("errors.previaSerialInSystem", { serial: imeiManual });
  }
  const abierta = db.warranties.find(
    (item) =>
      item.imeiManual !== undefined &&
      isSameText(item.imeiManual, imeiManual) &&
      isOpenWarranty(item.status),
  );
  if (abierta) throw new DomainError("errors.warrantyOpen", { code: abierta.code });
  const warranty: Warranty = {
    id: createId(),
    code: newCode(db),
    reason: requireText(input.observacion, "errors.warrantyReasonRequired"),
    status: "recibido",
    receivedAt: nowIso(),
    imeiManual,
    referenciaManual: requireText(input.referenciaManual, "errors.referenciaManualRequired"),
    clienteManual: requireText(input.clienteManual, "errors.clienteManualRequired"),
    fechaVentaManual: input.fechaVentaManual || undefined,
    createdBy: actor.id,
  };
  db.warranties.unshift(warranty);
  addEvent(db, actor, warranty.id, "recibido", warranty.reason);
  logAudit(db, actor, {
    action: "create",
    entity: "warranty",
    entityId: warranty.id,
    details: `${warranty.code} · previa ${imeiManual}`,
  });
  return warranty;
};

export interface WarrantyPreviaItemInput {
  imeiManual: string;
  referenciaManual: string;
  clienteManual: string;
  fechaVentaManual?: string;
  observacion: string;
}

/** Recibe varias garantías previas a la vez; devuelve el resultado por IMEI (igual que un lote por IMEI). */
export const createWarrantiesPrevias = (
  db: Db,
  actor: Actor,
  input: { items: WarrantyPreviaItemInput[] },
): WarrantyItemResult[] =>
  input.items.map((item) => {
    try {
      const warranty = createWarrantyPrevia(db, actor, item);
      return { imei: item.imeiManual, ok: true, warrantyId: warranty.id };
    } catch (error) {
      return resultadoConError(item.imeiManual, error);
    }
  });

/**
 * Falla en inventario: un equipo en bodega o local presenta falla sin haberse
 * vendido. Se registra la garantía y pasa a reparación.
 */
export const createWarrantyFallaInventario = (
  db: Db,
  actor: Actor,
  input: { items: WarrantyItemInput[] },
): WarrantyItemResult[] =>
  input.items.map((item) => {
    try {
      requirePermission(actor, "warranties.manage");
      const unit = findUnitBySerial(db, item.imei);
      if (!unit) throw new DomainError("errors.unitNotFound", { serial: item.imei });
      if (unit.status !== "en_bodega" && unit.status !== "en_local") {
        throw new DomainError("errors.unitNotInInventory", { serial: item.imei });
      }
      assertNoOpenWarranty(db, unit);
      const reason = requireText(item.observacion, "errors.warrantyReasonRequired");
      const warranty = receiveUnit(db, actor, unit, reason);
      return { imei: item.imei, ok: true, warrantyId: warranty.id };
    } catch (error) {
      return resultadoConError(item.imei, error);
    }
  });

/** Envía garantías recibidas al técnico externo seleccionado. */
export const enviarATecnico = (
  db: Db,
  actor: Actor,
  input: { warrantyIds: string[]; tecnicoId: string },
): number => {
  requirePermission(actor, "warranties.manage");
  const tecnico = db.tecnicos.find((item) => item.id === input.tecnicoId);
  if (!tecnico) throw new DomainError("errors.tecnicoRequired");
  let count = 0;
  input.warrantyIds.forEach((id) => {
    const warranty = findWarranty(db, id);
    if (warranty.status !== "recibido") return;
    warranty.tecnicoId = tecnico.id;
    warranty.status = "en_servicio_tecnico";
    addEvent(db, actor, warranty.id, "en_servicio_tecnico", `Enviado a ${tecnico.nombre}`);
    logAudit(db, actor, {
      action: "status",
      entity: "warranty",
      entityId: warranty.id,
      details: `${warranty.code} · a técnico (${tecnico.nombre})`,
    });
    count += 1;
  });
  return count;
};

/**
 * Registra el diagnóstico del taller: texto, resolución y costo.
 * `sin_falla` y `defectuoso` devuelven la unidad a inventario al instante;
 * `reparado`/`cambio` (este último con el serial del reemplazo) dejan el caso en "reenvío pendiente" hasta entregar.
 */
export const registrarDiagnostico = (
  db: Db,
  actor: Actor,
  input: {
    warrantyId: string;
    diagnostico: string;
    resolucion: WarrantyResolution;
    costo?: number;
    /** Obligatoria cuando la resolución es "cambio": el equipo que se entregará. */
    replacementUnitId?: string;
  },
): Warranty => {
  requirePermission(actor, "warranties.manage");
  const warranty = findWarranty(db, input.warrantyId);
  if (warranty.status !== "recibido" && warranty.status !== "en_servicio_tecnico") {
    throw new DomainError("errors.invalidTransition");
  }
  const diagnostico = requireText(input.diagnostico, "errors.diagnosticoRequired");
  // Con "cambio" se pide el serial del reemplazo ya en el diagnóstico (antes de tocar nada).
  const replacement =
    input.resolucion === "cambio"
      ? requireReplacement(db, warranty, input.replacementUnitId)
      : undefined;
  warranty.diagnostico = diagnostico;
  warranty.resolucion = input.resolucion;
  warranty.replacementUnitId = replacement?.id;
  warranty.costo = input.costo && input.costo > 0 ? input.costo : undefined;

  const unit = warranty.unitId
    ? db.units.find((item) => item.id === warranty.unitId)
    : undefined;
  if (unit) {
    if (input.resolucion === "sin_falla" && unit.status === "en_reparacion") {
      unit.status = "en_bodega";
      // Vuelve a ser stock de la bodega, no del cliente que lo compró: si queda ligada a esa
      // venta, una futura garantía sobre este mismo serial mostraría a ese cliente por error.
      db.orderItemUnits = db.orderItemUnits.filter((row) => row.unitId !== unit.id);
      logMovement(db, actor, {
        productId: unit.productId,
        unitId: unit.id,
        type: "devolucion",
        referenceType: "garantia",
        referenceId: warranty.id,
        notes: `Sin falla encontrada, devuelto a bodega (${warranty.code})`,
      });
    }
    if (input.resolucion === "defectuoso" && unit.status === "en_reparacion") {
      unit.status = "defectuoso";
      // Igual que arriba: queda como stock defectuoso de la bodega, no del cliente.
      db.orderItemUnits = db.orderItemUnits.filter((row) => row.unitId !== unit.id);
      logMovement(db, actor, {
        productId: unit.productId,
        unitId: unit.id,
        type: "ajuste",
        referenceType: "garantia",
        referenceId: warranty.id,
        notes: `Defectuoso sin solución (${warranty.code})`,
      });
    }
  }

  warranty.status = "reenvio_pendiente";
  addEvent(
    db,
    actor,
    warranty.id,
    "reenvio_pendiente",
    `${input.resolucion}${input.costo ? ` · costo ${input.costo}` : ""}`,
  );
  logAudit(db, actor, {
    action: "resolve",
    entity: "warranty",
    entityId: warranty.id,
    details: `${warranty.code} · diagnóstico: ${input.resolucion}`,
  });
  return warranty;
};

/**
 * Estado al que volvería un caso si se deshace su último paso, o `null` si no se puede deshacer
 * desde la plataforma. Solo se deshacen pasos que NO movieron inventario:
 * - en servicio técnico -> recibido (se quita el técnico asignado)
 * - reenvío pendiente -> en servicio técnico (si pasó por un técnico) o recibido, siempre que el
 *   diagnóstico fuera "reparado" o "cambio". Un diagnóstico "sin falla" o "defectuoso" ya devolvió
 *   el equipo al inventario y lo desvinculó de su venta, así que no se revierte con un botón.
 * Entregado y devuelto tampoco: mueven unidades.
 */
export const estadoAnteriorGarantia = (
  warranty: Pick<Warranty, "status" | "resolucion" | "tecnicoId">,
): WarrantyStatus | null => {
  if (warranty.status === "en_servicio_tecnico") return "recibido";
  if (warranty.status === "reenvio_pendiente") {
    if (warranty.resolucion !== "reparado" && warranty.resolucion !== "cambio") return null;
    return warranty.tecnicoId ? "en_servicio_tecnico" : "recibido";
  }
  return null;
};

/** Devuelve un caso al estado anterior (ver `estadoAnteriorGarantia`) y deja el rastro en el historial. */
export const deshacerEstadoGarantia = (
  db: Db,
  actor: Actor,
  input: { warrantyId: string },
): Warranty => {
  requirePermission(actor, "warranties.manage");
  const warranty = findWarranty(db, input.warrantyId);
  const anterior = estadoAnteriorGarantia(warranty);
  if (!anterior) throw new DomainError("errors.undoNotAllowed");
  const desde = warranty.status;
  if (desde === "reenvio_pendiente") {
    // Se borra el diagnóstico para poder registrarlo de nuevo (sigue sin haber tocado inventario).
    warranty.diagnostico = undefined;
    warranty.resolucion = undefined;
    warranty.costo = undefined;
    warranty.replacementUnitId = undefined;
  }
  if (anterior === "recibido") warranty.tecnicoId = undefined;
  warranty.status = anterior;
  addEvent(db, actor, warranty.id, anterior, `Devuelto al estado anterior (desde ${desde})`);
  logAudit(db, actor, {
    action: "status",
    entity: "warranty",
    entityId: warranty.id,
    details: `${warranty.code} · deshecho: ${desde} -> ${anterior}`,
  });
  return warranty;
};

/**
 * Entrega la garantía al cliente. Con resolución "cambio" se elige la unidad de
 * reemplazo (mismo producto, en bodega/local): el reemplazo sale para el cliente y el equipo
 * original que trajo entra a la bodega, disponible para vender.
 */
export const entregarGarantia = (
  db: Db,
  actor: Actor,
  input: { warrantyId: string; replacementUnitId?: string; devolverABodega?: boolean },
): Warranty => {
  requirePermission(actor, "warranties.manage");
  const warranty = findWarranty(db, input.warrantyId);
  if (warranty.status !== "reenvio_pendiente") {
    throw new DomainError("errors.invalidTransition");
  }
  const unit = warranty.unitId
    ? db.units.find((item) => item.id === warranty.unitId)
    : undefined;

  if (warranty.resolucion === "cambio") {
    // Usa el serial elegido en el diagnóstico; si el caso es anterior a ese cambio, se elige aquí.
    const replacement = requireReplacement(
      db,
      warranty,
      input.replacementUnitId ?? warranty.replacementUnitId,
    );
    replacement.status = "entregado_garantia";
    logMovement(db, actor, {
      productId: replacement.productId,
      unitId: replacement.id,
      type: "salida",
      referenceType: "garantia",
      referenceId: warranty.id,
      notes: `Unidad de reemplazo entregada (${warranty.code})`,
    });
    if (unit) {
      // El equipo que trajo el cliente entra a la bodega (antes quedaba "liberado", fuera del
      // sistema, y había que reingresarlo a mano).
      unit.status = "en_bodega";
      // Ya no es "su" venta: si siguiera vinculado al pedido original, la ficha del serial lo
      // mostraría como si todavía fuera de este cliente, aunque ahora es de la bodega.
      db.orderItemUnits = db.orderItemUnits.filter((row) => row.unitId !== unit.id);
      logMovement(db, actor, {
        productId: unit.productId,
        unitId: unit.id,
        type: "entrada",
        referenceType: "garantia",
        referenceId: warranty.id,
        notes: `Equipo original recibido en bodega por cambio de equipo (${warranty.code})`,
      });
    } else if (warranty.imeiManual) {
      // Garantía previa: el cliente entrega su equipo a cambio del reemplazo, así que ahora es de
      // la bodega. Se toma el producto del reemplazo entregado (es un cambio de equipo).
      darDeAltaEquipoPrevio(
        db,
        actor,
        warranty,
        replacement.productId,
        `Equipo original recibido en bodega por cambio de equipo (${warranty.code})`,
      );
    }
  }

  // Una falla de inventario (sin cliente ni pedido) no se le entrega a nadie: el equipo
  // reparado vuelve a la bodega. Con cliente, el negocio también puede decidir no devolverlo.
  const sinCliente = !garantiaTieneCliente(warranty);
  const aBodega =
    warranty.resolucion === "reparado" &&
    Boolean(unit) &&
    (sinCliente || input.devolverABodega === true);

  if (warranty.resolucion === "reparado" && unit) {
    if (aBodega) {
      unit.status = "en_bodega";
      // Vuelve a ser mercancía de la bodega, no del cliente que lo envió.
      db.orderItemUnits = db.orderItemUnits.filter((row) => row.unitId !== unit.id);
      logMovement(db, actor, {
        productId: unit.productId,
        unitId: unit.id,
        type: "devolucion",
        referenceType: "garantia",
        referenceId: warranty.id,
        notes: sinCliente
          ? `Reparado y devuelto a bodega, sin cliente (${warranty.code})`
          : `Reparado; se decide no devolverlo al cliente, vuelve a bodega (${warranty.code})`,
      });
    } else {
      unit.status = "entregado_garantia";
      logMovement(db, actor, {
        productId: unit.productId,
        unitId: unit.id,
        type: "devolucion",
        referenceType: "garantia",
        referenceId: warranty.id,
        notes: `Reparado y entregado al cliente (${warranty.code})`,
      });
    }
  }

  warranty.status = "entregado";
  warranty.resolvedAt = nowIso();
  addEvent(
    db,
    actor,
    warranty.id,
    "entregado",
    aBodega ? "Reparado y devuelto a bodega" : "Entregado al cliente",
  );
  logAudit(db, actor, {
    action: "resolve",
    entity: "warranty",
    entityId: warranty.id,
    details: `${warranty.code} · ${aBodega ? "devuelto a bodega" : "entregado"}`,
  });
  return warranty;
};

/** Devuelve el equipo al local sin resolver (el caso queda cerrado como devuelto). */
export const devolverGarantia = (
  db: Db,
  actor: Actor,
  input: { warrantyId: string; motivo: string },
): Warranty => {
  requirePermission(actor, "warranties.manage");
  const warranty = findWarranty(db, input.warrantyId);
  if (!isOpenWarranty(warranty.status)) {
    throw new DomainError("errors.invalidTransition");
  }
  const unit = warranty.unitId
    ? db.units.find((item) => item.id === warranty.unitId)
    : undefined;
  const motivo = input.motivo?.trim();
  let detalle = motivo;
  if (unit && unit.status === "en_reparacion") {
    // Un equipo devuelto sin resolver vuelve físicamente a la bodega, no al local: así cuenta
    // en el control físico de la bodega y deja de figurar como mercancía del local.
    unit.status = "en_bodega";
    // Ya no es del cliente que lo devolvió (ver misma nota en
    // registrarDiagnostico/entregarGarantia). Queda aclarado en el historial a qué pedido
    // pertenecía, para que no parezca que el pedido sigue incluyéndolo.
    const pedido = pedidoDeUnidad(db, unit.id);
    db.orderItemUnits = db.orderItemUnits.filter((row) => row.unitId !== unit.id);
    if (pedido) {
      detalle = [motivo, `Sale del pedido ${pedido.code}`].filter(Boolean).join(" · ");
      logAudit(db, actor, {
        action: "update",
        entity: "order",
        entityId: pedido.id,
        details: `${unit.serial} devuelto a bodega por garantía ${warranty.code} y retirado del pedido ${pedido.code}`,
      });
    }
    logMovement(db, actor, {
      productId: unit.productId,
      unitId: unit.id,
      type: "devolucion",
      referenceType: "garantia",
      referenceId: warranty.id,
      notes: detalle || "Devolución sin resolución",
    });
  } else if (!unit && warranty.imeiManual) {
    // Garantía previa: no hay unidad en el sistema. Al devolverla a la bodega se da de alta como
    // disponible, con el producto del catálogo que coincide con la referencia escrita al recibirla.
    const productId = productoPorReferencia(db, warranty.referenciaManual);
    if (productId) {
      detalle = [motivo, "Ingresa a la bodega como disponible"].filter(Boolean).join(" · ");
      darDeAltaEquipoPrevio(
        db,
        actor,
        warranty,
        productId,
        `${motivo || "Devolución sin resolución"} (${warranty.code})`,
      );
    } else {
      detalle = [
        motivo,
        `No se pudo ingresar a la bodega: no hay un producto que coincida con «${warranty.referenciaManual ?? ""}»`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }
  warranty.status = "devuelto";
  warranty.resolvedAt = nowIso();
  addEvent(db, actor, warranty.id, "devuelto", detalle);
  logAudit(db, actor, {
    action: "resolve",
    entity: "warranty",
    entityId: warranty.id,
    details: `${warranty.code} · devuelto`,
  });
  return warranty;
};

/**
 * Corrige el cliente de un caso de garantía: puede vincularse a un cliente ya
 * registrado (customerId) o dejarse como texto manual (clienteManual) — por
 * ejemplo cuando se escribió mal al recibir una "garantía previa".
 */
export const actualizarClienteGarantia = (
  db: Db,
  actor: Actor,
  input: { warrantyId: string; customerId?: string; clienteManual?: string },
): Warranty => {
  requirePermission(actor, "warranties.manage");
  const warranty = findWarranty(db, input.warrantyId);

  const customerId = input.customerId?.trim() || undefined;
  if (customerId) {
    if (!db.customers.some((item) => item.id === customerId)) {
      throw new DomainError("errors.notFound");
    }
    warranty.customerId = customerId;
    warranty.clienteManual = undefined;
  } else {
    warranty.customerId = undefined;
    warranty.clienteManual = requireText(
      input.clienteManual ?? "",
      "errors.warrantyClienteRequired",
    );
  }

  logAudit(db, actor, {
    action: "update",
    entity: "warranty",
    entityId: warranty.id,
    details: `${warranty.code} · cliente corregido`,
  });
  return warranty;
};

// ============ Técnicos externos ============

export const createTecnico = (db: Db, actor: Actor, input: { nombre: string }): Technician => {
  requirePermission(actor, "users.manage");
  const nombre = requireText(input.nombre, "errors.tecnicoNameRequired");
  const tecnico: Technician = {
    id: createId(),
    nombre,
    activo: true,
    createdAt: nowIso(),
  };
  db.tecnicos.push(tecnico);
  logAudit(db, actor, {
    action: "create",
    entity: "tecnico",
    entityId: tecnico.id,
    details: tecnico.nombre,
  });
  return tecnico;
};

export const updateTecnico = (
  db: Db,
  actor: Actor,
  input: { id: string; activo: boolean },
): Technician => {
  requirePermission(actor, "users.manage");
  const tecnico = db.tecnicos.find((item) => item.id === input.id);
  if (!tecnico) throw new DomainError("errors.notFound");
  tecnico.activo = input.activo;
  logAudit(db, actor, {
    action: "update",
    entity: "tecnico",
    entityId: tecnico.id,
    details: tecnico.nombre,
  });
  return tecnico;
};

export const deleteTecnico = (db: Db, actor: Actor, input: { id: string }) => {
  requirePermission(actor, "users.manage");
  const tecnico = db.tecnicos.find((item) => item.id === input.id);
  if (!tecnico) throw new DomainError("errors.notFound");
  db.tecnicos = db.tecnicos.filter((item) => item.id !== tecnico.id);
  db.warranties.forEach((warranty) => {
    if (warranty.tecnicoId === tecnico.id) warranty.tecnicoId = undefined;
  });
  logAudit(db, actor, {
    action: "delete",
    entity: "tecnico",
    entityId: tecnico.id,
    details: tecnico.nombre,
  });
};

/** Conteo por estado para las insignias de la página de garantías. */
export const contarGarantiasPorEstado = (db: Db): Array<{ estado: WarrantyStatus; cantidad: number }> => {
  const mapa = new Map<WarrantyStatus, number>();
  db.warranties.forEach((warranty) => {
    mapa.set(warranty.status, (mapa.get(warranty.status) ?? 0) + 1);
  });
  return Array.from(mapa.entries()).map(([estado, cantidad]) => ({ estado, cantidad }));
};
