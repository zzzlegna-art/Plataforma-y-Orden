/**
 * Capa de acceso al backend (Supabase).
 *
 * La app sigue trabajando sobre el modelo de dominio (`Db`) en memoria, pero
 * ahora ese modelo se carga desde el servidor al iniciar sesión y cada acción
 * sube únicamente las filas que cambiaron (altas, modificaciones y bajas).
 * Así ninguna página ni acción de dominio necesita saber que existe un backend.
 */

import { supabase } from "@/integrations/supabase/client";

import { DomainError, emptyDb } from "./db";
import { getProductTechnicalSpecsForCategory } from "./product-specs";
import { soloFecha } from "./dates";
import type {
  AuditLog,
  Brand,
  Category,
  Customer,
  Db,
  Order,
  OrderItem,
  OrderItemUnit,
  Product,
  ProductType,
  Reception,
  ReceptionItem,
  SerialPrevio,
  StockMovement,
  Technician,
  Unit,
  User,
  Warranty,
  WarrantyEvent,
} from "./types";

type Fila = Record<string, unknown>;

type Consulta = {
  eq: (columna: string, valor: string) => Consulta;
  order: (columna: string, opciones?: { ascending?: boolean }) => Consulta;
  range: (
    desde: number,
    hasta: number,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
  maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

type TablaRemota = {
  select: (columnas?: string) => Consulta;
  insert: (filas: Fila[]) => PromiseLike<{ error: { message: string; code?: string } | null }>;
  upsert: (
    filas: Fila[],
    opciones: { onConflict: string },
  ) => PromiseLike<{ error: { message: string; code?: string } | null }>;
  delete: () => {
    in: (
      columna: string,
      ids: string[],
    ) => PromiseLike<{ error: { message: string; code?: string } | null }>;
  };
};

type ErrorRemoto = { message: string; code?: string };

const nube = supabase as unknown as {
  from: (tabla: string) => TablaRemota;
  rpc: (
    funcion: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: ErrorRemoto | null }>;
};

/** Colecciones del dominio que viven en el backend. */
type Coleccion = Exclude<keyof Db, "version" | "settings">;

type Spec<T> = {
  coleccion: Coleccion;
  tabla: string;
  /** Cuántas filas se traen como máximo (para bitácoras muy largas). */
  tope?: number;
  orden?: string;
  /** Más viejo primero (por ejemplo, seriales en el orden en que se fueron escaneando). Sin
   * esto, `orden` trae lo más nuevo primero (para bitácoras/movimientos). */
  ordenAscendente?: boolean;
  /** Las bitácoras solo crecen: nunca se borran filas desde la app. */
  borrable?: boolean;
  /**
   * Filas que solo se agregan (nunca se modifican). Se guardan con
   * "ignorar duplicados", que no necesita permiso de actualización.
   */
  soloAlta?: boolean;
  aFila: (item: T) => Fila;
  desdeFila: (fila: Fila) => T;
};

const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;

const nulo = <T,>(valor: T | null | undefined): T | null =>
  valor === null || valor === undefined ? null : valor;

const numero = (valor: unknown): number => {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const fecha = (valor: unknown): string => texto(valor) ?? new Date().toISOString();

const lista = <T,>(valor: unknown): T[] => (Array.isArray(valor) ? (valor as T[]) : []);

const spec = <T,>(definicion: Spec<T>): Spec<unknown> => definicion as unknown as Spec<unknown>;

/**
 * Orden pensado para respetar las referencias al crear filas
 * (catálogo → inventario → comercio → garantías → bitácoras).
 */
const ESPECIFICACIONES: Spec<unknown>[] = [
  spec<Category>({
    coleccion: "categories",
    tabla: "bodega_categories",
    borrable: true,
    aFila: (c) => ({
      id: c.id,
      name: c.name,
      description: nulo(c.description),
      created_at: c.createdAt,
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      name: texto(f.name) ?? "Sin nombre",
      description: texto(f.description) ?? undefined,
      createdAt: fecha(f.created_at),
    }),
  }),
  spec<ProductType>({
    coleccion: "productTypes",
    tabla: "bodega_product_types",
    borrable: true,
    aFila: (t) => ({
      id: t.id,
      key: t.key,
      name: t.name,
      mayorista_group: t.mayoristaGroup,
      created_at: t.createdAt,
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      key: texto(f.key) ?? "",
      name: texto(f.name) ?? "Sin nombre",
      mayoristaGroup: (texto(f.mayorista_group) as ProductType["mayoristaGroup"]) ?? "celulares",
      createdAt: fecha(f.created_at),
    }),
  }),
  spec<Brand>({
    coleccion: "brands",
    tabla: "bodega_brands",
    borrable: true,
    aFila: (b) => ({ id: b.id, name: b.name, created_at: b.createdAt }),
    desdeFila: (f) => ({
      id: String(f.id),
      name: texto(f.name) ?? "Sin nombre",
      createdAt: fecha(f.created_at),
    }),
  }),
  spec<Product>({
    coleccion: "products",
    tabla: "bodega_products",
    borrable: true,
    aFila: (p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: nulo(p.description),
      image_url: nulo(p.imageUrl),
      technical_specs: p.technicalSpecs ?? {},
      category_id: nulo(p.categoryId),
      brand_id: nulo(p.brandId),
      categoria: nulo(p.categoria),
      tipo_repuesto: nulo(p.tipoRepuesto),
      price: numero(p.price),
      cost: numero(p.cost),
      min_stock: numero(p.minStock),
      is_active: p.isActive !== false,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      sku: texto(f.sku) ?? "",
      name: texto(f.name) ?? "Sin nombre",
      description: texto(f.description) ?? undefined,
      imageUrl: texto(f.image_url) ?? undefined,
      technicalSpecs: getProductTechnicalSpecsForCategory(
        texto(f.categoria) ?? undefined,
        f.technical_specs as Product["technicalSpecs"],
      ),
      categoryId: texto(f.category_id) ?? undefined,
      brandId: texto(f.brand_id) ?? undefined,
      categoria: (texto(f.categoria) as Product["categoria"]) ?? undefined,
      tipoRepuesto: (texto(f.tipo_repuesto) as Product["tipoRepuesto"]) ?? undefined,
      price: numero(f.price),
      cost: numero(f.cost),
      minStock: numero(f.min_stock),
      isActive: f.is_active !== false,
      createdAt: fecha(f.created_at),
      updatedAt: fecha(f.updated_at),
      // Solo lectura: el control físico las escribe con funciones propias del servidor.
      controlStartedAt: f.control_started_at ? fecha(f.control_started_at) : undefined,
      controlStartedBy: texto(f.control_started_by) ?? undefined,
    }),
  }),
  spec<Customer>({
    coleccion: "customers",
    tabla: "bodega_customers",
    borrable: true,
    aFila: (c) => ({
      id: c.id,
      name: c.name,
      tipo: nulo(c.tipo),
      categoria_mayorista: nulo(c.categoriaMayorista),
      tax_id: nulo(c.taxId),
      contact_name: nulo(c.contactName),
      email: nulo(c.email),
      phone: nulo(c.phone),
      address: nulo(c.address),
      notes: nulo(c.notes),
      is_active: c.isActive !== false,
      created_at: c.createdAt,
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      name: texto(f.name) ?? "Sin nombre",
      tipo: (texto(f.tipo) as Customer["tipo"]) ?? undefined,
      categoriaMayorista:
        (texto(f.categoria_mayorista) as Customer["categoriaMayorista"]) ?? undefined,
      taxId: texto(f.tax_id) ?? undefined,
      contactName: texto(f.contact_name) ?? undefined,
      email: texto(f.email) ?? undefined,
      phone: texto(f.phone) ?? undefined,
      address: texto(f.address) ?? undefined,
      notes: texto(f.notes) ?? undefined,
      isActive: f.is_active !== false,
      createdAt: fecha(f.created_at),
    }),
  }),
  spec<Order>({
    coleccion: "orders",
    tabla: "bodega_orders",
    borrable: true,
    aFila: (o) => ({
      id: o.id,
      code: o.code,
      customer_id: nulo(o.customerId),
      status: o.status,
      order_date: o.orderDate,
      delivery_date: nulo(o.deliveryDate),
      notes: nulo(o.notes),
      total: numero(o.total),
      created_by: nulo(o.createdBy),
      created_at: o.createdAt,
      updated_at: o.updatedAt,
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      code: texto(f.code) ?? "PED",
      customerId: texto(f.customer_id) ?? "",
      status: (texto(f.status) as Order["status"]) ?? "en_preparacion",
      // Solo la fecha de calendario: recortar el texto evita que el navegador reinterprete
      // la medianoche UTC con su propia hora local (ver src/lib/dates.ts).
      orderDate: soloFecha(f.order_date) ?? fecha(f.order_date),
      deliveryDate: soloFecha(f.delivery_date),
      notes: texto(f.notes) ?? undefined,
      total: numero(f.total),
      createdBy: texto(f.created_by) ?? "",
      createdAt: fecha(f.created_at),
      updatedAt: fecha(f.updated_at),
    }),
  }),
  spec<OrderItem>({
    coleccion: "orderItems",
    tabla: "bodega_order_items",
    borrable: true,
    aFila: (i) => ({
      id: i.id,
      order_id: i.orderId,
      product_id: nulo(i.productId),
      quantity: numero(i.quantity),
      unit_condition: nulo(i.condition),
      unit_price: numero(i.unitPrice),
      subtotal: numero(i.subtotal),
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      orderId: String(f.order_id),
      productId: texto(f.product_id) ?? "",
      quantity: numero(f.quantity),
      condition: (texto(f.unit_condition) as OrderItem["condition"]) ?? undefined,
      unitPrice: numero(f.unit_price),
      subtotal: numero(f.subtotal),
    }),
  }),
  spec<OrderItemUnit>({
    coleccion: "orderItemUnits",
    tabla: "bodega_order_item_units",
    borrable: true,
    // Igual que con receptionItems: en el orden en que se fueron serializando, no por un
    // identificador interno al azar.
    orden: "created_at",
    ordenAscendente: true,
    aFila: (u) => ({
      id: u.id,
      order_item_id: u.orderItemId,
      unit_id: nulo(u.unitId),
      created_at: u.createdAt,
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      orderItemId: String(f.order_item_id),
      unitId: texto(f.unit_id) ?? "",
      createdAt: fecha(f.created_at),
    }),
  }),
  spec<Reception>({
    coleccion: "receptions",
    tabla: "bodega_receptions",
    borrable: true,
    aFila: (r) => ({
      id: r.id,
      code: r.code,
      reference: nulo(r.reference),
      status: r.status,
      received_at: r.receivedAt,
      confirmed_at: nulo(r.confirmedAt),
      notes: nulo(r.notes),
      created_by: nulo(r.createdBy),
      created_at: r.createdAt,
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      code: texto(f.code) ?? "REC",
      reference: texto(f.reference) ?? undefined,
      status: (texto(f.status) as Reception["status"]) ?? "captura",
      receivedAt: fecha(f.received_at),
      confirmedAt: texto(f.confirmed_at) ?? undefined,
      notes: texto(f.notes) ?? undefined,
      createdBy: texto(f.created_by) ?? "",
      createdAt: fecha(f.created_at),
    }),
  }),
  spec<ReceptionItem>({
    coleccion: "receptionItems",
    tabla: "bodega_reception_items",
    borrable: true,
    // Se muestran en el orden en que se escanearon (no por un identificador interno al azar):
    // sin esto, cada vez que la pantalla se sincronizaba de nuevo con el servidor, la lista se
    // reordenaba sola y parecía que los seriales "se movían" o desaparecían.
    orden: "created_at",
    ordenAscendente: true,
    aFila: (i) => ({
      id: i.id,
      reception_id: i.receptionId,
      product_id: i.productId,
      serial: i.serial,
      unit_condition: i.condition,
      cost: nulo(i.cost),
      created_at: i.createdAt,
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      receptionId: String(f.reception_id),
      productId: texto(f.product_id) ?? "",
      serial: texto(f.serial) ?? "",
      condition: (texto(f.unit_condition) as ReceptionItem["condition"]) ?? "nuevo",
      cost: f.cost === null || f.cost === undefined ? undefined : numero(f.cost),
      createdAt: fecha(f.created_at),
    }),
  }),
  spec<Unit>({
    coleccion: "units",
    tabla: "bodega_units",
    borrable: true,
    aFila: (u) => ({
      id: u.id,
      product_id: nulo(u.productId),
      serial: u.serial,
      unit_condition: u.condition,
      status: u.status,
      cost: nulo(u.cost),
      reception_id: nulo(u.receptionId),
      location: nulo(u.location),
      notes: nulo(u.notes),
      received_at: u.receivedAt,
      created_by: nulo(u.createdBy),
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      productId: texto(f.product_id) ?? "",
      serial: texto(f.serial) ?? "",
      condition: (texto(f.unit_condition) as Unit["condition"]) ?? "nuevo",
      status: (texto(f.status) as Unit["status"]) ?? "en_bodega",
      cost: f.cost === null || f.cost === undefined ? undefined : numero(f.cost),
      receptionId: texto(f.reception_id) ?? undefined,
      location: texto(f.location) ?? undefined,
      notes: texto(f.notes) ?? undefined,
      receivedAt: fecha(f.received_at),
      createdBy: texto(f.created_by) ?? "",
      // Solo lectura: las marcas del control físico las escribe el servidor (no se envían en
      // aFila, así una escritura normal de la unidad nunca puede pisarlas).
      checkedAt: f.checked_at ? fecha(f.checked_at) : undefined,
      checkedBy: texto(f.checked_by) ?? undefined,
    }),
  }),
  spec<StockMovement>({
    coleccion: "movements",
    tabla: "bodega_movements",
    // La interfaz toma los primeros N (getMovementRows): deben ser los más recientes.
    orden: "created_at",
    soloAlta: true,
    aFila: (m) => ({
      id: m.id,
      product_id: nulo(m.productId),
      unit_id: nulo(m.unitId),
      type: m.type,
      quantity: numero(m.quantity),
      reference_type: m.referenceType,
      reference_id: nulo(m.referenceId),
      notes: nulo(m.notes),
      created_by: nulo(m.createdBy),
      created_at: m.createdAt,
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      productId: texto(f.product_id) ?? "",
      unitId: texto(f.unit_id) ?? undefined,
      type: (texto(f.type) as StockMovement["type"]) ?? "ajuste",
      quantity: numero(f.quantity),
      referenceType:
        (texto(f.reference_type) as StockMovement["referenceType"]) ?? "manual",
      referenceId: texto(f.reference_id) ?? undefined,
      notes: texto(f.notes) ?? undefined,
      createdBy: texto(f.created_by) ?? "",
      createdAt: fecha(f.created_at),
    }),
  }),
  spec<Technician>({
    coleccion: "tecnicos",
    tabla: "bodega_technicians",
    borrable: true,
    aFila: (t) => ({ id: t.id, nombre: t.nombre, activo: t.activo !== false, created_at: t.createdAt }),
    desdeFila: (f) => ({
      id: String(f.id),
      nombre: texto(f.nombre) ?? "Técnico",
      activo: f.activo !== false,
      createdAt: fecha(f.created_at),
    }),
  }),
  spec<Warranty>({
    coleccion: "warranties",
    tabla: "bodega_warranties",
    borrable: true,
    aFila: (w) => ({
      id: w.id,
      code: w.code,
      unit_id: nulo(w.unitId),
      product_id: nulo(w.productId),
      customer_id: nulo(w.customerId),
      order_id: nulo(w.orderId),
      tecnico_id: nulo(w.tecnicoId),
      reason: w.reason,
      status: w.status,
      diagnostico: nulo(w.diagnostico),
      resolucion: nulo(w.resolucion),
      // Solo viaja cuando hay un reemplazo elegido: así guardar cualquier otra garantía no
      // depende de que esa columna ya exista en la base (la migración 0012).
      ...(w.replacementUnitId ? { replacement_unit_id: w.replacementUnitId } : {}),
      costo: nulo(w.costo),
      received_at: w.receivedAt,
      resolved_at: nulo(w.resolvedAt),
      notes: nulo(w.notes),
      imei_manual: nulo(w.imeiManual),
      referencia_manual: nulo(w.referenciaManual),
      cliente_manual: nulo(w.clienteManual),
      fecha_venta_manual: nulo(w.fechaVentaManual),
      created_by: nulo(w.createdBy),
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      code: texto(f.code) ?? "GAR",
      unitId: texto(f.unit_id) ?? undefined,
      productId: texto(f.product_id) ?? undefined,
      customerId: texto(f.customer_id) ?? undefined,
      orderId: texto(f.order_id) ?? undefined,
      tecnicoId: texto(f.tecnico_id) ?? undefined,
      reason: texto(f.reason) ?? "",
      status: (texto(f.status) as Warranty["status"]) ?? "recibido",
      diagnostico: texto(f.diagnostico) ?? undefined,
      resolucion: (texto(f.resolucion) as Warranty["resolucion"]) ?? undefined,
      replacementUnitId: texto(f.replacement_unit_id) ?? undefined,
      costo: f.costo === null || f.costo === undefined ? undefined : numero(f.costo),
      receivedAt: fecha(f.received_at),
      resolvedAt: texto(f.resolved_at) ?? undefined,
      notes: texto(f.notes) ?? undefined,
      imeiManual: texto(f.imei_manual) ?? undefined,
      referenciaManual: texto(f.referencia_manual) ?? undefined,
      clienteManual: texto(f.cliente_manual) ?? undefined,
      fechaVentaManual: texto(f.fecha_venta_manual) ?? undefined,
      createdBy: texto(f.created_by) ?? "",
    }),
  }),
  spec<WarrantyEvent>({
    coleccion: "warrantyEvents",
    tabla: "bodega_warranty_events",
    // Historial: la base (migración 0013) solo permite agregar. Nunca se modifica ni se borra.
    soloAlta: true,
    borrable: false,
    aFila: (e) => ({
      id: e.id,
      warranty_id: e.warrantyId,
      status: e.status,
      notes: nulo(e.notes),
      created_by: nulo(e.createdBy),
      created_at: e.createdAt,
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      warrantyId: String(f.warranty_id),
      status: (texto(f.status) as WarrantyEvent["status"]) ?? "recibido",
      notes: texto(f.notes) ?? undefined,
      createdBy: texto(f.created_by) ?? "",
      createdAt: fecha(f.created_at),
    }),
  }),
  spec<SerialPrevio>({
    coleccion: "serialesPrevios",
    tabla: "bodega_previous_serials",
    borrable: true,
    aFila: (s) => ({
      id: s.id,
      serial: s.serial,
      notas: nulo(s.notas),
      created_by: nulo(s.createdBy),
      created_at: s.createdAt,
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      serial: texto(f.serial) ?? "",
      notas: texto(f.notas) ?? undefined,
      createdBy: texto(f.created_by) ?? "",
      createdAt: fecha(f.created_at),
    }),
  }),
  spec<User>({
    coleccion: "users",
    tabla: "bodega_profiles",
    // El perfil no se borra desde la app: las cuentas se activan o desactivan.
    borrable: false,
    aFila: (u) => ({
      id: u.id,
      email: u.email,
      full_name: nulo(u.fullName),
      role: u.role,
      is_active: u.isActive !== false,
      created_at: u.createdAt,
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      email: texto(f.email) ?? "",
      fullName: texto(f.full_name) ?? texto(f.email) ?? "",
      role: f.role === "admin" ? "admin" : "bodeguero",
      isActive: f.is_active !== false,
      createdAt: fecha(f.created_at),
    }),
  }),
  spec<AuditLog>({
    coleccion: "auditLogs",
    tabla: "bodega_audit_logs",
    tope: 500,
    orden: "created_at",
    soloAlta: true,
    aFila: (a) => ({
      id: a.id,
      user_id: nulo(a.userId),
      user_email: nulo(a.userEmail),
      action: a.action,
      // Persist the product-type entity using the database's snake_case identifier.
      entity: a.entity === "productType" ? "product_type" : a.entity,
      entity_id: nulo(a.entityId),
      details: nulo(a.details),
      created_at: a.createdAt,
    }),
    desdeFila: (f) => ({
      id: String(f.id),
      userId: texto(f.user_id) ?? "",
      userEmail: texto(f.user_email) ?? "",
      action: (texto(f.action) as AuditLog["action"]) ?? "update",
      // Accept the normalized identifier and legacy camelCase rows from older open tabs.
      entity: texto(f.entity) === "product_type" || texto(f.entity) === "productType"
        ? "productType"
        : (texto(f.entity) as AuditLog["entity"]) ?? "session",
      entityId: texto(f.entity_id) ?? undefined,
      details: texto(f.details) ?? undefined,
      createdAt: fecha(f.created_at),
    }),
  }),
];

const leerColeccion = async (s: Spec<unknown>): Promise<unknown[]> => {
  const tamano = 1000;
  const tope = s.tope ?? Number.MAX_SAFE_INTEGER;
  const filas: Fila[] = [];

  for (let desde = 0; desde < tope; desde += tamano) {
    const hasta = Math.min(desde + tamano, tope) - 1;
    // Orden total y estable: sin él, las filas que cambian entre una página y la
    // siguiente pueden repetirse o saltarse.
    let consulta = nube.from(s.tabla).select("*");
    if (s.orden) consulta = consulta.order(s.orden, { ascending: s.ordenAscendente ?? false });
    consulta = consulta.order("id", { ascending: true });
    const { data, error } = await consulta.range(desde, hasta);
    if (error) {
      // Un inventario incompleto es peor que ninguno: se aborta la carga completa.
      throw new Error(`No se pudo leer ${s.tabla}: ${error.message}`);
    }
    const pagina = (data ?? []) as Fila[];
    filas.push(...pagina);
    if (pagina.length < tamano) break;
  }
  return filas;
};

const leerAjustes = async (): Promise<Db["settings"]> => {
  const { data, error } = await nube
    .from("bodega_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) {
    console.error(`No se pudieron leer los ajustes: ${error.message}`);
    return { currency: "MXN", companyName: "Bodega 6A" };
  }
  const fila = (data ?? {}) as Fila;
  return {
    currency: texto(fila.currency) ?? "MXN",
    companyName: texto(fila.company_name) ?? "Bodega 6A",
  };
};

/** Carga completa del inventario desde el servidor. */
export const pullDb = async (): Promise<Db> => {
  const db = emptyDb();
  const destino = db as unknown as Record<string, unknown>;

  await Promise.all(
    ESPECIFICACIONES.map(async (s) => {
      const filas = await leerColeccion(s);
      destino[s.coleccion] = filas.map((fila) => s.desdeFila(fila as Fila));
    }),
  );

  db.settings = await leerAjustes();
  return db;
};

/**
 * Los identificadores vacíos ("") del dominio viajan como NULL: en la base son
 * columnas uuid y una cadena vacía no es un identificador válido.
 */
const limpiarFila = (fila: Fila): Fila => {
  const salida: Fila = {};
  for (const [clave, valor] of Object.entries(fila)) {
    const esColumnaId = clave.endsWith("_id") || clave === "created_by";
    salida[clave] = esColumnaId && valor === "" ? null : valor;
  }
  return salida;
};

/**
 * Motivo técnico para el aviso genérico de guardado: así, cuando falla algo inesperado, la
 * pantalla dice por qué (permiso, columna, red…) en lugar de obligar a abrir la consola.
 */
export const detalleTecnico = (mensaje: unknown): string => {
  const texto = typeof mensaje === "string" ? mensaje.trim() : "";
  return texto ? ` (Motivo: ${texto.slice(0, 160)})` : "";
};

/**
 * Traduce un error del servidor a un aviso entendible. Las reglas de la base
 * (migración 0003) responden con mensajes propios cuando otro dispositivo se
 * adelantó, por ejemplo al asignar el mismo IMEI a dos pedidos a la vez.
 */
const traducirErrorServidor = (error: { message: string; code?: string }): DomainError => {
  const mensaje = error.message ?? "";
  if (mensaje.includes("BODEGA_CONFLICTO_CONCURRENCIA")) {
    return new DomainError("errors.saveFailed", { detalle: detalleTecnico("Otro usuario modificó este registro; actualiza la pantalla e inténtalo de nuevo") });
  }
  if (mensaje.includes("BODEGA_UNIDAD_YA_ASIGNADA")) {
    return new DomainError("errors.unitAlreadyAssigned");
  }
  const noDisponible = /BODEGA_UNIDAD_NO_DISPONIBLE:(.*)$/.exec(mensaje);
  if (noDisponible) {
    return new DomainError("errors.unitNotAvailable", { serial: noDisponible[1].trim() });
  }
  // 23505 = dato duplicado; 40P01 / 40001 = dos guardados se cruzaron y la base cortó uno.
  if (["23505", "40P01", "40001"].includes(error.code ?? "") || /duplicate key/i.test(mensaje)) {
    // Mismo mensaje que ya usa la validación al escanear: si dos escaneos del mismo serial se
    // cruzan (por ejemplo un lector que dispara dos veces con un solo movimiento), esa
    // validación en pantalla puede no alcanzar a atajar la segunda antes de guardarse; esta es
    // la última línea de defensa, y conviene que el aviso sea el mismo, no uno genérico de
    // "otro dispositivo" que aquí sería confuso (es el mismo dispositivo). El error de Postgres
    // siempre trae el nombre de la restricción/tabla en el texto, así que basta con mirarlo
    // (funciona tanto si se guardó por el camino atómico como por el de respaldo por tablas).
    if (mensaje.includes("reception_items")) {
      return new DomainError("errors.serialDuplicateInReception");
    }
    return new DomainError("errors.saveConflict");
  }
  return new DomainError("errors.saveFailed", { detalle: detalleTecnico(mensaje) });
};

const indexar = (db: Db, coleccion: Coleccion): Map<string, unknown> => {
  const items = lista<{ id: string }>((db as unknown as Record<string, unknown>)[coleccion]);
  return new Map(items.map((item) => [item.id, item]));
};

/** Un paso del guardado: agregar/modificar filas de una tabla, o borrarlas. */
export type Paso =
  | { op: "upsert"; tabla: string; solo_alta: boolean; filas: Fila[]; esperados?: Fila[]; nuevos?: string[] }
  | { op: "borrar"; tabla: string; ids: string[]; esperados?: Fila[] };

/**
 * Calcula QUÉ hay que guardar entre dos versiones del inventario, sin tocar el servidor.
 * El orden respeta las referencias entre tablas: primero se agrega/modifica (catálogo →
 * inventario → comercio → garantías → bitácoras), después se borra en orden inverso y,
 * al final, los ajustes.
 */
export const calcularPasos = (previo: Db, siguiente: Db): Paso[] => {
  const pasos: Paso[] = [];
  const bajas: Paso[] = [];

  // El historial de garantías es evidencia: solo se agregan eventos nuevos. Si una acción
  // intenta cambiar o quitar uno ya guardado, se corta aquí, antes de hablar con el servidor.
  const eventosDespues = indexar(siguiente, "warrantyEvents");
  for (const [id, evento] of indexar(previo, "warrantyEvents")) {
    const nuevo = eventosDespues.get(id);
    if (!nuevo || JSON.stringify(nuevo) !== JSON.stringify(evento)) {
      throw new DomainError("errors.warrantyHistoryLocked");
    }
  }

  for (const s of ESPECIFICACIONES) {
    const antes = indexar(previo, s.coleccion);
    const despues = indexar(siguiente, s.coleccion);

    const subir: Fila[] = [];
    const esperados: Fila[] = [];
    const nuevos: string[] = [];
    for (const [id, item] of despues) {
      const anterior = antes.get(id);
      if (!anterior || JSON.stringify(anterior) !== JSON.stringify(item)) {
        subir.push(s.aFila(item));
        if (anterior && !s.soloAlta) esperados.push(limpiarFila(s.aFila(anterior)));
        if (!anterior && !s.soloAlta) nuevos.push(id);
      }
    }
    if (subir.length > 0) {
      pasos.push({
        op: "upsert",
        tabla: s.tabla,
        solo_alta: s.soloAlta === true,
        filas: subir.map(limpiarFila),
        ...(esperados.length > 0 ? { esperados } : {}),
        ...(nuevos.length > 0 ? { nuevos } : {}),
      });
    }

    if (s.borrable) {
      const ids = [...antes.keys()].filter((id) => !despues.has(id));
      if (ids.length > 0) bajas.push({ op: "borrar", tabla: s.tabla, ids, esperados: ids.map((id) => limpiarFila(s.aFila(antes.get(id)))) });
    }
  }

  pasos.push(...bajas.reverse());

  if (JSON.stringify(previo.settings) !== JSON.stringify(siguiente.settings)) {
    pasos.push({
      op: "upsert",
      tabla: "bodega_settings",
      solo_alta: false,
      esperados: [{ id: "default", currency: previo.settings.currency, company_name: previo.settings.companyName }],
      filas: [
        {
          id: "default",
          currency: siguiente.settings.currency,
          company_name: siguiente.settings.companyName,
        },
      ],
    });
  }

  return pasos;
};

/**
 * Guardado atómico OBLIGATORIO: todos los pasos viajan en UNA llamada a la función
 * `bodega_aplicar_cambios` (migración 0004) y la base los aplica en una sola transacción:
 * o se guarda todo o no se guarda nada. Si la función no existe, no entiende el formato,
 * el paquete es demasiado grande o la respuesta no confirma `ok: true`, el guardado se
 * rechaza: nunca se vuelve a guardar tabla por tabla, porque eso podría dejar datos a medias.
 */
const LIMITE_ATOMICO = 3_000_000; // caracteres; por encima se rechaza (no se parte)

/** Solo para pruebas (se conserva por compatibilidad: ya no hay modos que reiniciar). */
export const reiniciarModoDeGuardado = () => undefined;

const funcionNoDisponible = (error: ErrorRemoto) =>
  ["PGRST202", "42883"].includes(error.code ?? "") ||
  /could not find the function|function .* does not exist/i.test(error.message ?? "");

/** Sube al servidor solo lo que cambió entre dos versiones del inventario. */
export const pushDb = async (previo: Db, siguiente: Db): Promise<void> => {
  const pasos = calcularPasos(previo, siguiente);
  if (pasos.length === 0) return;

  const cambios = { version: 1, pasos };
  if (JSON.stringify(cambios).length > LIMITE_ATOMICO) {
    console.error("El guardado es demasiado grande para hacerlo en una sola transacción");
    throw new DomainError("errors.saveFailed", {
      detalle: detalleTecnico("paquete demasiado grande"),
    });
  }

  const { data, error } = await nube.rpc("nexora_guardar_con_version", { p_cambios: cambios });
  if (error) {
    console.error(`No se pudo guardar: ${error.message}`);
    throw traducirErrorServidor(error);
  }
  // Solo cuenta como guardado si el servidor lo confirma de forma explícita.
  if (!data || (data as { ok?: unknown }).ok !== true) {
    console.error("El servidor no confirmó el guardado", data);
    throw new DomainError("errors.saveFailed", {
      detalle: detalleTecnico("el servidor no confirmó el guardado"),
    });
  }
};

/** Resultado de una importación masiva de seriales previos confirmada por el servidor. */
export type ResultadoImportacionSerialesPreviosLote = {
  importados: number;
  duplicados: number;
  auditoria?: AuditLog;
};

/**
 * Importa hasta 20.000 seriales en una transacción del servidor. La base de datos
 * vuelve a validar el rol y aplica la deduplicación incluso frente a importaciones
 * simultáneas desde otros dispositivos.
 */
export const importarSerialesPreviosEnLote = async (
  seriales: string[],
  notas?: string,
): Promise<ResultadoImportacionSerialesPreviosLote> => {
  const valores = seriales.map((serial) => serial.trim()).filter(Boolean);
  if (valores.length > 20_000) {
    throw new DomainError("serialesPrevios.excelErrorTooMany");
  }
  if (valores.length === 0) {
    return { importados: 0, duplicados: 0 };
  }

  const { data, error } = await nube.rpc("nexora_importar_seriales_previos", {
    p_seriales: valores,
    p_notas: notas?.trim() || null,
  });

  if (error) {
    if (error.code === "42501" || error.message.includes("BODEGA_FORBIDDEN")) {
      throw new DomainError("errors.forbidden");
    }
    if (error.message.includes("BODEGA_SERIAL_PREVIOS_LIMITE")) {
      throw new DomainError("serialesPrevios.excelErrorTooMany");
    }
    throw new DomainError("errors.saveFailed", {
      detalle: detalleTecnico(error.message),
    });
  }

  if (!data || typeof data !== "object") {
    throw new DomainError("errors.saveFailed");
  }

  const respuesta = data as Fila;
  const importados = numero(respuesta.importados);
  const duplicados = numero(respuesta.duplicados);

  // El servidor devuelve solo el resumen: la pantalla se resincroniza después,
  // sin transferir otra vez las 20.000 filas en la respuesta del RPC.
  if (
    importados < 0 ||
    duplicados < 0 ||
    importados + duplicados !== valores.length
  ) {
    throw new DomainError("errors.saveFailed");
  }

  let auditoria: AuditLog | undefined;
  if (respuesta.auditoria && typeof respuesta.auditoria === "object") {
    const fila = respuesta.auditoria as Fila;
    auditoria = {
      id: String(fila.id ?? ""),
      userId: texto(fila.userId) ?? "",
      userEmail: texto(fila.userEmail) ?? "",
      action: (texto(fila.action) as AuditLog["action"]) ?? "create",
      entity: (texto(fila.entity) as AuditLog["entity"]) ?? "serial_previo",
      entityId: texto(fila.entityId) ?? undefined,
      details: texto(fila.details) ?? undefined,
      createdAt: fecha(fila.createdAt),
    };
  }

  return {
    importados,
    duplicados,
    auditoria,
  };
};

// ---------------------------------------------------------------------------
// Control físico de seriales (migración 0005)
//
// Estas operaciones NO pasan por pushDb: cada una llama a una función del servidor que solo
// toca las columnas del control y usa la hora del servidor. Así escanear nunca puede pisar
// el estado de una unidad (una escritura normal sube la fila completa).
// ---------------------------------------------------------------------------

/** Qué pasó al verificar un serial (lo decide el servidor con sus propios datos). */
export type ResultadoControl =
  | { resultado: "verificada" | "fuera_de_estado" | "ya_verificada"; unidad: Unit }
  | { resultado: "no_existe" | "liberada"; serial: string }
  | { resultado: "otro_producto"; serial: string; producto: string };

const traducirErrorControl = (error: ErrorRemoto): DomainError => {
  const mensaje = error.message ?? "";
  if (funcionNoDisponible(error)) return new DomainError("control.notAvailable");
  if (mensaje.includes("BODEGA_CONTROL_NO_ACTIVO")) return new DomainError("control.notActive");
  if (/BODEGA_CONTROL_(PRODUCTO|UNIDAD)_NO_EXISTE/.test(mensaje)) {
    return new DomainError("errors.notFound");
  }
  return new DomainError("errors.saveFailed", { detalle: detalleTecnico(mensaje) });
};

const llamarControl = async (funcion: string, args: Record<string, unknown>): Promise<Fila> => {
  const { data, error } = await nube.rpc(funcion, args);
  if (error) {
    console.error(`No se pudo ${funcion}: ${error.message}`);
    throw traducirErrorControl(error);
  }
  return (data ?? {}) as Fila;
};

const desdeFilaDe = <T,>(coleccion: Coleccion, fila: Fila): T => {
  const definicion = ESPECIFICACIONES.find((s) => s.coleccion === coleccion);
  if (!definicion) throw new Error(`Colección desconocida: ${coleccion}`);
  return definicion.desdeFila(fila) as T;
};

/** Inicia (o reinicia) el control físico de un producto. Devuelve el producto actualizado. */
export const controlIniciar = async (productId: string): Promise<Product> =>
  desdeFilaDe<Product>(
    "products",
    await llamarControl("bodega_control_iniciar", { p_product_id: productId }),
  );

/** Marca como verificado el equipo con ese serial/IMEI (lo que se escanea). */
export const controlMarcarSerial = async (
  productId: string,
  serial: string,
): Promise<ResultadoControl> => {
  const fila = await llamarControl("bodega_control_marcar_serial", {
    p_product_id: productId,
    p_serial: serial,
  });
  const resultado = texto(fila.resultado) as ResultadoControl["resultado"];
  if (fila.unidad) {
    return {
      resultado: resultado as "verificada" | "fuera_de_estado" | "ya_verificada",
      unidad: desdeFilaDe<Unit>("units", fila.unidad as Fila),
    };
  }
  if (resultado === "otro_producto") {
    return {
      resultado,
      serial: texto(fila.serial) ?? serial,
      producto: texto(fila.producto) ?? "",
    };
  }
  return { resultado: resultado as "no_existe" | "liberada", serial: texto(fila.serial) ?? serial };
};

/** Marca o desmarca a mano una unidad de la lista. Devuelve la unidad actualizada. */
export const controlMarcarUnidad = async (unitId: string, verificada: boolean): Promise<Unit> =>
  desdeFilaDe<Unit>(
    "units",
    await llamarControl("bodega_control_marcar_unidad", {
      p_unit_id: unitId,
      p_verificada: verificada,
    }),
  );

/** Cierra el control y deja el resumen en la auditoría. Devuelve el producto actualizado. */
export const controlFinalizar = async (productId: string, resumen: string): Promise<Product> =>
  desdeFilaDe<Product>(
    "products",
    await llamarControl("bodega_control_finalizar", {
      p_product_id: productId,
      p_resumen: resumen,
    }),
  );

/** Lee el perfil actual. A diferencia de leerPerfil, conserva los errores de red para no confundirlos con una cuenta inactiva. */
export const consultarPerfilSesion = async (userId: string) => {
  const { data, error } = await nube
    .from("bodega_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo verificar el perfil: ${error.message}`);
  }
  return (data ?? null) as Fila | null;
};

/** Perfil del usuario autenticado (rol y estado) desde el backend. */
export const leerPerfil = async (userId: string) => {
  try {
    return await consultarPerfilSesion(userId);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error(`No se pudo leer el perfil: ${mensaje}`);
    return null;
  }
};

/** Cambio que llegó en vivo desde otro dispositivo. */
export type CambioRemoto = {
  coleccion: Coleccion | "settings";
  tipo: "guardar" | "borrar";
  id?: string;
  item?: unknown;
};

const ajustesDesdeFila = (fila: Fila): Db["settings"] => ({
  currency: texto(fila.currency) ?? "MXN",
  companyName: texto(fila.company_name) ?? "Bodega 6A",
});

/**
 * Escucha los cambios de todas las tablas del inventario. La bitácora solo se
 * escucha para administradores, que son quienes pueden leerla.
 */
export const suscribirCambios = (
  onCambio: (cambio: CambioRemoto) => void,
  opciones: {
    incluirAuditoria?: boolean;
    perfilUsuarioId?: string;
    alCambiarPerfil?: () => void;
  } = {},
) => {
  let canal = supabase.channel("bodega-6a-tiempo-real");

  for (const s of ESPECIFICACIONES) {
    if (s.coleccion === "auditLogs" && !opciones.incluirAuditoria) continue;

    canal = canal.on(
      "postgres_changes",
      { event: "*", schema: "public", table: s.tabla },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as Fila | null)?.id;
          if (typeof id === "string") onCambio({ coleccion: s.coleccion, tipo: "borrar", id });
          return;
        }
        const fila = payload.new as Fila | null;
        if (fila) onCambio({ coleccion: s.coleccion, tipo: "guardar", item: s.desdeFila(fila) });
      },
    );
  }

  canal = canal.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "bodega_settings" },
    (payload) => {
      const fila = payload.new as Fila | null;
      if (fila) {
        onCambio({ coleccion: "settings", tipo: "guardar", item: ajustesDesdeFila(fila) });
      }
    },
  );

  // El perfil actualiza el rol/estado de la sesión sin esperar a recargar la página.
  // La verificación de respaldo por intervalo cubre eventos que RLS no entregue.
  if (opciones.perfilUsuarioId && opciones.alCambiarPerfil) {
    canal = canal.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bodega_profiles",
        filter: `id=eq.${opciones.perfilUsuarioId}`,
      },
      () => opciones.alCambiarPerfil?.(),
    );
  }

  canal.subscribe();
  console.log("Tiempo real conectado");

  return () => {
    void supabase.removeChannel(canal);
  };
};
