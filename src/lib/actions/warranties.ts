/**
 * Acciones de garantías: recepción por IMEI (uno/lote), falla de inventario
 * (uno/lote) o garantía previa; envío a técnico externo; diagnóstico y destino final
 * del equipo con movimientos trazables de inventario.
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
  if (replacement.id === warranty.unitId) {
    throw new DomainError("errors.unitNotAvailable", { serial: replacement.serial });
  }
  const asignado = db.orderItemUnits.some((row) => {
    if (row.unitId !== replacement.id) return false;
    const linea = db.orderItems.find((item) => item.id === row.orderItemId);
    const pedido = linea ? db.orders.find((item) => item.id === linea.orderId) : undefined;
    return pedido?.status === "en_preparacion";
  });
  if (asignado) throw new DomainError("errors.unitAlreadyAssigned");
  const reservadoEnOtraGarantia = db.warranties.some(
    (item) =>
      item.id !== warranty.id &&
      item.replacementUnitId === replacement.id &&
      isOpenWarranty(item.status),
  );
  if (reservadoEnOtraGarantia) {
    throw new DomainError("errors.unitNotAvailable", { serial: replacement.serial });
  }
  if (replacement.status !== "en_bodega" && replacement.status !== "en_local") {
    throw new DomainError("errors.unitNotAvailable", { serial: replacement.serial });
  }
  // En garantías previas, la referencia escrita debe corresponder a un producto del catálogo.
  // Así también se exige la misma referencia cuando el cliente no tenía una venta registrada.
  const productoEsperado = warranty.productId ?? productoPorReferencia(db, warranty.referenciaManual);
  if (!productoEsperado) {
    throw new DomainError("errors.warrantyReferenceNotInCatalog", {
      reference: warranty.referenciaManual ?? "",
    });
  }
  if (replacement.productId !== productoEsperado) {
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
  estadoInicial: Unit["status"] = "en_bodega",
): Unit | undefined => {
  const serial = warranty.imeiManual;
  if (!serial) return undefined;
  const existente = findUnitBySerial(db, serial);
  if (
    existente &&
    existente.productId !== productId &&
    (warranty.productId || warranty.referenciaManual?.trim())
  ) {
    throw new DomainError("errors.unitProductMismatch");
  }
  if (existente && existente.status !== "liberado") return undefined;
  const unidad: Unit = existente ?? {
    id: createId(),
    productId,
    serial,
    condition: "seminuevo",
    status: estadoInicial,
    receivedAt: nowIso(),
    createdBy: actor.id,
  };
  unidad.status = estadoInicial;
  if (!existente) db.units.push(unidad);
  // Desde este momento el serial previo ya tiene una unidad real en Nexora.
  // Se conserva imeiManual para mantener el origen "garantía previa" en todo el historial.
  warranty.unitId = unidad.id;
  warranty.productId = unidad.productId;
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
  const referenciaSolicitada = requireText(input.referenciaManual, "errors.referenciaManualRequired");
  const productoId = productoPorReferencia(db, referenciaSolicitada);
  if (!productoId) {
    throw new DomainError("errors.warrantyReferenceNotInCatalog", { reference: referenciaSolicitada });
  }
  const referenciaManual = db.products.find((product) => product.id === productoId)!.name;
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
    productId: productoId,
    referenciaManual,
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
 * Falla en inventario: un equipo disponible en bodega o local presenta una falla
 * sin haberse vendido. Se registra por serial y sigue el mismo circuito de servicio
 * técnico, pero sin asociarlo a un cliente.
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
 * Registra el diagnóstico del técnico y deja la decisión de destino para la bandeja
 * Reenvío. Si es un cambio, el serial de reemplazo se valida y reserva desde aquí.
 * Un equipo que se considera irreparable no se recibe como garantía y por eso no se
 * acepta "defectuoso" como diagnóstico de un caso nuevo.
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
  if (input.resolucion === "defectuoso") {
    // Se conserva el valor para leer casos antiguos, pero ya no se registra en diagnósticos nuevos.
    throw new DomainError("errors.invalidTransition");
  }
  const diagnostico = requireText(input.diagnostico, "errors.diagnosticoRequired");
  const replacement =
    input.resolucion === "cambio"
      ? requireReplacement(db, warranty, input.replacementUnitId)
      : undefined;

  warranty.diagnostico = diagnostico;
  warranty.resolucion = input.resolucion;
  warranty.replacementUnitId = replacement?.id;
  warranty.costo = input.costo && input.costo > 0 ? input.costo : undefined;
  // No mover la unidad al registrar el diagnóstico: en Reenvío se decide si el equipo
  // vuelve al cliente o queda disponible en bodega. El cambio es la única excepción
  // de selección inmediata: aquí se valida el serial, pero el movimiento ocurre al confirmar.

  warranty.status = "reenvio_pendiente";
  const notaDiagnostico = input.resolucion === "cambio" && replacement
    ? `Cambio aprobado · serial de reemplazo ${replacement.serial}${input.costo ? ` · costo ${input.costo}` : ""}`
    : `${input.resolucion}${input.costo ? ` · costo ${input.costo}` : ""}`;
  addEvent(db, actor, warranty.id, "reenvio_pendiente", notaDiagnostico);
  logAudit(db, actor, {
    action: "resolve",
    entity: "warranty",
    entityId: warranty.id,
    details: `${warranty.code} · diagnóstico: ${input.resolucion}${replacement ? ` · reemplazo ${replacement.serial}` : ""}`,
  });
  return warranty;
};

/**
 * Estado al que volvería un caso si se deshace su último paso, o `null` si no se puede deshacer
 * desde la plataforma. Solo se deshacen pasos sin movimientos de inventario:
 * - en servicio técnico -> recibido (se quita el técnico asignado)
 * - reenvío pendiente -> en servicio técnico (si pasó por un técnico) o recibido, cuando el
 *   diagnóstico fue reparado/cambio. "Sin falla" conserva la restricción para proteger casos
 *   históricos que movían unidades al registrar el diagnóstico antes de decidir el destino.
 * Entregado y devuelto tampoco se deshacen: el destino final ya movió o liberó una unidad.
 */
