/**
 * Selectores: datos derivados que consumen las páginas.
 * Se calculan en memoria sobre la base local (los volúmenes son de miles de filas).
 */

import type {
  Brand,
  Category,
  Customer,
  Db,
  Order,
  OrderItem,
  OrderItemUnit,
  Product,
  Reception,
  Unit,
  UnitCondition,
  Warranty,
  WarrantyEvent,
} from "./types";
import { isOpenWarranty } from "./actions/warranties";
import { esProductoRepuesto } from "./products";

/**
 * Índices reutilizables.
 *
 * Con miles de unidades y movimientos, buscar dentro de un arreglo completo por
 * cada fila (producto, pedido, garantía…) multiplicaba el trabajo y hacía que
 * cada clic tardara. Estos índices recorren una sola vez y luego consultan.
 */
const porId = <T extends { id: string }>(items: T[]): Map<string, T> =>
  new Map(items.map((item) => [item.id, item]));

const agrupar = <T,>(
  items: T[],
  clave: (item: T) => string | undefined,
): Map<string, T[]> => {
  const mapa = new Map<string, T[]>();
  for (const item of items) {
    const key = clave(item);
    if (!key) continue;
    const lista = mapa.get(key);
    if (lista) lista.push(item);
    else mapa.set(key, [item]);
  }
  return mapa;
};

export interface ProductStock {
  /** Disponibles para la venta (bodega + local). */
  disponible: number;
  /** Unidades que siguen dentro del inventario (no incluye vendidas, liberadas ni entregadas por garantía). */
  enInventario: number;
  /** Todas las unidades registradas alguna vez (incluye vendidas y liberadas). */
  total: number;
  enBodega: number;
  enLocal: number;
  enTransito: number;
  vendido: number;
  enReparacion: number;
  defectuoso: number;
  entregadoGarantia: number;
  liberado: number;
  /** Condición de todas las unidades registradas. */
  nuevo: number;
  seminuevo: number;
  /** Condición de las unidades que siguen en inventario. */
  nuevoEnInventario: number;
  seminuevoEnInventario: number;
  /** Unidades listas para vender (bodega o local), separadas por condición. */
  nuevoDisponible: number;
  seminuevoDisponible: number;
  minStock: number;
  /** Stock bajo: en celulares, alguna condición con menos de STOCK_BAJO_CELULARES. */
  lowStock: boolean;
  /** Solo celulares: la condición correspondiente está por debajo del umbral. */
  lowStockNuevo: boolean;
  lowStockSeminuevo: boolean;
}

/** Un celular se considera con stock bajo si tiene menos de estas unidades disponibles. */
export const STOCK_BAJO_CELULARES = 10;

/** ¿El producto es un celular? Los productos antiguos sin tipo cuentan como celular salvo repuestos. */
const esCelular = (db: Db, product?: Product): boolean => {
  if (!product) return false;
  if (product.categoria) return product.categoria === "celular";
  return !esProductoRepuesto(db, product);
};

/** Estados en los que la unidad sigue en poder de la empresa. */
const ESTADOS_EN_INVENTARIO: Unit["status"][] = [
  "en_bodega",
  "en_local",
  "en_transito",
  "en_reparacion",
  "defectuoso",
];

/**
 * Unidades que NO son inventario porque están en una garantía de un cliente
 * (equipo vendido que volvió al taller). Las fallas propias —"falla de bodega"—
 * son garantías sin cliente asociado y sí siguen contando como inventario.
 */
export const unidadesFueraPorGarantia = (db: Db): Set<string> => {
  const ids = new Set<string>();
  for (const warranty of db.warranties) {
    if (!warranty.unitId) continue;
    if (!isOpenWarranty(warranty.status)) continue;
    const esDeCliente = Boolean(
      warranty.customerId || warranty.orderId || warranty.clienteManual,
    );
    if (esDeCliente) ids.add(warranty.unitId);
  }
  return ids;
};

/**
 * Stock de un producto. Si se indica una condición, TODOS los números se
 * calculan solo con esas unidades (nuevas o seminuevas), de modo que un informe
 * o un filtro de "nuevos" nunca mezcle seminuevos.
 */
