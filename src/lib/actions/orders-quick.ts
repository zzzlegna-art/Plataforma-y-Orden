/**
 * Pedido rápido por escaneo. El borrador existe únicamente en la interfaz:
 * no se crea ningún pedido hasta confirmar todos los seriales.
 *
 * Reutiliza las acciones normales (crear, serializar y confirmar preparación)
 * para conservar permisos, auditoría, disponibilidad, trazabilidad y PDF.
 */
import { DomainError } from "../db";
import { normalizarColor, variantePorColor } from "../color-variants";
import { esProductoRepuesto, mayoristaGroupDeProducto } from "../products";
import type { Actor, Db, Order, Product, Unit } from "../types";
import { requirePermission } from "./guards";
import { confirmarPreparacionPedido, createOrder, serializarImeiPedido, type PedidoLineaInput } from "./orders";

export interface QuickOrderSerialInput {
  serial: string;
  /** Para referencias con variantes: solo se usa si existe en el catálogo. */
  color?: string;
}

export interface QuickOrderUnitPreview {
  unit: Unit;
  product: Product;
  /** El color registrado en inventario, o el único color de la referencia. */
  suggestedColor?: string;
  /** Las variantes que el usuario puede seleccionar si el IMEI no tiene color. */
  colors: string[];
}

/** Busca en inventario, nunca acepta un serial inventado ni un IMEI duplicado. */
export const previewQuickOrderUnit = (
  db: Db,
  serial: string,
): QuickOrderUnitPreview | null => {
  const needle = serial.trim().toLocaleLowerCase("es");
  const unit = db.units.find((candidate) => candidate.serial.trim().toLocaleLowerCase("es") === needle);
  if (!unit) return null;
  const product = db.products.find((candidate) => candidate.id === unit.productId);
  if (!product) return null;
  const colors = (product.colorVariants ?? []).map((variant) => variant.color);
  const suggestedColor = colors.length
    ? variantePorColor(product, unit.color)?.color ?? (colors.length === 1 && !unit.color ? colors[0] : undefined)
    : undefined;
  return { unit, product, colors, suggestedColor };
};

/** Verifica reservas existentes incluso si el inventario aún marca "en_bodega". */
const reservedInActiveOrder = (db: Db, unitId: string): boolean =>
  db.orderItemUnits.some((assignment) => {
    if (assignment.unitId !== unitId) return false;
    const item = db.orderItems.find((candidate) => candidate.id === assignment.orderItemId);
    const order = item && db.orders.find((candidate) => candidate.id === item.orderId);
    return order?.status === "en_preparacion" || order?.status === "preparado";
  });

/**
 * Operación completa, validada ANTES de crear registros. Tras confirmar,
 * el pedido queda "preparado" (seriales reservados, sin salida física).
 * Despacho y exportación PDF permanecen en el detalle habitual.
 */
export const crearPedidoRapidoPorSeriales = (
  db: Db,
  actor: Actor,
  input: { customerId: string; serials: QuickOrderSerialInput[] },
): Order => {
  requirePermission(actor, "orders.manage");
  const customer = db.customers.find((candidate) => candidate.id === input.customerId);
  if (!customer) throw new DomainError("Selecciona el cliente del pedido.");
  if (!customer.isActive) throw new DomainError("El cliente seleccionado está inactivo.");
  if (!input.serials.length) throw new DomainError("Escanea al menos un serial para continuar.");

  const seen = new Set<string>();
  const resolved: Array<{ serial: string; unit: Unit; product: Product; color?: string }> = [];

  for (const entry of input.serials) {
    const key = entry.serial.trim().toLocaleLowerCase("es");
    if (!key) throw new DomainError("Hay un serial vacío en la lista.");
    if (seen.has(key)) throw new DomainError("Un mismo serial no puede repetirse en el pedido.");
    seen.add(key);

    const preview = previewQuickOrderUnit(db, entry.serial);
    if (!preview) throw new DomainError("El serial " + entry.serial + " no existe en inventario.");
    const { unit, product } = preview;
    if (!product.isActive) throw new DomainError("La referencia " + product.name + " está inactiva.");
    if (unit.status !== "en_bodega") {
      throw new DomainError("El serial " + unit.serial + " no está disponible en bodega.");
    }
    if (reservedInActiveOrder(db, unit.id)) {
      throw new DomainError("El serial " + unit.serial + " ya pertenece a un pedido activo.");
    }
    if (esProductoRepuesto(db, product)) {
      throw new DomainError("Los repuestos se agregan por cantidad en el pedido normal.");
    }

    const group = mayoristaGroupDeProducto(db, product);
    const canBuy = !customer.categoriaMayorista || customer.categoriaMayorista === "ambos" ||
      customer.categoriaMayorista === group;
    if (!canBuy) {
      throw new DomainError("La categoría del cliente no permite incluir " + product.name + ".");
    }

    let color: string | undefined;
    if (preview.colors.length) {
      const selected = normalizarColor(entry.color || preview.suggestedColor);
      const selectedVariant = variantePorColor(product, selected);
      if (!selectedVariant) {
        throw new DomainError("Selecciona un color válido para " + product.name + " (" + unit.serial + ").");
      }
      if (unit.color && normalizarColor(unit.color).toLocaleLowerCase("es") !== normalizarColor(selectedVariant.color).toLocaleLowerCase("es")) {
        throw new DomainError("El serial " + unit.serial + " tiene otro color registrado.");
      }
      color = selectedVariant.color;
    }
    resolved.push({ serial: unit.serial, unit, product, color });
  }

  // Una sola línea por referencia, condición y color. Nunca se infieren modelos del IMEI.
  const lines = new Map<string, PedidoLineaInput>();
  for (const entry of resolved) {
    const key = [entry.product.id, entry.unit.condition, entry.color ?? ""].join("|");
    const line = lines.get(key);
    if (line) line.quantity += 1;
    else lines.set(key, {
      productId: entry.product.id,
      condition: entry.unit.condition,
      color: entry.color,
      quantity: 1,
    });
  }

  const order = createOrder(db, actor, {
    customerId: customer.id,
    lineas: [...lines.values()],
  });
  for (const entry of resolved) {
    // Dos unidades del mismo modelo pueden tener distintos colores. La línea
    // se identifica explícitamente para no depender del orden de escaneo.
    const item = db.orderItems.find((candidate) =>
      candidate.orderId === order.id &&
      candidate.productId === entry.product.id &&
      candidate.condition === entry.unit.condition &&
      (candidate.color ?? "") === (entry.color ?? ""),
    );
    if (!item) throw new DomainError("No se encontró la línea de esta referencia.");
    serializarImeiPedido(db, actor, {
      orderId: order.id,
      imei: entry.serial,
      orderItemId: item.id,
    });
  }
  confirmarPreparacionPedido(db, actor, { orderId: order.id });
  return order;
};