export const estadoAnteriorGarantia = (
  warranty: Pick<Warranty, "status" | "resolucion" | "tecnicoId">,
): WarrantyStatus | null => {
  if (warranty.status === "en_servicio_tecnico") return "recibido";
  if (warranty.status === "reenvio_pendiente") {
    if (warranty.resolucion !== "reparado" && warranty.resolucion !== "cambio" && warranty.resolucion !== "defectuoso") return null;
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
 * Cierra el reenvío con el destino físico registrado:
 * - reparado/sin_falla: vuelve al cliente o queda disponible en bodega;
 * - cambio: el serial de reemplazo sale al cliente y el original vuelve disponible a bodega;
 * - garantía previa devuelta a bodega: el serial manual se incorpora al inventario.
 */
export const entregarGarantia = (
  db: Db,
  actor: Actor,
  input: { warrantyId: string; replacementUnitId?: string; devolverABodega?: boolean; reembolso?: boolean; destinoDefectuoso?: "cambio" | "reembolso" | "bodega" },
): Warranty => {
  requirePermission(actor, "warranties.manage");
  const warranty = findWarranty(db, input.warrantyId);
  if (warranty.status !== "reenvio_pendiente") {
    throw new DomainError("errors.invalidTransition");
  }

  const unit = warranty.unitId
    ? db.units.find((item) => item.id === warranty.unitId)
    : undefined;
  const serialOriginal = unit?.serial ?? warranty.imeiManual ?? "serial no disponible";
  const sinCliente = !garantiaTieneCliente(warranty);
  // Solo para casos históricos: "defectuoso" ya no se puede elegir en diagnósticos nuevos.
  const destinoDefectuoso = warranty.resolucion === "defectuoso"
    ? (sinCliente ? "bodega" : input.destinoDefectuoso)
    : undefined;
  if (warranty.resolucion === "defectuoso" && !destinoDefectuoso) {
    throw new DomainError("errors.invalidTransition");
  }
  const reembolso = input.reembolso === true || destinoDefectuoso === "reembolso";
  if (reembolso && (sinCliente || warranty.resolucion === "cambio" || destinoDefectuoso === "cambio")) {
    throw new DomainError("errors.invalidTransition");
  }

  const esCambio = warranty.resolucion === "cambio" || destinoDefectuoso === "cambio";
  // En una falla propia de inventario no hay cliente al que entregar el reemplazo:
  // se retira el serial que no se pudo recuperar y la unidad elegida permanece disponible.
  const cambioInventario = esCambio && sinCliente && warranty.resolucion === "cambio";
  let serialReemplazo: string | undefined;
  if (esCambio) {
    const replacement = requireReplacement(
      db,
      warranty,
      input.replacementUnitId ?? warranty.replacementUnitId,
    );
    warranty.replacementUnitId = replacement.id;
    serialReemplazo = replacement.serial;

    if (cambioInventario) {
      if (!unit) throw new DomainError("errors.invalidTransition");
      const pedido = pedidoDeUnidad(db, unit.id);
      unit.status = "liberado";
      db.orderItemUnits = db.orderItemUnits.filter((row) => row.unitId !== unit.id);
      if (pedido) {
        logAudit(db, actor, {
          action: "update",
          entity: "order",
          entityId: pedido.id,
          details: `${unit.serial} retirado del pedido ${pedido.code} por cambio de equipo de inventario en garantía ${warranty.code}`,
        });
      }
      logMovement(db, actor, {
        productId: unit.productId,
        unitId: unit.id,
        type: "liberacion",
        referenceType: "garantia",
        referenceId: warranty.id,
        notes: `Cambio de equipo por falla de inventario ${warranty.code}: serial original ${unit.serial} retirado del inventario; serial ${replacement.serial} permanece disponible en inventario`,
      });
    } else {
      replacement.status = "entregado_garantia";
      logMovement(db, actor, {
        productId: replacement.productId,
        unitId: replacement.id,
        type: "salida",
        referenceType: "garantia",
        referenceId: warranty.id,
        notes: `Cambio por garantía ${warranty.code}: serial ${replacement.serial} entregado al cliente en lugar de ${serialOriginal}`,
      });

      if (unit) {
        const originalNoRecuperable = warranty.resolucion === "defectuoso";
        unit.status = originalNoRecuperable ? "defectuoso" : "en_bodega";
        db.orderItemUnits = db.orderItemUnits.filter((row) => row.unitId !== unit.id);
        logMovement(db, actor, {
          productId: unit.productId,
          unitId: unit.id,
          type: "entrada",
          referenceType: "garantia",
          referenceId: warranty.id,
          notes: originalNoRecuperable
            ? `Cambio por garantía ${warranty.code}: serial original ${unit.serial} queda defectuoso en bodega; reemplazado por ${replacement.serial}`
            : `Cambio por garantía ${warranty.code}: serial original ${unit.serial} vuelve disponible en bodega; reemplazado por ${replacement.serial}`,
        });
      } else if (warranty.imeiManual) {
        darDeAltaEquipoPrevio(
          db,
          actor,
          warranty,
          replacement.productId,
          `Cambio por garantía ${warranty.code}: serial original ${warranty.imeiManual} recibido y disponible en bodega; reemplazado por ${replacement.serial}`,
          warranty.resolucion === "defectuoso" ? "defectuoso" : "en_bodega",
        );
      }
    }
  }

  const resolucionConEquipo = warranty.resolucion === "reparado" || warranty.resolucion === "sin_falla";
  const aBodega = cambioInventario || (resolucionConEquipo && (
    sinCliente || input.devolverABodega === true || reembolso
  ));

  if (resolucionConEquipo && (unit || (aBodega && warranty.imeiManual))) {
    if (aBodega) {
      if (unit) {
        const yaDisponible = unit.status === "en_bodega";
        const seguiaLigadaAVenta = db.orderItemUnits.some((row) => row.unitId === unit.id);
        unit.status = "en_bodega";
        db.orderItemUnits = db.orderItemUnits.filter((row) => row.unitId !== unit.id);
        if (!yaDisponible || seguiaLigadaAVenta) {
          logMovement(db, actor, {
            productId: unit.productId,
            unitId: unit.id,
            type: "devolucion",
            referenceType: "garantia",
            referenceId: warranty.id,
            notes: sinCliente
              ? `${warranty.resolucion === "sin_falla" ? "Equipo sin falla" : "Equipo reparado"} ${unit.serial} queda disponible en bodega, sin cliente (${warranty.code})`
              : `Se decide no devolverlo al cliente: ${warranty.resolucion === "sin_falla" ? "equipo sin falla" : "equipo reparado"} ${unit.serial} queda disponible en bodega (${warranty.code})${reembolso ? "; reembolso acordado, dinero por registrar por separado" : ""}`,
          });
        }
      } else if (warranty.imeiManual) {
        const productId = warranty.productId ?? productoPorReferencia(db, warranty.referenciaManual);
        if (!productId) throw new DomainError("errors.unitProductMismatch");
        darDeAltaEquipoPrevio(
          db,
          actor,
          warranty,
          productId,
          `${warranty.resolucion === "sin_falla" ? "Equipo sin falla" : "Equipo reparado"} ${warranty.imeiManual} recibido de garantía y disponible en bodega (${warranty.code})${reembolso ? "; reembolso acordado, dinero por registrar por separado" : ""}`,
          "en_bodega",
        );
      }
    } else if (unit) {
      unit.status = "entregado_garantia";
      logMovement(db, actor, {
        productId: unit.productId,
        unitId: unit.id,
        type: "devolucion",
        referenceType: "garantia",
        referenceId: warranty.id,
        notes: `Garantía ${warranty.code}: serial ${unit.serial} entregado al cliente tras diagnóstico ${warranty.resolucion}`,
      });
    }
  }

  // Mantener el comportamiento de registros históricos que sí se marcaron como defectuosos.
  if (warranty.resolucion === "defectuoso" && destinoDefectuoso !== "cambio") {
    if (unit) {
      unit.status = "defectuoso";
      db.orderItemUnits = db.orderItemUnits.filter((row) => row.unitId !== unit.id);
      logMovement(db, actor, {
        productId: unit.productId,
        unitId: unit.id,
        type: "entrada",
        referenceType: "garantia",
        referenceId: warranty.id,
        notes: destinoDefectuoso === "reembolso"
          ? `Garantía ${warranty.code}: serial ${unit.serial} queda defectuoso en bodega; reembolso por registrar por separado`
          : `Falla de inventario ${warranty.code}: serial ${unit.serial} queda defectuoso en bodega`,
      });
    } else if (warranty.imeiManual) {
      const productId = warranty.productId ?? productoPorReferencia(db, warranty.referenciaManual);
      if (!productId) throw new DomainError("errors.unitProductMismatch");
      darDeAltaEquipoPrevio(
        db,
        actor,
        warranty,
        productId,
        `Garantía ${warranty.code}: serial ${warranty.imeiManual} queda defectuoso en bodega`,
        "defectuoso",
      );
    }
  }

  const cierreEnBodega = aBodega || reembolso || destinoDefectuoso === "bodega";
  warranty.status = cierreEnBodega ? "devuelto" : "entregado";
  warranty.resolvedAt = nowIso();

  let notaCierre: string;
  if (destinoDefectuoso === "bodega") {
    notaCierre = `Serial original ${serialOriginal} queda defectuoso en bodega`;
  } else if (cambioInventario) {
    notaCierre = `Cambio de equipo de inventario completado: serial original ${serialOriginal} retirado del inventario; serial ${serialReemplazo ?? "—"} permanece disponible en inventario`;
  } else if (esCambio) {
    notaCierre = warranty.resolucion === "defectuoso"
      ? `Cambio completado: serial original ${serialOriginal} queda defectuoso en bodega; serial de reemplazo ${serialReemplazo ?? "—"} entregado al cliente`
      : `Cambio completado: serial original ${serialOriginal} queda disponible en bodega; serial de reemplazo ${serialReemplazo ?? "—"} entregado al cliente`;
  } else if (reembolso) {
    notaCierre = warranty.resolucion === "defectuoso"
      ? `Reembolso acordado; serial original ${serialOriginal} queda defectuoso en bodega. El movimiento de dinero se registra por separado`
      : `Reembolso acordado; serial original ${serialOriginal} queda disponible en bodega. El movimiento de dinero se registra por separado`;
  } else if (aBodega) {
    const diagnosticoFinal = warranty.resolucion === "sin_falla" ? "sin falla encontrada" : "reparado";
    notaCierre = `Equipo original ${serialOriginal} ${diagnosticoFinal} y disponible en bodega${sinCliente ? " (falla de inventario, sin cliente)" : ""}`;
  } else {
    notaCierre = `Garantía entregada al cliente: serial ${serialOriginal}`;
  }

  addEvent(
    db,
    actor,
    warranty.id,
    cierreEnBodega ? "devuelto" : "entregado",
    notaCierre,
  );
  logAudit(db, actor, {
    action: "resolve",
    entity: "warranty",
    entityId: warranty.id,
    details: `${warranty.code} · ${notaCierre}`,
  });
  return warranty;
};

/**
 * Devuelve directamente a bodega una selección de garantías en Recibidos.
 * Cierra los casos y deja los seriales disponibles para nuevos pedidos. Los reembolsos
 * se registran por separado; esta acción solo registra el destino físico del equipo.
 */
export const devolverGarantiasABodega = (
  db: Db,
  actor: Actor,
  input: { warrantyIds: string[] },
): number => {
  requirePermission(actor, "warranties.manage");
  const ids = [...new Set(input.warrantyIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) throw new DomainError("errors.invalidTransition");

  // Validar toda la selección antes de mover cualquier unidad: el lote se confirma completo
  // o no se modifica, evitando que un serial inválido deje el lote a medias.
  const preparados = ids.map((id) => {
    const warranty = findWarranty(db, id);
    if (warranty.status !== "recibido") throw new DomainError("errors.invalidTransition");
    const unit = warranty.unitId ? db.units.find((item) => item.id === warranty.unitId) : undefined;
    if (warranty.unitId && !unit) throw new DomainError("errors.notFound");
    if (unit && !["en_reparacion", "en_bodega", "en_local", "liberado"].includes(unit.status)) {
      throw new DomainError("errors.invalidTransition");
    }
    let productId = unit?.productId ?? warranty.productId;
    if (!unit && warranty.imeiManual) {
      productId = productId ?? productoPorReferencia(db, warranty.referenciaManual);
      if (!productId) {
        throw new DomainError("errors.warrantyReferenceNotInCatalog", {
          reference: warranty.referenciaManual ?? "",
        });
      }
      const existente = findUnitBySerial(db, warranty.imeiManual);
      if (existente && existente.status !== "liberado") {
        throw new DomainError("errors.previaSerialInSystem", { serial: warranty.imeiManual });
      }
      if (existente && existente.productId !== productId) {
        throw new DomainError("errors.unitProductMismatch");
      }
    } else if (!unit && !warranty.imeiManual) {
      throw new DomainError("errors.notFound");
    }
    return { warranty, unit, productId };
  });

  for (const { warranty, unit, productId } of preparados) {
    let unidad = unit;
    const serial = unit?.serial ?? warranty.imeiManual ?? "serial no disponible";
    if (unidad) {
      const pedido = pedidoDeUnidad(db, unidad.id);
      const yaDisponible = unidad.status === "en_bodega";
      const seguiaLigadaAVenta = db.orderItemUnits.some((row) => row.unitId === unidad!.id);
      unidad.status = "en_bodega";
      db.orderItemUnits = db.orderItemUnits.filter((row) => row.unitId !== unidad!.id);
      if (pedido) {
        logAudit(db, actor, {
          action: "update",
          entity: "order",
          entityId: pedido.id,
          details: `${serial} devuelto a bodega por garantía ${warranty.code} y retirado del pedido ${pedido.code}`,
        });
      }
      if (!yaDisponible || seguiaLigadaAVenta) {
        logMovement(db, actor, {
          productId: unidad.productId,
          unitId: unidad.id,
          type: "devolucion",
          referenceType: "garantia",
          referenceId: warranty.id,
          notes: `Garantía ${warranty.code}: serial ${serial} devuelto a bodega desde Recibidos; disponible para venta`,
        });
      }
    } else if (warranty.imeiManual && productId) {
      unidad = darDeAltaEquipoPrevio(
        db,
        actor,
        warranty,
        productId,
        `Garantía previa ${warranty.code}: serial ${serial} recibido y disponible en bodega desde Recibidos`,
        "en_bodega",
      );
      if (!unidad) throw new DomainError("errors.invalidTransition");
    }

    warranty.status = "devuelto";
    warranty.resolvedAt = nowIso();
    const nota = `Devolución directa a bodega desde Recibidos: serial ${serial} queda disponible en bodega para venta; el movimiento de dinero se registra por separado`;
    addEvent(db, actor, warranty.id, "devuelto", nota);
    logAudit(db, actor, {
      action: "resolve",
      entity: "warranty",
      entityId: warranty.id,
      details: `${warranty.code} · ${nota}`,
    });
  }
  return preparados.length;
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
    // Sin diagnóstico no se puede clasificar como defectuoso ni volver al stock vendible.
    // Se mantiene en reparación hasta que se revise y clasifique explícitamente.
    // Ya no es del cliente que lo devolvió (ver misma nota en
    // registrarDiagnostico/entregarGarantia). Queda aclarado en el historial a qué pedido
    // pertenecía, para que no parezca que el pedido sigue incluyéndolo.
    const pedido = pedidoDeUnidad(db, unit.id);
    db.orderItemUnits = db.orderItemUnits.filter((row) => row.unitId !== unit.id);
    if (pedido) {
      detalle = [motivo, `Sale del pedido ${pedido.code}; pendiente de diagnóstico`].filter(Boolean).join(" · ");
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
      notes: [detalle || "Devolución sin resolución", "Equipo pendiente de diagnóstico, no vendible"].join(" · "),
    });
  } else if (!unit && warranty.imeiManual) {
    // Garantía previa: no hay unidad en el sistema. Al devolverla a la bodega se da de alta como
    // disponible, con el producto del catálogo que coincide con la referencia escrita al recibirla.
    const productId = productoPorReferencia(db, warranty.referenciaManual);
    if (productId) {
      detalle = [motivo, "Ingresa pendiente de diagnóstico y no vendible"].filter(Boolean).join(" · ");
      darDeAltaEquipoPrevio(
        db,
        actor,
        warranty,
        productId,
        `${motivo || "Devolución sin resolución"} (${warranty.code}); pendiente de diagnóstico, no vendible`,
        "en_reparacion",
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