export const getProductStock = (
  db: Db,
  productId: string,
  condicion?: UnitCondition,
): ProductStock =>
  construirStock(
    db.products.find((item) => item.id === productId),
    db.units.filter((unit) => unit.productId === productId),
    condicion,
    unidadesFueraPorGarantia(db),
    esCelular(db, db.products.find((item) => item.id === productId)),
  );

/**
 * Arma el stock a partir de las unidades ya reunidas del producto.
 * Recibe las unidades agrupadas para no recorrer todo el inventario por cada
 * referencia, que es lo que volvía lento el listado.
 */
function construirStock(
  product: Product | undefined,
  unidades: Unit[],
  condicion: UnitCondition | undefined,
  fueraPorGarantia: Set<string>,
  esCelularProducto: boolean,
): ProductStock {
  const stock: ProductStock = {
    disponible: 0,
    enInventario: 0,
    total: 0,
    enBodega: 0,
    enLocal: 0,
    enTransito: 0,
    vendido: 0,
    enReparacion: 0,
    defectuoso: 0,
    entregadoGarantia: 0,
    liberado: 0,
    nuevo: 0,
    seminuevo: 0,
    nuevoEnInventario: 0,
    seminuevoEnInventario: 0,
    nuevoDisponible: 0,
    seminuevoDisponible: 0,
    minStock: product?.minStock ?? 0,
    lowStock: false,
    lowStockNuevo: false,
    lowStockSeminuevo: false,
  };

  const fuera = fueraPorGarantia;

  unidades
    .filter((unit) => (condicion ? unit.condition === condicion : true))
    .forEach((unit) => {
      const esInventarioPropio = !fuera.has(unit.id);
      stock.total += 1;
      if (unit.condition === "nuevo") stock.nuevo += 1;
      else stock.seminuevo += 1;
      if (unit.status === "en_bodega") stock.enBodega += 1;
      if (unit.status === "en_local") stock.enLocal += 1;
      if (unit.status === "en_transito") stock.enTransito += 1;
      if (unit.status === "vendido") stock.vendido += 1;
      // Un equipo de cliente en garantía no se cuenta como reparación propia.
      if (esInventarioPropio && unit.status === "en_reparacion") stock.enReparacion += 1;
      if (esInventarioPropio && unit.status === "defectuoso") stock.defectuoso += 1;
      if (unit.status === "entregado_garantia") stock.entregadoGarantia += 1;
      if (unit.status === "liberado") stock.liberado += 1;
      if (unit.status === "en_bodega" || unit.status === "en_local") {
        if (unit.condition === "nuevo") stock.nuevoDisponible += 1;
        else stock.seminuevoDisponible += 1;
      }

      if (esInventarioPropio && ESTADOS_EN_INVENTARIO.includes(unit.status)) {
        stock.enInventario += 1;
        if (unit.condition === "nuevo") stock.nuevoEnInventario += 1;
        else stock.seminuevoEnInventario += 1;
      }
    });

  stock.disponible = stock.enBodega + stock.enLocal;
  if (product?.isActive) {
    if (esCelularProducto) {
      // Solo cuentan las condiciones con las que el producto ha trabajado: un modelo que
      // nunca ha tenido seminuevos no debe alertar por "0 seminuevos".
      stock.lowStockNuevo = stock.nuevo > 0 && stock.nuevoDisponible < STOCK_BAJO_CELULARES;
      stock.lowStockSeminuevo =
        stock.seminuevo > 0 && stock.seminuevoDisponible < STOCK_BAJO_CELULARES;
      stock.lowStock = stock.lowStockNuevo || stock.lowStockSeminuevo;
    } else {
      stock.lowStock = stock.disponible < stock.minStock;
    }
  }
  return stock;
}

export interface ProductRow {
  product: Product;
  stock: ProductStock;
  category?: Category;
  brand?: Brand;
}

