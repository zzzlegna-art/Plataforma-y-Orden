import type { ExcelSheet } from "@/lib/export";
import type {
  Db,
  MovementReference,
  MovementType,
  OrderStatus,
  ReceptionStatus,
  WarrantyResolution,
  WarrantyStatus,
} from "@/lib/types";

const MOVEMENT_LABELS: Record<MovementType, string> = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste",
  devolucion: "Devolución",
  garantia: "Garantía",
  liberacion: "Liberación",
  correccion: "Corrección",
};

const REFERENCE_LABELS: Record<MovementReference, string> = {
  recepcion: "Recepción",
  pedido: "Pedido",
  garantia: "Garantía",
  manual: "Manual",
};

const RECEPTION_STATUS_LABELS: Record<ReceptionStatus, string> = {
  captura: "En captura",
  confirmada: "Confirmada",
  descartada: "Descartada",
};

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  en_preparacion: "En preparación",
  despachado: "Despachado",
  cancelado: "Cancelado",
};

const WARRANTY_STATUS_LABELS: Record<WarrantyStatus, string> = {
  recibido: "Recibido",
  en_servicio_tecnico: "En servicio técnico",
  reenvio_pendiente: "Reenvío pendiente",
  entregado: "Entregado",
  devuelto: "Devuelto",
};

const WARRANTY_RESOLUTION_LABELS: Record<WarrantyResolution, string> = {
  reparado: "Reparado",
  cambio: "Cambio",
  sin_falla: "Sin falla",
  defectuoso: "Defectuoso",
};

/** Formatea fechas ISO sin convertirlas de zona horaria ni cambiar el día registrado. */
const fechaLegible = (value?: string | null): string => {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!match) return value;
  const [, year, month, day, hour, minute] = match;
  return hour ? `${day}/${month}/${year} ${hour}:${minute}` : `${day}/${month}/${year}`;
};

const enRango = (value: string | undefined, desde: string, hasta: string): boolean => {
  if (!value) return false;
  const day = value.slice(0, 10);
  return (!desde || day >= desde) && (!hasta || day <= hasta);
};

const textoRango = (desde: string, hasta: string): string =>
  `${desde ? fechaLegible(desde) : "Inicio"} — ${hasta ? fechaLegible(hasta) : "Hoy"}`;

const totalCantidad = (values: { quantity: number }[]): number =>
  values.reduce((total, item) => total + item.quantity, 0);

/**
 * Construye las hojas del informe operativo para que CSV y Excel compartan el mismo periodo.
 * El libro queda organizado en resumen ejecutivo y tablas de detalle listas para filtrar.
 */
