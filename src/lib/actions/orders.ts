/**
 * Acciones de pedidos a clientes mayoristas (flujo del prototipo Bodega 6A):
 * el pedido se arma por referencias (producto + condición + cantidad) y después
 * se serializan los IMEIs con barra de progreso por referencia. Al finalizar,
 * las unidades pasan a "vendido" y se registra la salida.
 */

import { createId, DomainError, logAudit, logMovement, nextDailyCode, nowIso } from "../db";
import { diaBogota, hoyBogota } from "../dates";
import type { Actor, Db, Order, OrderItem, OrderStatus, Unit, UnitCondition } from "../types";
import { costoSugeridoColor, normalizarColor, precioSugeridoColor, variantePorColor } from "../color-variants";
import { esProductoRepuesto } from "../products";
import { requireNumber, requirePermission } from "./guards";

export const ORDER_STATUSES: OrderStatus[] = ["en_preparacion", "preparado", "despachado", "cancelado"];

const findOrder = (db: Db, orderId: string) => {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) throw new DomainError("errors.notFound");
  return order;
};

const orderItems = (db: Db, orderId: string) =>
  db.orderItems.filter((item) => item.orderId === orderId);

const recalcularTotalPedido = (db: Db, order: Order) => {
  order.total = orderItems(db, order.id).reduce((total, item) => total + item.subtotal, 0);
  order.updatedAt = nowIso();
};

const assertEnPreparacion = (order: Order) => {
  if (order.status !== "en_preparacion") {
    throw new DomainError("errors.orderNotEditable");
  }
};

export interface PedidoLineaInput {
  productId: string;
  quantity: number;
  condition?: UnitCondition;
  color?: string;
}

const validarColorPedido = (product: import("../types").Product, raw?: string): string | undefined => {
  const color = normalizarColor(raw);
  if (!product.colorVariants?.length || !color) return undefined;
  const variante = variantePorColor(product, color);
  if (!variante) throw new DomainError("Selecciona un color válido de la referencia.");
  return variante.color;
};

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
    const color = validarColorPedido(product, linea.color);
    const precio = precioSugeridoColor(product, color);
    const condition: UnitCondition =
      product.categoria === "repuesto" ? "nuevo" : (linea.condition ?? "nuevo");
    return {
      id: createId(),
      orderId,
      productId: product.id,
      quantity,
      condition,
      color,
      unitPrice: precio,
      subtotal: quantity * precio,
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
  input: { orderId: string; productId: string; quantity: number; condition?: UnitCondition; color?: string },
): OrderItem => {
  requirePermission(actor, "orders.manage");
  const order = findOrder(db, input.orderId);
  assertEnPreparacion(order);
  const product = db.products.find((item) => item.id === input.productId);
  if (!product) throw new DomainError("errors.productRequired");
  const quantity = requireNumber(input.quantity, "errors.invalidQuantity", 1);
  const color = validarColorPedido(product, input.color);
  const precio = precioSugeridoColor(product, color);
  const condition: UnitCondition =
    product.categoria === "repuesto" ? "nuevo" : (input.condition ?? "nuevo");

  const existente = db.orderItems.find(
    (item) =>
      item.orderId === order.id &&
      item.productId === product.id &&
      item.condition === condition &&
      (item.color ?? "") === (color ?? ""),
  );
  if (existente) {
    existente.quantity += quantity;
    existente.subtotal = existente.quantity * existente.unitPrice;
    recalcularTotalPedido(db, order);
    return existente;
  }
  const item: OrderItem = {
    id: createId(),
    orderId: order.id,
    productId: product.id,
    quantity,
    condition,
    color,
    unitPrice: precio,
    subtotal: quantity * precio,
  };
  db.orderItems.push(item);
  recalcularTotalPedido(db, order);
  return item;
};