export const getProductRows = (db: Db, condicion?: UnitCondition): ProductRow[] => {
  const fuera = unidadesFueraPorGarantia(db);
  const unidadesPorProducto = agrupar(db.units, (unit) => unit.productId);
  const categorias = porId(db.categories);
  const marcas = porId(db.brands);

  return db.products.map((product) => ({
    product,
    stock: construirStock(
      product,
      unidadesPorProducto.get(product.id) ?? [],
      condicion,
      fuera,
      esCelular(db, product),
    ),
    category: product.categoryId ? categorias.get(product.categoryId) : undefined,
    brand: product.brandId ? marcas.get(product.brandId) : undefined,
  }));
};

export const getProduct = (db: Db, productId: string) =>
  db.products.find((item) => item.id === productId);

export const findUnitBySerial = (db: Db, serial: string): Unit | undefined => {
  const needle = serial.trim().toLowerCase();
  if (!needle) return undefined;
  return db.units.find((unit) => unit.serial.toLowerCase() === needle);
};

/** Busca un serial en el registro de ventas anteriores a la plataforma. */
export const buscarSerialPrevio = (db: Db, serial: string) => {
  const needle = serial.trim().toLowerCase();
  if (!needle) return undefined;
  return db.serialesPrevios.find((item) => item.serial.toLowerCase() === needle);
};

export const listarSerialesPrevios = (db: Db, busqueda?: string) => {
  const needle = busqueda?.trim().toLowerCase();
  return db.serialesPrevios
    .filter((item) => !needle || item.serial.toLowerCase().includes(needle))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export interface UnitRow {
  unit: Unit;
  product?: Product;
}

export const getUnitRows = (db: Db): UnitRow[] => {
  const productos = porId(db.products);
  return db.units
    .map((unit) => ({ unit, product: productos.get(unit.productId) }))
    .sort((a, b) => b.unit.receivedAt.localeCompare(a.unit.receivedAt));
};

/** Producto recibido en una recepción, con cuántas unidades entraron. */
export interface ReceptionProduct {
  productId: string;
  name: string;
  sku: string;
  count: number;
}

export interface ReceptionRow {
  reception: Reception;
  units: Unit[];
  /** Productos que entraron (de las unidades si está confirmada; de las líneas si está en captura). */
  products: ReceptionProduct[];
  /** Seriales/IMEI de la recepción, para poder buscarlos. */
  serials: string[];
}

export const getReceptionRows = (db: Db): ReceptionRow[] => {
  const unidades = agrupar(db.units, (unit) => unit.receptionId);
  const lineas = agrupar(db.receptionItems, (item) => item.receptionId);
  const productos = porId(db.products);

  return db.receptions
    .filter((reception) => reception.status !== "descartada")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((reception) => {
      const units = unidades.get(reception.id) ?? [];
      const items = lineas.get(reception.id) ?? [];
      // Confirmada: manda lo que quedó en inventario; en captura, lo que se va agregando.
      const origen = units.length > 0 ? units : items;
      const conteo = new Map<string, number>();
      for (const fila of origen) {
        conteo.set(fila.productId, (conteo.get(fila.productId) ?? 0) + 1);
      }
      const products = [...conteo.entries()]
        .map(([productId, count]) => {
          const producto = productos.get(productId);
          return { productId, name: producto?.name ?? "—", sku: producto?.sku ?? "", count };
        })
        .sort((a, b) => b.count - a.count);
      return { reception, units, products, serials: origen.map((fila) => fila.serial) };
    });
};

export interface OrderLineView {
  item: OrderItem;
  product?: Product;
  units: Unit[];
  serializados: number;
  esRepuesto: boolean;
}

export interface OrderView {
  order: Order;
  customer?: Customer;
  lines: OrderLineView[];
  requested: number;
  assigned: number;
}

type IndicesPedidos = {
  productos: Map<string, Product>;
  clientes: Map<string, Customer>;
  unidades: Map<string, Unit>;
  itemsPorPedido: Map<string, OrderItem[]>;
  unidadesPorItem: Map<string, OrderItemUnit[]>;
};

const indicesDePedidos = (db: Db): IndicesPedidos => ({
  productos: porId(db.products),
  clientes: porId(db.customers),
  unidades: porId(db.units),
  itemsPorPedido: agrupar(db.orderItems, (item) => item.orderId),
  unidadesPorItem: agrupar(db.orderItemUnits, (row) => row.orderItemId),
});

const armarOrderView = (db: Db, order: Order, indices: IndicesPedidos): OrderView => {
  const lines = (indices.itemsPorPedido.get(order.id) ?? []).map((item) => {
    const units = (indices.unidadesPorItem.get(item.id) ?? [])
      .map((row) => indices.unidades.get(row.unitId))
      .filter((unit): unit is Unit => Boolean(unit));
    const product = indices.productos.get(item.productId);
    return {
      item,
      product,
      units,
      serializados: units.length,
      esRepuesto: esProductoRepuesto(db, product),
    };
  });
  return {
    order,
    customer: indices.clientes.get(order.customerId),
    lines,
    requested: lines.reduce((sum, line) => sum + line.item.quantity, 0),
    // Los repuestos no llevan serial: cuentan como asignados para que la lista y el panel no
    // muestren un pedido de repuestos como pendiente de serializar.
    assigned: lines.reduce(
      (sum, line) => sum + (line.esRepuesto ? line.item.quantity : line.serializados),
      0,
    ),
  };
};

export const getOrderView = (db: Db, orderId: string): OrderView | undefined => {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) return undefined;
  return armarOrderView(db, order, indicesDePedidos(db));
};

