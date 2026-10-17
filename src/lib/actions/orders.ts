/**
 * Acciones de pedidos a clientes mayoristas (flujo del prototipo Bodega 6A):
 * el pedido se arma por referencias (producto + condición + cantidad) y después
 * se serializan los IMEIs con barra de progreso por referencia. Al finalizar,
 * las unidades pasan a "vendido" y se registra la salida.
 */

import { createId, DomainError, logAudit, logMovement, nextDailyCode, nowIso } from "../db";
import { diaBogota, hoyBogota } from "../dates";
import type { Actor, Db, Order, OrderItem, OrderStatus, Unit, UnitCondition } from "../types";
import { esProductoRepuesto } from "../products";
import { requireNumber, requirePermission } from "./guards";

export const ORDER_STATUSES: OrderStatus[] = ["en_preparacion", "despachado", "cancelado"];

const findOrder = (db: Db, orderId: string) => {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) throw new DomainError("errors.notFound");
  return order;
};

const orderItems = (db: Db, orderId: string) =>
  db.orderItems.filter((item) => item.orderId === orderId);

const assertEnPreparacion = (order: Order) => {
  if (order.status !== "en_preparacion") {
    throw new DomainError("errors.orderNotEditable");
  }
};

export interface PedidoLineaInput {
  productId: string;
  quantity: number;
  condition?: UnitCondition;
}

/** Condición aplicable según la categoría del producto. */
export const condicionParaProducto = (categoria?: string): UnitCondition => {
  if (categoria === "reloj") return "nuevo";
  return "nuevo";
};

const buildLineas = (
  db: Db,
  actor: Actor,
  orderId: string,
  lineas: PedidoLineaInput[],
): OrderItem[] => {
  if (lineas.length === 0) throw new DomainError("errors.orderNeedsItems");
  return lineas.map((linea) => {
    const product = db.products.find((item) => item.id === linea.productId);
    if (!product) throw new DomainError("errors.productRequired");
    const quantity = requireNumber(linea.quantity, "errors.invalidQuantity", 1);
    const condition: UnitCondition =
      product.categoria === "repuesto" ? "nuevo" : (linea.condition ?? "nuevo");
    return {
      id: createId(),
      orderId,
      productId: product.id,
      quantity,
      condition,
      unitPrice: product.price,
      subtotal: quantity * product.price,
    };
  });
};