export const buildOperationalReportSheets = (
  db: Db,
  desde: string,
  hasta: string,
  generadoEn: Date = new Date(),
): ExcelSheet[] => {
  const dentro = (value: string | undefined) => enRango(value, desde, hasta);
  const moneda = db.settings.currency || "COP";
  const periodo = textoRango(desde, hasta);
  const generado = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(generadoEn);

  const productos = new Map(db.products.map((item) => [item.id, item]));
  const unidades = new Map(db.units.map((item) => [item.id, item]));
  const usuarios = new Map(db.users.map((item) => [item.id, item]));
  const clientes = new Map(db.customers.map((item) => [item.id, item]));
  const tecnicos = new Map(db.tecnicos.map((item) => [item.id, item]));

  const movimientos = db.movements
    .filter((item) => dentro(item.createdAt))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const recepciones = db.receptions
    .filter((item) => dentro(item.receivedAt))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const pedidos = db.orders
    .filter((item) => dentro(item.orderDate))
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  const garantiasRecibidas = db.warranties.filter((item) => dentro(item.receivedAt));
  const garantiasCerradas = db.warranties.filter((item) => dentro(item.resolvedAt));
  const garantias = db.warranties
    .filter((item) => dentro(item.receivedAt) || dentro(item.resolvedAt))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  const idsRecepciones = new Set(recepciones.map((item) => item.id));
  const itemsRecepcion = db.receptionItems.filter((item) => idsRecepciones.has(item.receptionId));
  const idsPedidos = new Set(pedidos.map((item) => item.id));
  const itemsPedido = db.orderItems.filter((item) => idsPedidos.has(item.orderId));
  const cantidadMovimientos = (tipo: MovementType) =>
    movimientos.filter((item) => item.type === tipo).reduce((total, item) => total + item.quantity, 0);
  const cantidadPedidos = itemsPedido.reduce((total, item) => total + item.quantity, 0);
  const valorPedidos = pedidos.reduce((total, item) => total + item.total, 0);
  const costoGarantiasCerradas = garantiasCerradas.reduce((total, item) => total + (item.costo ?? 0), 0);

  const subtitulo = (cantidad: number) =>
    `Periodo: ${periodo} · Generado: ${generado} · ${cantidad} registros`;

  const resumenRows: (string | number)[][] = [
    ["Periodo consultado", periodo, "Fechas inclusivas según la fecha de cada operación"],
    ["Generado el", generado, "Fecha y hora de creación de este archivo"],
    ["Movimientos registrados", movimientos.length, "Incluye entradas, salidas, ajustes y demás movimientos"],
    ["Entradas (unidades)", cantidadMovimientos("entrada"), "Suma de las cantidades registradas como entrada"],
    ["Salidas (unidades)", cantidadMovimientos("salida"), "Suma de las cantidades registradas como salida"],
    ["Devoluciones (unidades)", cantidadMovimientos("devolucion"), "Suma de las cantidades registradas como devolución"],
    ["Otros movimientos (unidades)", movimientos
      .filter((item) => !["entrada", "salida", "devolucion"].includes(item.type))
      .reduce((total, item) => total + item.quantity, 0), "Ajustes, garantías, liberaciones y correcciones"],
    ["Recepciones registradas", recepciones.length, "Filtradas por fecha de recepción"],
    ["Unidades en recepciones", itemsRecepcion.length, "Líneas/seriales vinculados a las recepciones del periodo"],
    ["Pedidos registrados", pedidos.length, "Filtrados por fecha del pedido; incluye todos los estados"],
    ["Unidades pedidas", cantidadPedidos, "Suma de cantidades en las líneas de pedido del periodo"],
    [`Valor total de pedidos (${moneda})`, valorPedidos, "Suma del total guardado en cada pedido del periodo"],
    ["Garantías recibidas", garantiasRecibidas.length, "Filtradas por fecha de recepción"],
    ["Garantías cerradas", garantiasCerradas.length, "Filtradas por fecha de resolución"],
    [`Costo de garantías cerradas (${moneda})`, costoGarantiasCerradas, "Suma de costos registrados en las garantías resueltas durante el periodo"],
    ["Garantías con actividad", garantias.length, "Casos recibidos o resueltos durante el periodo"],
  ];

  const movimientoRows = movimientos.map((item) => {
    const producto = productos.get(item.productId);
    const unidad = item.unitId ? unidades.get(item.unitId) : undefined;
    const usuario = usuarios.get(item.createdBy);
    return [
      fechaLegible(item.createdAt),
      MOVEMENT_LABELS[item.type] ?? item.type,
      item.quantity,
      producto?.name ?? "",
      producto?.sku ?? "",
      unidad?.serial ?? "",
      REFERENCE_LABELS[item.referenceType] ?? item.referenceType,
      item.referenceId ?? "",
      item.notes ?? "",
      usuario?.fullName ?? usuario?.email ?? "",
    ];
  });

  const recepcionRows = recepciones.map((item) => {
    const lineas = itemsRecepcion.filter((line) => line.receptionId === item.id);
    const costo = lineas.reduce((total, line) => total + (line.cost ?? 0), 0);
    const usuario = usuarios.get(item.createdBy);
    return [
      fechaLegible(item.receivedAt),
      item.code,
      item.reference ?? "",
      RECEPTION_STATUS_LABELS[item.status] ?? item.status,
      lineas.length,
      costo,
      fechaLegible(item.confirmedAt),
      item.notes ?? "",
      usuario?.fullName ?? usuario?.email ?? "",
    ];
  });

  const pedidoRows = pedidos.map((item) => {
    const lineas = itemsPedido.filter((line) => line.orderId === item.id);
    const detalle = lineas.map((line) => {
      const producto = productos.get(line.productId);
      return `${producto?.name ?? "Producto"} × ${line.quantity}`;
    }).join(" · ");
    const cliente = clientes.get(item.customerId);
    const usuario = usuarios.get(item.createdBy);
    return [
      fechaLegible(item.orderDate),
      item.code,
      cliente?.name ?? "Cliente no disponible",
      ORDER_STATUS_LABELS[item.status] ?? item.status,
      lineas.reduce((total, line) => total + line.quantity, 0),
      detalle,
      item.total,
      fechaLegible(item.deliveryDate),
      item.notes ?? "",
      usuario?.fullName ?? usuario?.email ?? "",
    ];
  });

  const garantiaRows = garantias.map((item) => {
    const unidad = item.unitId ? unidades.get(item.unitId) : undefined;
    const producto = item.productId
      ? productos.get(item.productId)
      : unidad ? productos.get(unidad.productId) : undefined;
    const cliente = item.customerId ? clientes.get(item.customerId) : undefined;
    const tecnico = item.tecnicoId ? tecnicos.get(item.tecnicoId) : undefined;
    return [
      fechaLegible(item.receivedAt),
      item.code,
      producto?.name ?? item.referenciaManual ?? "",
      unidad?.serial ?? item.imeiManual ?? "",
      cliente?.name ?? item.clienteManual ?? "",
      item.reason,
      WARRANTY_STATUS_LABELS[item.status] ?? item.status,
      item.diagnostico ?? "",
      item.resolucion ? WARRANTY_RESOLUTION_LABELS[item.resolucion] ?? item.resolucion : "",
      item.costo ?? "",
      fechaLegible(item.resolvedAt),
      tecnico?.nombre ?? "",
      item.notes ?? "",
    ];
  });

  return [
    {
      name: "Resumen",
      title: "NEXORA · Reporte operativo",
      subtitle: `Periodo: ${periodo} · Generado: ${generado} · Moneda: ${moneda}`,
      columns: ["Indicador", "Valor", "Detalle"],
      rows: resumenRows,
      columnWidths: [42, 24, 78],
      wrapColumns: [0, 2],
      freezeRows: 4,
    },
    {
      name: "Movimientos",
      title: "Detalle de movimientos",
      subtitle: subtitulo(movimientos.length),
      columns: ["Fecha y hora", "Tipo", "Cantidad", "Producto / referencia", "SKU", "Serial / IMEI", "Origen", "Código de referencia", "Notas", "Registrado por"],
      rows: movimientoRows,
      columnWidths: [21, 20, 12, 34, 18, 24, 18, 30, 42, 28],
      wrapColumns: [3, 8, 9],
      numberFormats: { 2: "#,##0" },
      freezeRows: 4,
    },
    {
      name: "Recepciones",
      title: "Recepciones de inventario",
      subtitle: subtitulo(recepciones.length),
      columns: ["Fecha de recepción", "Código", "Referencia / proveedor", "Estado", "Unidades", `Costo registrado (${moneda})`, "Fecha de confirmación", "Notas", "Registrado por"],
      rows: recepcionRows,
      columnWidths: [21, 18, 32, 20, 12, 22, 23, 42, 28],
      wrapColumns: [2, 7, 8],
      numberFormats: { 4: "#,##0", 5: "#,##0" },
      freezeRows: 4,
    },
    {
      name: "Pedidos",
      title: "Pedidos del periodo",
      subtitle: subtitulo(pedidos.length),
      columns: ["Fecha", "Código", "Cliente", "Estado", "Unidades", "Detalle de referencias", `Total (${moneda})`, "Fecha de entrega", "Notas", "Registrado por"],
      rows: pedidoRows,
      columnWidths: [16, 18, 30, 21, 12, 48, 20, 19, 40, 28],
      wrapColumns: [2, 5, 8, 9],
      numberFormats: { 4: "#,##0", 6: "#,##0" },
      freezeRows: 4,
    },
    {
      name: "Garantías",
      title: "Garantías con actividad en el periodo",
      subtitle: subtitulo(garantias.length),
      columns: ["Fecha de recepción", "Código", "Producto / referencia", "Serial / IMEI", "Cliente", "Motivo", "Estado", "Diagnóstico", "Resolución", `Costo (${moneda})`, "Fecha de cierre", "Técnico", "Notas"],
      rows: garantiaRows,
      columnWidths: [21, 18, 32, 24, 28, 38, 23, 40, 20, 18, 20, 25, 40],
      wrapColumns: [2, 4, 5, 7, 11, 12],
      numberFormats: { 9: "#,##0" },
      freezeRows: 4,
    },
  ];
};