export const getOrderViews = (db: Db): OrderView[] => {
  const indices = indicesDePedidos(db);
  return db.orders
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((order) => armarOrderView(db, order, indices));
};

export interface WarrantyView {
  warranty: Warranty;
  unit?: Unit;
  product?: Product;
  customer?: Customer;
  order?: Order;
  tecnico?: { id: string; nombre: string };
  events: WarrantyEvent[];
  open: boolean;
}

type IndicesGarantias = {
  unidades: Map<string, Unit>;
  productos: Map<string, Product>;
  clientes: Map<string, Customer>;
  pedidos: Map<string, Order>;
  /** Pedido despachado en el que salió cada unidad (para garantías sin pedido guardado). */
  pedidoPorUnidad: Map<string, Order>;
  tecnicos: Map<string, { id: string; nombre: string }>;
  eventos: Map<string, WarrantyEvent[]>;
};

const pedidosPorUnidad = (db: Db, pedidos: Map<string, Order>) => {
  const lineas = porId(db.orderItems);
  const resultado = new Map<string, Order>();
  for (const fila of db.orderItemUnits) {
    const linea = lineas.get(fila.orderItemId);
    const pedido = linea ? pedidos.get(linea.orderId) : undefined;
    if (pedido && pedido.status === "despachado") resultado.set(fila.unitId, pedido);
  }
  return resultado;
};

const indicesDeGarantias = (db: Db): IndicesGarantias => {
  const pedidos = porId(db.orders);
  return {
    unidades: porId(db.units),
    productos: porId(db.products),
    clientes: porId(db.customers),
    pedidos,
    pedidoPorUnidad: pedidosPorUnidad(db, pedidos),
    tecnicos: porId(db.tecnicos),
    eventos: agrupar(db.warrantyEvents, (event) => event.warrantyId),
  };
};

const armarWarrantyView = (
  warranty: Warranty,
  indices: IndicesGarantias,
): WarrantyView => {
  // Si el caso no guardó el pedido, se busca en la venta de la unidad.
  const order =
    (warranty.orderId ? indices.pedidos.get(warranty.orderId) : undefined) ??
    (warranty.unitId ? indices.pedidoPorUnidad.get(warranty.unitId) : undefined);
  const customer =
    (warranty.customerId ? indices.clientes.get(warranty.customerId) : undefined) ??
    (order?.customerId ? indices.clientes.get(order.customerId) : undefined);
  return {
    warranty,
    unit: warranty.unitId ? indices.unidades.get(warranty.unitId) : undefined,
    product: warranty.productId ? indices.productos.get(warranty.productId) : undefined,
    customer,
    order,
    tecnico: warranty.tecnicoId ? indices.tecnicos.get(warranty.tecnicoId) : undefined,
    events: (indices.eventos.get(warranty.id) ?? [])
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    open: isOpenWarranty(warranty.status),
  };
};