export const createOrder = (
  db: Db,
  actor: Actor,
  input: { customerId: string; nota?: string; lineas: PedidoLineaInput[] },
): Order => {
  requirePermission(actor, "orders.manage");
  const customer = db.customers.find((item) => item.id === input.customerId);
  if (!customer) throw new DomainError("errors.customerRequired");
  if (!customer.isActive) throw new DomainError("errors.customerInactive");

  const orderId = createId();
  const order: Order = {
    id: orderId,
    code: nextDailyCode(db.orders.map((item) => item.code), "PED"),
    customerId: customer.id,
    status: "en_preparacion",
    orderDate: hoyBogota(),
    notes: input.nota?.trim() || undefined,
    total: 0,
    createdBy: actor.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const items = buildLineas(db, actor, orderId, input.lineas);
  order.total = items.reduce((sum, item) => sum + item.subtotal, 0);
  db.orders.unshift(order);
  db.orderItems.push(...items);
  logAudit(db, actor, {
    action: "create",
    entity: "order",
    entityId: order.id,
    details: `${order.code} · ${customer.name}`,
  });
  return order;
};

/** Agrega una referencia (producto+condición) al pedido en preparación. */
export const agregarReferenciaPedido = (
  db: Db,
  actor: Actor,
  input: { orderId: string; productId: string; quantity: number; condition?: UnitCondition },
): OrderItem => {
  requirePermission(actor, "orders.manage");
  const order = findOrder(db, input.orderId);
  assertEnPreparacion(order);
  const product = db.products.find((item) => item.id === input.productId);
  if (!product) throw new DomainError("errors.productRequired");
  const quantity = requireNumber(input.quantity, "errors.invalidQuantity", 1);
  const condition: UnitCondition =
    product.categoria === "repuesto" ? "nuevo" : (input.condition ?? "nuevo");

  const existente = db.orderItems.find(
    (item) =>
      item.orderId === order.id &&
      item.productId === product.id &&
      item.condition === condition,
  );
  if (existente) {
    existente.quantity += quantity;
    existente.subtotal = existente.quantity * existente.unitPrice;
    return existente;
  }
  const item: OrderItem = {
    id: createId(),
    orderId: order.id,
    productId: product.id,
    quantity,
    condition,
    unitPrice: product.price,
    subtotal: quantity * product.price,
  };
  db.orderItems.push(item);
  return item;
};

/** Quita una referencia completa; solo si no tiene seriales asignados. */
export const quitarReferenciaPedido = (
  db: Db,
  actor: Actor,
  input: { orderItemId: string },
) => {
  requirePermission(actor, "orders.manage");
  const item = db.orderItems.find((row) => row.id === input.orderItemId);
  if (!item) throw new DomainError("errors.notFound");
  const order = findOrder(db, item.orderId);
  assertEnPreparacion(order);
  const asignados = db.orderItemUnits.filter((row) => row.orderItemId === item.id);
  if (asignados.length > 0) {
    throw new DomainError("errors.referenceHasSerials", { count: asignados.length });
  }
  db.orderItems = db.orderItems.filter((row) => row.id !== item.id);
  logAudit(db, actor, {
    action: "update",
    entity: "order",
    entityId: order.id,
    details: `${order.code} · referencia quitada`,
  });
};

/** Cambia la cantidad pedida de una referencia (no puede bajar del serializado). */
export const editarCantidadReferencia = (
  db: Db,
  actor: Actor,
  input: { orderItemId: string; nuevaCantidad: number },
): OrderItem => {
  requirePermission(actor, "orders.manage");
  const item = db.orderItems.find((row) => row.id === input.orderItemId);
  if (!item) throw new DomainError("errors.notFound");
  const order = findOrder(db, item.orderId);
  assertEnPreparacion(order);
  const nueva = requireNumber(input.nuevaCantidad, "errors.invalidQuantity", 0);
  const serializados = db.orderItemUnits.filter((row) => row.orderItemId === item.id).length;
  if (nueva < serializados) {
    throw new DomainError("errors.quantityBelowSerialized", {
      serializados: serializados,
    });
  }
  if (nueva === 0) {
    quitarReferenciaPedido(db, actor, { orderItemId: item.id });
    return item;
  }
  item.quantity = nueva;
  item.subtotal = nueva * item.unitPrice;
  logAudit(db, actor, {
    action: "update",
    entity: "order",
    entityId: order.id,
    details: `${order.code} · ${item.productId} → ${nueva}`,
  });
  return item;
};

const unitEnOtroPedidoActivo = (db: Db, unitId: string) =>
  db.orderItemUnits.some((row) => {
    if (row.unitId !== unitId) return false;
    const item = db.orderItems.find((i) => i.id === row.orderItemId);
    const order = item ? db.orders.find((o) => o.id === item.orderId) : undefined;
    return order && order.status === "en_preparacion";
  });

/**
 * Serializa un IMEI en el pedido: busca la referencia del mismo producto y
 * condición que tenga cupo y asigna la unidad. Devuelve el nombre del producto y la línea donde
 * quedó (para avisar si no era la referencia desde la que se escaneó).
 */
export const serializarImeiPedido = (
  db: Db,
  actor: Actor,
  input: { orderId: string; imei: string },
): { producto: string; condicion?: UnitCondition; orderItemId: string } => {
  requirePermission(actor, "orders.manage");
  const order = findOrder(db, input.orderId);
  assertEnPreparacion(order);
  const imei = input.imei.trim();
  if (!imei) throw new DomainError("errors.serialRequired");
  const unit = db.units.find((item) => item.serial.toLowerCase() === imei.toLowerCase());
  if (!unit) throw new DomainError("errors.unitNotFound", { serial: imei });
  if (unit.status !== "en_bodega" && unit.status !== "en_local") {
    throw new DomainError("errors.unitNotAvailable", { serial: imei });
  }
  if (unitEnOtroPedidoActivo(db, unit.id)) {
    throw new DomainError("errors.unitAlreadyAssigned");
  }
  const lineas = db.orderItems.filter(
    (item) =>
      item.orderId === order.id &&
      item.productId === unit.productId &&
      item.condition === unit.condition,
  );
  const linea = lineas.find((item) => {
    const asignados = db.orderItemUnits.filter((row) => row.orderItemId === item.id).length;
    return asignados < item.quantity;
  });
  if (!linea) {
    throw new DomainError("errors.noLineaDisponible", {
      producto: db.products.find((p) => p.id === unit.productId)?.name ?? "",
    });
  }
  db.orderItemUnits.push({ id: createId(), orderItemId: linea.id, unitId: unit.id, createdAt: nowIso() });
  // La asignación también forma parte de la vida del serial, aunque el pedido
  // todavía no se haya despachado.
  logMovement(db, actor, {
    productId: unit.productId,
    unitId: unit.id,
    type: "ajuste",
    referenceType: "pedido",
    referenceId: order.id,
    notes: `Serial ${unit.serial} asignado al pedido ${order.code} (pendiente de despacho)`,
  });
  logAudit(db, actor, {
    action: "assign",
    entity: "order",
    entityId: order.id,
    details: `${order.code} · ${imei}`,
  });
  const product = db.products.find((p) => p.id === unit.productId);
  return { producto: product?.name ?? "", condicion: linea.condition, orderItemId: linea.id };
};

/** Quita un IMEI ya serializado en el pedido. */
export const quitarImeiPedido = (
  db: Db,
  actor: Actor,
  input: { orderId: string; imei: string },
) => {
  requirePermission(actor, "orders.manage");
  const order = findOrder(db, input.orderId);
  assertEnPreparacion(order);
  const unit = db.units.find((item) => item.serial.toLowerCase() === input.imei.toLowerCase());
  if (!unit) throw new DomainError("errors.notFound");
  const row = db.orderItemUnits.find((r) => r.unitId === unit.id);
  const item = row ? db.orderItems.find((i) => i.id === row.orderItemId) : undefined;
  if (!row || !item || item.orderId !== order.id) {
    throw new DomainError("errors.serialNotInOrder", { serial: input.imei });
  }
  db.orderItemUnits = db.orderItemUnits.filter((r) => r.id !== row.id);
  logMovement(db, actor, {
    productId: unit.productId,
    unitId: unit.id,
    type: "ajuste",
    referenceType: "pedido",
    referenceId: order.id,
    notes: `Serial ${unit.serial} retirado de la serialización del pedido ${order.code}`,
  });
  logAudit(db, actor, {
    action: "release",
    entity: "order",
    entityId: order.id,
    details: `${order.code} · ${input.imei}`,
  });
};

/**
 * Unidades libres de un producto (en bodega o en local, sin otro pedido en preparación),
 * las más antiguas primero.
 */
export const unidadesLibres = (db: Db, productId: string): Unit[] =>
  db.units
    .filter(
      (unit) =>
        unit.productId === productId &&
        (unit.status === "en_bodega" || unit.status === "en_local") &&
        !unitEnOtroPedidoActivo(db, unit.id),
    )
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

/**
 * Los repuestos no se escanean: lo que falte de cada línea de repuestos se toma solo del
 * inventario (primero lo más antiguo). Si no alcanza, no se asigna nada y se avisa cuántos hay.
 */
const asignarRepuestosAutomaticamente = (db: Db, orderId: string, items: OrderItem[]) => {
  const nuevas: { orderItemId: string; unitId: string }[] = [];
  const tomadas = new Set<string>();

  for (const item of items) {
    const product = db.products.find((p) => p.id === item.productId);
    if (!esProductoRepuesto(db, product)) continue;
    const asignados = db.orderItemUnits.filter((row) => row.orderItemId === item.id).length;
    const faltan = item.quantity - asignados;
    if (faltan <= 0) continue;

    const libres = unidadesLibres(db, item.productId).filter((unit) => !tomadas.has(unit.id));
    if (libres.length < faltan) {
      throw new DomainError("errors.insufficientStockPedido", {
        producto: product?.name ?? "",
        pedidas: item.quantity,
        disponibles: asignados + libres.length,
      });
    }
    for (const unit of libres.slice(0, faltan)) {
      tomadas.add(unit.id);
      nuevas.push({ orderItemId: item.id, unitId: unit.id });
    }
  }

  const creadas = nowIso();
  for (const nueva of nuevas) {
    db.orderItemUnits.push({ id: createId(), ...nueva, createdAt: creadas });
  }
  return nuevas.length;
};

/**
 * Finaliza el pedido: las referencias con serial deben estar completas; los repuestos se
 * asignan solos desde el inventario.
 */
export const finalizarPedido = (
  db: Db,
  actor: Actor,
  input: { orderId: string },
): Order => {
  requirePermission(actor, "orders.manage");
  const order = findOrder(db, input.orderId);
  assertEnPreparacion(order);
  const items = orderItems(db, order.id);

  asignarRepuestosAutomaticamente(db, order.id, items);

  const incompleta = items.find((item) => {
    const asignados = db.orderItemUnits.filter((row) => row.orderItemId === item.id).length;
    return asignados < item.quantity;
  });
  if (incompleta) {
    const product = db.products.find((p) => p.id === incompleta.productId);
    throw new DomainError("errors.orderIncomplete", { product: product?.name ?? "" });
  }

  // Verificación final independiente de la interfaz: ningún IMEI puede repetirse
  // ni salir en una referencia/condición diferente de la solicitada.
  const idsDespacho = new Set<string>();
  for (const item of items) {
    for (const row of db.orderItemUnits.filter((asignacion) => asignacion.orderItemId === item.id)) {
      if (idsDespacho.has(row.unitId)) throw new DomainError("errors.unitAlreadyAssigned");
      idsDespacho.add(row.unitId);
      const unit = db.units.find((u) => u.id === row.unitId);
      if (!unit) throw new DomainError("errors.notFound");
      if (unit.productId !== item.productId || (item.condition && unit.condition !== item.condition)) {
        throw new DomainError("errors.unitProductMismatch");
      }
      if (unitEnOtroPedidoActivo(db, unit.id) &&
        db.orderItemUnits.some((asignacion) => asignacion.unitId === unit.id &&
          asignacion.orderItemId !== item.id &&
          db.orderItems.some((linea) => linea.id === asignacion.orderItemId && linea.orderId !== order.id &&
            db.orders.some((pedido) => pedido.id === linea.orderId && pedido.status === "en_preparacion")))) {
        throw new DomainError("errors.unitAlreadyAssigned");
      }
    }
  }

  const deliveredAt = nowIso();
  items.forEach((item) => {
    db.orderItemUnits
      .filter((row) => row.orderItemId === item.id)
      .forEach((row) => {
        const unit = db.units.find((u) => u.id === row.unitId);
        // Nunca se despacha en silencio un pedido con una unidad que ya no está disponible.
        if (!unit) throw new DomainError("errors.notFound");
        if (unit.status !== "en_bodega" && unit.status !== "en_local") {
          throw new DomainError("errors.unitNotAvailable", { serial: unit.serial });
        }
        unit.status = "vendido";
        logMovement(db, actor, {
          productId: unit.productId,
          unitId: unit.id,
          type: "salida",
          referenceType: "pedido",
          referenceId: order.id,
          notes: `Salida por pedido ${order.code}`,
          createdAt: deliveredAt,
        });
      });
  });

  order.status = "despachado";
  order.deliveryDate = diaBogota(deliveredAt);
  order.updatedAt = deliveredAt;
  logAudit(db, actor, {
    action: "status",
    entity: "order",
    entityId: order.id,
    details: `${order.code} · despachado`,
  });
  return order;
};

/** Cancela el pedido (solo administrador); los seriales quedan libres. */
export const cancelarPedido = (
  db: Db,
  actor: Actor,
  input: { orderId: string; motivo: string },
): Order => {
  requirePermission(actor, "users.manage");
  const order = findOrder(db, input.orderId);
  assertEnPreparacion(order);
  const itemIds = orderItems(db, order.id).map((item) => item.id);
  db.orderItemUnits = db.orderItemUnits.filter(
    (row) => !itemIds.includes(row.orderItemId),
  );
  order.status = "cancelado";
  order.notes = input.motivo?.trim() || order.notes;
  order.updatedAt = nowIso();
  logAudit(db, actor, {
    action: "status",
    entity: "order",
    entityId: order.id,
    details: `${order.code} · cancelado`,
  });
  return order;
};

export const nextOrderStatuses = (status: OrderStatus): OrderStatus[] => {
  if (status === "en_preparacion") return ["despachado", "cancelado"];
  return [];
};

// ---------------------------------------------------------------------------
// Edición de pedidos YA despachados (solo administradores).
// ---------------------------------------------------------------------------

const assertDespachado = (order: Order) => {
  if (order.status !== "despachado") {
    throw new DomainError("errors.orderNotDespachado");
  }
};

const lineaDelPedido = (db: Db, orderId: string, orderItemId: string) => {
  const item = db.orderItems.find((row) => row.id === orderItemId && row.orderId === orderId);
  if (!item) throw new DomainError("errors.notFound");
  return item;
};

const recalcularTotal = (db: Db, orderId: string) => {
  const order = findOrder(db, orderId);
  order.total = orderItems(db, order.id).reduce((sum, item) => sum + item.subtotal, 0);
  order.updatedAt = nowIso();
  return order;
};

/**
 * (admin) Agrega un serial concreto a una referencia de un pedido ya despachado:
 * la unidad sale del inventario y pasa a "vendido".
 */
export const agregarSerialDespachado = (
  db: Db,
  actor: Actor,
  input: { orderId: string; orderItemId: string; imei: string },
): { serial: string; producto: string } => {
  requirePermission(actor, "users.manage");
  const order = findOrder(db, input.orderId);
  assertDespachado(order);
  const item = lineaDelPedido(db, order.id, input.orderItemId);

  const serial = input.imei.trim();
  if (!serial) throw new DomainError("errors.serialRequired");
  const unit = db.units.find((u) => u.serial.toLowerCase() === serial.toLowerCase());
  if (!unit) throw new DomainError("errors.unitNotFound", { serial });
  if (unit.status !== "en_bodega" && unit.status !== "en_local") {
    throw new DomainError("errors.unitNotAvailable", { serial });
  }
  if (unitEnOtroPedidoActivo(db, unit.id)) {
    throw new DomainError("errors.unitAlreadyAssigned");
  }
  if (db.orderItemUnits.some((row) => row.orderItemId === item.id && row.unitId === unit.id)) {
    throw new DomainError("errors.unitAlreadyAssigned");
  }
  if (unit.productId !== item.productId || unit.condition !== item.condition) {
    throw new DomainError("errors.serialMustMatchLine");
  }

  db.orderItemUnits.push({ id: createId(), orderItemId: item.id, unitId: unit.id, createdAt: nowIso() });
  unit.status = "vendido";
  logMovement(db, actor, {
    productId: unit.productId,
    unitId: unit.id,
    type: "salida",
    referenceType: "pedido",
    referenceId: order.id,
    notes: `Salida por pedido ${order.code} (edición)`,
  });
  item.quantity += 1;
  item.subtotal = item.quantity * item.unitPrice;
  recalcularTotal(db, order.id);
  logAudit(db, actor, {
    action: "update",
    entity: "order",
    entityId: order.id,
    details: `${order.code} · + ${serial}`,
  });
  const product = db.products.find((p) => p.id === item.productId);
  return { serial, producto: product?.name ?? "" };
};

/**
 * (admin) Quita un serial concreto de un pedido despachado con una observación
 * obligatoria: la unidad vuelve al inventario y la cantidad de la referencia
 * baja.
 */
export const quitarSerialDespachado = (
  db: Db,
  actor: Actor,
  input: { orderId: string; imei: string; observacion?: string },
) => {
  requirePermission(actor, "users.manage");
  const order = findOrder(db, input.orderId);
  assertDespachado(order);
  const observacion = input.observacion?.trim();
  if (!observacion) throw new DomainError("errors.observacionRequired");

  const unit = db.units.find((item) => item.serial.toLowerCase() === input.imei.toLowerCase());
  if (!unit) throw new DomainError("errors.notFound");
  const row = db.orderItemUnits.find((r) => r.unitId === unit.id);
  const item = row ? db.orderItems.find((i) => i.id === row.orderItemId) : undefined;
  if (!row || !item || item.orderId !== order.id) {
    throw new DomainError("errors.serialNotInOrder", { serial: input.imei });
  }
  // Si la unidad ya salió por garantía, se liberó, etc., no se "resucita" como stock.
  if (unit.status !== "vendido") throw new DomainError("errors.unitComprometida");
  db.orderItemUnits = db.orderItemUnits.filter((r) => r.id !== row.id);
  unit.status = "en_bodega";
  logMovement(db, actor, {
    productId: unit.productId,
    unitId: unit.id,
    type: "devolucion",
    referenceType: "pedido",
    referenceId: order.id,
    notes: `Devolución por edición de pedido ${order.code} · ${observacion}`,
  });
  item.quantity = Math.max(0, item.quantity - 1);
  if (item.quantity === 0) {
    db.orderItems = db.orderItems.filter((r) => r.id !== item.id);
  } else {
    item.subtotal = item.quantity * item.unitPrice;
  }
  recalcularTotal(db, order.id);
  logAudit(db, actor, {
    action: "update",
    entity: "order",
    entityId: order.id,
    details: `${order.code} · quitar ${input.imei} · ${observacion}`,
  });
};

/**
 * (admin) Anula un pedido ya despachado: todas las unidades vuelven al
 * inventario y el pedido pasa a "cancelado".
 */
export const cancelarPedidoDespachado = (
  db: Db,
  actor: Actor,
  input: { orderId: string; motivo?: string },
): Order => {
  requirePermission(actor, "users.manage");
  const order = findOrder(db, input.orderId);
  assertDespachado(order);

  const itemIds = orderItems(db, order.id).map((item) => item.id);
  // Solo vuelven a bodega las unidades que siguen "vendido"; una que ya entró a
  // garantía, se liberó, etc. conserva su estado.
  let conservadas = 0;
  db.orderItemUnits
    .filter((row) => itemIds.includes(row.orderItemId))
    .forEach((row) => {
      const unit = db.units.find((u) => u.id === row.unitId);
      if (unit && unit.status !== "vendido") conservadas += 1;
      if (unit && unit.status === "vendido") {
        unit.status = "en_bodega";
        logMovement(db, actor, {
          productId: unit.productId,
          unitId: unit.id,
          type: "devolucion",
          referenceType: "pedido",
          referenceId: order.id,
          notes: `Cancelación de pedido ${order.code}`,
        });
      }
    });
  db.orderItemUnits = db.orderItemUnits.filter((row) => !itemIds.includes(row.orderItemId));

  const motivo = input.motivo?.trim();
  order.status = "cancelado";
  order.notes = [order.notes, motivo].filter(Boolean).join(" · ") || undefined;
  order.updatedAt = nowIso();
  logAudit(db, actor, {
    action: "status",
    entity: "order",
    entityId: order.id,
    details:
      conservadas > 0
        ? `${order.code} · cancelado · ${conservadas} unidad(es) conservan su estado (ya no estaban vendidas)`
        : `${order.code} · cancelado`,
  });
  return order;
};

export type { Unit };