/** Cambia color de una línea sin IMEI, y actualiza el precio sugerido (sin crear otra SKU). */
export const cambiarColorReferenciaPedido = (
  db: Db, actor: Actor, input: { orderItemId: string; color: string },
): OrderItem => {
  requirePermission(actor, "orders.manage");
  const item = db.orderItems.find((row) => row.id === input.orderItemId);
  if (!item) throw new DomainError("errors.notFound");
  const order = findOrder(db, item.orderId);
  assertEnPreparacion(order);
  if (db.orderItemUnits.some((a) => a.orderItemId === item.id)) {
    throw new DomainError("Retira los IMEI asignados antes de cambiar el color.");
  }
  const product = db.products.find((p) => p.id === item.productId);
  if (!product) throw new DomainError("errors.notFound");
  const color = validarColorPedido(product, input.color);
  if (db.orderItems.some((r) => r.id !== item.id && r.orderId === order.id && r.productId === item.productId && r.condition === item.condition && r.color === color)) {
    throw new DomainError("Ya existe una línea de este color. Ajusta su cantidad.");
  }
  item.color = color;
  item.unitPrice = precioSugeridoColor(product, color);
  item.subtotal = item.unitPrice * item.quantity;
  recalcularTotalPedido(db, order);
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
  recalcularTotalPedido(db, order);
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
  recalcularTotalPedido(db, order);
  logAudit(db, actor, {
    action: "update",
    entity: "order",
    entityId: order.id,
    details: `${order.code} · ${item.productId} → ${nueva}`,
  });
  return item;
};

/**
 * Ajusta el precio unitario acordado para este pedido sin alterar el precio maestro
 * del producto. Se permite en preparación o preparado; la confirmación de venta
 * valida después el precio frente al costo real de cada unidad.
 */
export const editarPrecioReferencia = (
  db: Db,
  actor: Actor,
  input: { orderItemId: string; nuevoPrecio: number },
): OrderItem => {
  requirePermission(actor, "orders.manage");
  const item = db.orderItems.find((row) => row.id === input.orderItemId);
  if (!item) throw new DomainError("errors.notFound");
  const order = findOrder(db, item.orderId);
  if (order.status !== "en_preparacion" && order.status !== "preparado") {
    throw new DomainError("errors.orderNotEditable");
  }
  const nuevoPrecio = requireNumber(input.nuevoPrecio, "errors.invalidPrice", 0);
  const precioAnterior = item.unitPrice;
  item.unitPrice = nuevoPrecio;
  item.subtotal = item.quantity * nuevoPrecio;
  recalcularTotalPedido(db, order);
  logAudit(db, actor, {
    action: "update",
    entity: "order",
    entityId: order.id,
    details: `${order.code} · precio ${item.productId}: ${precioAnterior} → ${nuevoPrecio}; subtotal ${item.subtotal}; total ${order.total}`,
  });
  return item;
};

const unitEnOtroPedidoActivo = (db: Db, unitId: string) =>
  db.orderItemUnits.some((row) => {
    if (row.unitId !== unitId) return false;
    const item = db.orderItems.find((i) => i.id === row.orderItemId);
    const order = item ? db.orders.find((o) => o.id === item.orderId) : undefined;
    return order && (order.status === "en_preparacion" || order.status === "preparado");
  });

/**
 * Serializa un IMEI en el pedido: busca la referencia del mismo producto y
 * condición que tenga cupo y asigna la unidad. Devuelve el nombre del producto y la línea donde
 * quedó (para avisar si no era la referencia desde la que se escaneó).
 */