export const getWarrantyView = (
  db: Db,
  warrantyId: string,
): WarrantyView | undefined => {
  const warranty = db.warranties.find((item) => item.id === warrantyId);
  if (!warranty) return undefined;
  return armarWarrantyView(warranty, indicesDeGarantias(db));
};

/** Una garantía abierta sin cambios de estado en este número de días se considera estancada. */
export const DIAS_GARANTIA_ESTANCADA = 7;
/** A partir de aquí el caso se marca como crítico. */
export const DIAS_GARANTIA_CRITICA = 15;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Días completos desde el último movimiento del caso (su último cambio de estado o su recepción). */
export const diasSinMovimiento = (view: WarrantyView, ahora: number = Date.now()): number => {
  const fechas = [view.warranty.receivedAt, ...view.events.map((event) => event.createdAt)]
    .map((fecha) => Date.parse(fecha))
    .filter((fecha) => Number.isFinite(fecha));
  if (fechas.length === 0) return 0;
  return Math.max(0, Math.floor((ahora - Math.max(...fechas)) / MS_POR_DIA));
};

export const getWarrantyViews = (db: Db): WarrantyView[] => {
  const indices = indicesDeGarantias(db);
  return db.warranties
    .slice()
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .map((warranty) => armarWarrantyView(warranty, indices));
};

export interface MovementRow {
  id: string;
  createdAt: string;
  type: string;
  product?: Product;
  serial?: string;
  referenceType: string;
  referenceId?: string;
  notes?: string;
  userEmail?: string;
}

export const getMovementRows = (db: Db, limit = 200): MovementRow[] => {
  const unidades = porId(db.units);
  const productos = porId(db.products);
  const usuarios = porId(db.users);

  return db.movements.slice(0, limit).map((movement) => {
    const unit = movement.unitId ? unidades.get(movement.unitId) : undefined;
    return {
      id: movement.id,
      createdAt: movement.createdAt,
      type: movement.type,
      product: movement.productId ? productos.get(movement.productId) : undefined,
      serial: unit?.serial,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      notes: movement.notes,
      userEmail: movement.createdBy ? usuarios.get(movement.createdBy)?.email : undefined,
    };
  });
};

export interface UnitTimelineItem {
  id: string;
  fecha: string;
  tipo: string;
  descripcion: string;
  usuario?: string;
  /** Pedido, recepción o garantía a la que pertenece el evento, para poder abrirla. */
  enlace?: { to: string; codigo: string };
}

/**
 * Ruta para abrir una recepción. Confirmada: la lista de equipos que entraron en ella (con el
 * serial indicado resaltado). En captura: la pantalla de captura, donde aún se pueden agregar.
 */
export const rutaDeRecepcion = (
  reception: Pick<Reception, "id" | "status">,
  serial?: string,
): string =>
  reception.status === "confirmada"
    ? `/recepcion?ver=${reception.id}${serial ? `&serial=${encodeURIComponent(serial)}` : ""}`
    : `/recepcion/nueva/${reception.id}`;

/**
 * Ruta y código del pedido, recepción o garantía a la que apunta un movimiento. Solo devuelve
 * algo si ese registro todavía existe: nunca se enlaza a una pantalla que no se puede abrir.
 */
/** Navega a la bandeja operativa de la garantía y resalta el caso. */
const enlaceOperativoGarantia = (warranty: Warranty): string => {
  const tab = warranty.status === "recibido" ? "recibidos"
    : warranty.status === "en_servicio_tecnico" ? "servicio"
    : warranty.status === "reenvio_pendiente" ? "reenvio" : "historial";
  return `/garantias?tab=${tab}&focus=${encodeURIComponent(warranty.id)}`;
};

export const getEnlaceDeReferencia = (
  db: Db,
  referenceType: string | undefined,
  referenceId: string | undefined,
  serial?: string,
): { to: string; codigo: string } | undefined => {
  if (!referenceId) return undefined;
  if (referenceType === "pedido") {
    const order = db.orders.find((item) => item.id === referenceId);
    return order ? { to: `/pedidos/${order.id}`, codigo: order.code } : undefined;
  }
  if (referenceType === "recepcion") {
    const reception = db.receptions.find((item) => item.id === referenceId);
    return reception ? { to: rutaDeRecepcion(reception, serial), codigo: reception.code } : undefined;
  }
  if (referenceType === "garantia") {
    const warranty = db.warranties.find((item) => item.id === referenceId);
    return warranty ? { to: enlaceOperativoGarantia(warranty), codigo: warranty.code } : undefined;
  }
  return undefined;
};

/** De dónde viene y adónde fue un equipo: su recepción, su venta (con cliente) y sus garantías. */
export const getUnitOrigen = (db: Db, unit: Unit) => {
  const reception = db.receptions.find((item) => item.id === unit.receptionId);
  const row = db.orderItemUnits.find((item) => item.unitId === unit.id);
  const orderItem = row ? db.orderItems.find((item) => item.id === row.orderItemId) : undefined;
  const order = orderItem ? db.orders.find((item) => item.id === orderItem.orderId) : undefined;
  const customer = order ? db.customers.find((item) => item.id === order.customerId) : undefined;
  const warranties = db.warranties.filter((item) => item.unitId === unit.id);
  return { reception, order, customer, warranties };
};

/** Línea de tiempo completa de una unidad (movimientos + eventos de garantía). */
export const getUnitTimeline = (db: Db, unitId: string): UnitTimelineItem[] => {
  const items: UnitTimelineItem[] = [];
  const nameOf = (userId?: string) =>
    db.users.find((user) => user.id === userId)?.fullName;
  const serial = db.units.find((unit) => unit.id === unitId)?.serial;

  db.movements
    .filter((movement) => movement.unitId === unitId)
    .forEach((movement) => {
      items.push({
        id: `m-${movement.id}`,
        fecha: movement.createdAt,
        tipo: movement.type,
        descripcion: movement.notes ?? movement.type,
        usuario: nameOf(movement.createdBy),
        enlace: getEnlaceDeReferencia(db, movement.referenceType, movement.referenceId, serial),
      });
    });

  db.warranties
    .filter((warranty) => warranty.unitId === unitId || warranty.replacementUnitId === unitId)
    .forEach((warranty) => {
      const eventos = db.warrantyEvents.filter((event) => event.warrantyId === warranty.id);
      // Una garantía migrada del sistema anterior no trae eventos: sin esto no se vería en el
      // historial aunque exista. Se muestra una entrada con los datos de la propia garantía.
      if (eventos.length === 0) {
        items.push({
          id: `w-${warranty.id}`,
          fecha: warranty.receivedAt,
          tipo: "garantia",
          descripcion: `${warranty.code} · ${warranty.reason || "Registrada en garantía"}`,
          usuario: nameOf(warranty.createdBy),
          enlace: { to: `/garantias/${warranty.id}`, codigo: warranty.code },
        });
      }
      // La unidad entregada como reemplazo también debe tener la garantía en
      // su historial, aunque la garantía se abrió con otro serial.
      if (warranty.replacementUnitId === unitId && warranty.unitId !== unitId) {
        const original = db.units.find((unit) => unit.id === warranty.unitId)?.serial
          ?? warranty.imeiManual ?? "equipo original";
        items.push({
          id: `w-reemplazo-${warranty.id}-${unitId}`,
          fecha: warranty.resolvedAt ?? warranty.receivedAt,
          tipo: "garantia",
          descripcion: `Entregado como reemplazo de ${original} en garantía ${warranty.code}`,
          usuario: nameOf(warranty.createdBy),
          enlace: { to: enlaceOperativoGarantia(warranty), codigo: warranty.code },
        });
      }
      eventos.forEach((event) => {
        items.push({
          id: `w-${event.id}`,
          fecha: event.createdAt,
          tipo: "garantia",
          descripcion: `${warranty.code} · ${event.notes ?? event.status}`,
          usuario: nameOf(event.createdBy),
          enlace: { to: `/garantias/${warranty.id}`, codigo: warranty.code },
        });
      });
    });

  return items.sort((a, b) => a.fecha.localeCompare(b.fecha));
};

export interface ProductRanking {
  product: Product;
  quantity: number;
  revenue: number;
  ordersCount: number;
}

export interface CustomerRanking {
  customer?: Customer;
  total: number;
  /** Total de unidades (celulares) compradas en pedidos despachados. */
  units: number;
  ordersCount: number;
}