export const serializarImeiPedido = (
  db: Db,
  actor: Actor,
  input: { orderId: string; imei: string; orderItemId?: string },
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
  const product = db.products.find((p) => p.id === unit.productId);
  const lineas = db.orderItems.filter((item) => {
    if (item.orderId !== order.id || item.productId !== unit.productId || item.condition !== unit.condition) return false;
    // El color no tiene que haberse registrado en recepción: se define al serializar.
    if (product?.colorVariants?.length && !item.color) return false;
    return !item.color || !unit.color ||
      normalizarColor(item.color).toLocaleLowerCase("es") === normalizarColor(unit.color).toLocaleLowerCase("es");
  });
  const candidatas = input.orderItemId
    ? lineas.filter((item) => item.id === input.orderItemId)
    : lineas;
  const linea = candidatas.find((item) => {
    const asignados = db.orderItemUnits.filter((row) => row.orderItemId === item.id).length;
    return asignados < item.quantity;
  });
  if (!linea) {
    if (product?.colorVariants?.length &&
        db.orderItems.some((item) => item.orderId === order.id &&
          item.productId === unit.productId && item.condition === unit.condition && !item.color)) {
      throw new DomainError("Selecciona el color de esta referencia antes de asignar el IMEI.");
    }
    throw new DomainError("errors.noLineaDisponible", {
      producto: db.products.find((p) => p.id === unit.productId)?.name ?? "",
    });
  }
  // El color se fija aquí, no en recepción. Nunca sobrescribir uno ya identificado.
  if (linea.color && !unit.color) {
    unit.color = linea.color;
    // El costo real ingresado en recepción tiene prioridad; de lo contrario
    // se toma el costo de la variante para validar precio y conservar trazabilidad.
    if (unit.cost === undefined) unit.cost = costoSugeridoColor(product!, linea.color);
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
 * Verifica que todas las unidades del pedido estén asignadas una sola vez,
 * correspondan a la referencia solicitada y sigan físicamente disponibles.
 */
const validarAsignacionesPedido = (db: Db, order: Order, items: OrderItem[]) => {
  const idsAsignados = new Set<string>();
  for (const item of items) {
    const asignaciones = db.orderItemUnits.filter((row) => row.orderItemId === item.id);
    if (asignaciones.length < item.quantity) {
      const product = db.products.find((p) => p.id === item.productId);
      throw new DomainError("errors.orderIncomplete", { product: product?.name ?? "" });
    }
    const product = db.products.find((p) => p.id === item.productId);
    if (product?.colorVariants?.length && !item.color) {
      throw new DomainError("Selecciona el color de cada referencia antes de confirmar la serialización.");
    }
    for (const row of asignaciones) {
      if (idsAsignados.has(row.unitId)) throw new DomainError("errors.unitAlreadyAssigned");
      idsAsignados.add(row.unitId);
      const unit = db.units.find((u) => u.id === row.unitId);
      if (!unit) throw new DomainError("errors.notFound");
      if (unit.productId !== item.productId || (item.condition && unit.condition !== item.condition) || (item.color && normalizarColor(unit.color).toLocaleLowerCase("es") !== normalizarColor(item.color).toLocaleLowerCase("es"))) {
        throw new DomainError("errors.unitProductMismatch");
      }
      if (unit.status !== "en_bodega" && unit.status !== "en_local") {
        throw new DomainError("errors.unitNotAvailable", { serial: unit.serial });
      }
      const asignadaEnOtroPedido = db.orderItemUnits.some((otra) => {
        if (otra.unitId !== unit.id || otra.orderItemId === row.orderItemId) return false;
        const otraLinea = db.orderItems.find((linea) => linea.id === otra.orderItemId);
        const otroPedido = otraLinea && db.orders.find((pedido) => pedido.id === otraLinea.orderId);
        return Boolean(otroPedido && otroPedido.id !== order.id &&
          (otroPedido.status === "en_preparacion" || otroPedido.status === "preparado"));
      });
      if (asignadaEnOtroPedido) throw new DomainError("errors.unitAlreadyAssigned");
    }
  }
};

/**
 * Primera confirmación: prepara y reserva las unidades, sin descontarlas del inventario
 * ni marcarlas como vendidas. La salida solo ocurre al confirmar la venta.
 */
export const confirmarPreparacionPedido = (
  db: Db,
  actor: Actor,
  input: { orderId: string },
): Order => {
  requirePermission(actor, "orders.manage");
  const order = findOrder(db, input.orderId);
  assertEnPreparacion(order);
  const items = orderItems(db, order.id);
  if (items.length === 0) throw new DomainError("errors.orderNeedsItems");

  asignarRepuestosAutomaticamente(db, order.id, items);
  validarAsignacionesPedido(db, order, items);

  const preparedAt = nowIso();
  order.status = "preparado";
  order.updatedAt = preparedAt;
  logAudit(db, actor, {
    action: "status",
    entity: "order",
    entityId: order.id,
    details: `${order.code} · preparación confirmada; inventario reservado, sin salida`,
  });
  return order;
};

/**
 * Reabre la serialización de un pedido preparado que todavía no se ha vendido.
 * Conserva las asignaciones existentes: los IMEI seguirán reservados al pedido
 * mientras se corrigen, sustituyen o agregan otros. No altera el estado físico
 * de ninguna unidad, movimientos de inventario, ni documentos de venta.
 */
export const regresarPedidoASerializacion = (
  db: Db,
  actor: Actor,
  input: { orderId: string },
): Order => {
  requirePermission(actor, "orders.manage");
  const order = findOrder(db, input.orderId);
  if (order.status !== "preparado") throw new DomainError("errors.orderNotPrepared");

  order.status = "en_preparacion";
  order.updatedAt = nowIso();
  logAudit(db, actor, {
    action: "status",
    entity: "order",
    entityId: order.id,
    details: `${order.code} · regresó de preparado a serialización; se conservaron los IMEI asignados`,
  });
  return order;
};

/**
 * Segunda confirmación: registra la venta y la salida física de las unidades reservadas.
 * El costo real de cada unidad se valida antes de modificar inventario.
 */
export const confirmarVentaPedido = (
  db: Db,
  actor: Actor,
  input: { orderId: string },
): Order => {
  requirePermission(actor, "orders.manage");
  const order = findOrder(db, input.orderId);
  if (order.status !== "preparado") throw new DomainError("errors.orderNotPrepared");
  const items = orderItems(db, order.id);
  validarAsignacionesPedido(db, order, items);
  // Corrige posibles totales antiguos antes de confirmar definitivamente la venta.
  order.total = items.reduce((total, item) => total + item.subtotal, 0);

  for (const item of items) {
    const product = db.products.find((p) => p.id === item.productId);
    for (const row of db.orderItemUnits.filter((asignacion) => asignacion.orderItemId === item.id)) {
      const unit = db.units.find((u) => u.id === row.unitId);
      if (!unit) throw new DomainError("errors.notFound");
      const costoReal = unit.cost ?? (product ? costoSugeridoColor(product, item.color) : undefined);
      if (costoReal !== undefined && item.unitPrice < costoReal) {
        throw new DomainError("errors.saleBelowCost", {
          serial: unit.serial,
          costo: costoReal,
          precio: item.unitPrice,
        });
      }
    }
  }

  const deliveredAt = nowIso();
  for (const item of items) {
    for (const row of db.orderItemUnits.filter((asignacion) => asignacion.orderItemId === item.id)) {
      const unit = db.units.find((u) => u.id === row.unitId);
      if (!unit) throw new DomainError("errors.notFound");
      unit.status = "vendido";
      logMovement(db, actor, {
        productId: unit.productId,
        unitId: unit.id,
        type: "salida",
        referenceType: "pedido",
        referenceId: order.id,
        notes: `Salida por venta confirmada del pedido ${order.code}`,
        createdAt: deliveredAt,
      });
    }
  }

  order.status = "despachado";
  order.deliveryDate = diaBogota(deliveredAt);
  order.updatedAt = deliveredAt;
  logAudit(db, actor, {
    action: "status",
    entity: "order",
    entityId: order.id,
    details: `${order.code} · venta confirmada y despachada`,
  });
  return order;
};

/** Compatibilidad para llamadas existentes: finalizar ahora significa confirmar la venta. */
export const finalizarPedido = confirmarVentaPedido;

/** Cancela el pedido (solo administrador); los seriales quedan libres. */
export const cancelarPedido = (
  db: Db,
  actor: Actor,
  input: { orderId: string; motivo: string },
): Order => {
  requirePermission(actor, "users.manage");
  const order = findOrder(db, input.orderId);
  if (order.status !== "en_preparacion" && order.status !== "preparado") {
    throw new DomainError("errors.orderNotEditable");
  }
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
  if (status === "en_preparacion") return ["preparado", "cancelado"];
  if (status === "preparado") return ["despachado", "cancelado"];
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
  if (unit.productId !== item.productId || unit.condition !== item.condition || (item.color && unit.color && normalizarColor(unit.color).toLocaleLowerCase("es") !== normalizarColor(item.color).toLocaleLowerCase("es"))) {
    throw new DomainError("errors.serialMustMatchLine");
  }

  if (item.color && !unit.color) {
    unit.color = item.color;
    const product = db.products.find((p) => p.id === unit.productId);
    if (unit.cost === undefined && product) unit.cost = costoSugeridoColor(product, item.color);
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