export interface LowStockItem {
  row: ProductRow;
  /** Unidades disponibles de esa condición. */
  disponible: number;
}

export interface DashboardData {
  kpis: {
    available: number;
    lowStockProducts: number;
    openOrders: number;
    openWarranties: number;
    /** Garantías abiertas sin movimiento hace DIAS_GARANTIA_ESTANCADA días o más. */
    staleWarranties: number;
    receivedThisMonth: number;
    inventoryValue: number;
  };
  lowStock: ProductRow[];
  /** Celulares con menos de STOCK_BAJO_CELULARES unidades disponibles, por condición. */
  lowStockCelulares: Record<UnitCondition, LowStockItem[]>;
  /** Productos que no son celulares y están por debajo de su mínimo. */
  lowStockOtros: ProductRow[];
  openOrders: OrderView[];
  /** Garantías abiertas, las que llevan más tiempo sin moverse primero. */
  openWarranties: WarrantyView[];
  /** Solo las estancadas (mismo orden). */
  staleWarranties: WarrantyView[];
  topProducts: ProductRanking[];
  topCustomers: CustomerRanking[];
  /**
   * ¿Los pedidos despachados tienen precios cargados? Si no, el ranking de
   * clientes se muestra por unidades en lugar de por monto.
   */
  hasAmounts: boolean;
}

const OPEN_ORDER_STATUSES = ["en_preparacion"];

export const getDashboard = (db: Db): DashboardData => {
  const rows = getProductRows(db);
  const productos = porId(db.products);
  const available = db.units.filter(
    (unit) => unit.status === "en_bodega" || unit.status === "en_local",
  ).length;
  const fueraPorGarantia = unidadesFueraPorGarantia(db);
  const inventoryValue = db.units
    .filter(
      (unit) =>
        !fueraPorGarantia.has(unit.id) &&
        (unit.status === "en_bodega" ||
          unit.status === "en_local" ||
          unit.status === "en_reparacion" ||
          unit.status === "defectuoso"),
    )
    .reduce((sum, unit) => {
      const product = productos.get(unit.productId);
      return sum + (unit.cost ?? product?.cost ?? 0);
    }, 0);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Rankings de ventas: solo celulares en pedidos despachados.
  const dispatched = db.orders.filter((order) => order.status === "despachado");
  const byProduct = new Map<
    string,
    { quantity: number; revenue: number; orders: Set<string> }
  >();
  const byCustomer = new Map<string, { total: number; units: number; orders: Set<string> }>();
  let hayMontos = false;

  dispatched.forEach((order) => {
    const celularItems = db.orderItems.filter(
      (item) =>
        item.orderId === order.id &&
        productos.get(item.productId)?.categoria === "celular",
    );
    if (celularItems.length === 0) return;

    const customerAgg = byCustomer.get(order.customerId) ?? {
      total: 0,
      units: 0,
      orders: new Set<string>(),
    };
    customerAgg.orders.add(order.id);
    byCustomer.set(order.customerId, customerAgg);

    celularItems.forEach((item) => {
      if (item.subtotal > 0) hayMontos = true;
      customerAgg.total += item.subtotal;
      customerAgg.units += item.quantity;
      const agg = byProduct.get(item.productId) ?? {
        quantity: 0,
        revenue: 0,
        orders: new Set<string>(),
      };
      agg.quantity += item.quantity;
      agg.revenue += item.subtotal;
      agg.orders.add(order.id);
      byProduct.set(item.productId, agg);
    });
  });

  const topProducts: ProductRanking[] = [...byProduct.entries()]
    .map(([productId, agg]) => {
      const product = productos.get(productId);
      return product
        ? {
            product,
            quantity: agg.quantity,
            revenue: agg.revenue,
            ordersCount: agg.orders.size,
          }
        : undefined;
    })
    .filter((row): row is ProductRanking => Boolean(row))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 5);

  const topCustomers: CustomerRanking[] = [...byCustomer.entries()]
    .map(([customerId, agg]) => ({
      customer: db.customers.find((item) => item.id === customerId),
      total: agg.total,
      units: agg.units,
      ordersCount: agg.orders.size,
    }))
    .filter((row) => Boolean(row.customer))
    // Si los pedidos no tienen montos cargados (todos 0), el orden lo definen
    // las unidades para que el ranking siga siendo el de los que más compran.
    .sort((a, b) => b.total - a.total || b.units - a.units)
    .slice(0, 5);

  const ahora = Date.now();
  const garantiasAbiertas = getWarrantyViews(db)
    .filter((view) => view.open)
    .map((view) => ({ view, dias: diasSinMovimiento(view, ahora) }))
    .sort((a, b) => b.dias - a.dias);
  const garantiasEstancadas = garantiasAbiertas
    .filter((item) => item.dias >= DIAS_GARANTIA_ESTANCADA)
    .map((item) => item.view);

  return {
    kpis: {
      available,
      lowStockProducts: rows.filter((row) => row.product.isActive && row.stock.lowStock).length,
      openOrders: db.orders.filter((order) => OPEN_ORDER_STATUSES.includes(order.status)).length,
      openWarranties: db.warranties.filter((warranty) => isOpenWarranty(warranty.status)).length,
      staleWarranties: garantiasEstancadas.length,
      receivedThisMonth: db.movements
        .filter(
          (movement) =>
            movement.type === "entrada" && new Date(movement.createdAt) >= monthStart,
        )
        .reduce((sum, movement) => sum + movement.quantity, 0),
      inventoryValue,
    },
    lowStock: rows
      .filter((row) => row.product.isActive && row.stock.lowStock)
      .sort((a, b) => a.stock.disponible - b.stock.disponible),
    lowStockCelulares: {
      nuevo: rows
        .filter((row) => row.product.isActive && row.stock.lowStockNuevo)
        .map((row) => ({ row, disponible: row.stock.nuevoDisponible }))
        .sort((a, b) => a.disponible - b.disponible),
      seminuevo: rows
        .filter((row) => row.product.isActive && row.stock.lowStockSeminuevo)
        .map((row) => ({ row, disponible: row.stock.seminuevoDisponible }))
        .sort((a, b) => a.disponible - b.disponible),
    },
    lowStockOtros: rows
      .filter(
        (row) =>
          row.product.isActive &&
          row.stock.lowStock &&
          !row.stock.lowStockNuevo &&
          !row.stock.lowStockSeminuevo,
      )
      .sort((a, b) => a.stock.disponible - b.stock.disponible),
    openOrders: getOrderViews(db).filter((view) => OPEN_ORDER_STATUSES.includes(view.order.status)),
    openWarranties: garantiasAbiertas.map((item) => item.view),
    staleWarranties: garantiasEstancadas,
    topProducts,
    topCustomers,
    hasAmounts: hayMontos,
  };
};

/** Unidades disponibles de un producto (bodega o local), de la más antigua a la más nueva. */
export const getAvailableUnits = (db: Db, productId: string): Unit[] =>
  db.units
    .filter(
      (unit) =>
        unit.productId === productId &&
        (unit.status === "en_bodega" || unit.status === "en_local") &&
        !db.orderItemUnits.some((row) => row.unitId === unit.id),
    )
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

/**
 * Unidades que pueden entregarse como reemplazo en una garantía. Con producto conocido solo se
 * ofrecen las de ese producto; en una garantía previa (sin producto en el sistema) se ofrecen
 * todas las disponibles, porque no hay a qué producto compararlas.
 */
export const getReplacementUnits = (db: Db, productId?: string): Unit[] =>
  productId
    ? getAvailableUnits(db, productId)
    : db.units
        .filter(
          (unit) =>
            (unit.status === "en_bodega" || unit.status === "en_local") &&
            !db.orderItemUnits.some((row) => row.unitId === unit.id),
        )
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

/** Ubicación legible de una unidad según su estado. */
export const unitLocation = (status: Unit["status"]): string => {
  if (status === "en_bodega" || status === "defectuoso") return "bodega";
  if (status === "en_local") return "local";
  if (status === "vendido" || status === "entregado_garantia") return "cliente";
  if (status === "en_reparacion" || status === "en_transito") return "tecnico";
  return "sistema";
};
