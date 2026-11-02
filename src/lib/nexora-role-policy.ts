/**
 * NEXORA MULTISEDE 2.0 — Matriz de autorizaciones aprobada.
 *
 * Esta es la política de dominio, NO el motor de permisos del sistema legacy.
 * Al activar estos roles debe reproducirse en RLS y RPC del servidor: la UI
 * nunca es una barrera de seguridad por sí misma.
 */
export const MULTISITE_ROLES = ["admin", "bodeguero", "encargado", "vendedor"] as const;

export type MultisiteRole = (typeof MULTISITE_ROLES)[number];

export interface MultisiteCapabilitySpec {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly roles: readonly MultisiteRole[];
  readonly category: "Inventario" | "Traslados" | "Compras" | "Ventas y caja" | "Finanzas";
}

/** No conceder permisos por defecto a roles desconocidos o sesiones inválidas. */
export const MULTISITE_CAPABILITIES = [
  {
    key: "inventory.view",
    label: "Consultar inventario de todas las sedes",
    description: "Ver cantidades por referencia, ciudad, bodega y local.",
    roles: MULTISITE_ROLES,
    category: "Inventario",
  },
  {
    key: "inventory.imei.cost.view",
    label: "Ver costo histórico de cada IMEI",
    description: "Solo lectura; no incluye permiso para modificar costos.",
    roles: MULTISITE_ROLES,
    category: "Inventario",
  },
  {
    key: "inventory.references.manage",
    label: "Crear y modificar referencias",
    description: "Administración central del catálogo de productos.",
    roles: ["admin"],
    category: "Inventario",
  },
  {
    key: "inventory.imei.correct",
    label: "Corregir datos del IMEI",
    description: "Corrección auditable, sin duplicar ni borrar la vida del serial.",
    roles: ["admin", "bodeguero"],
    category: "Inventario",
  },
  {
    key: "inventory.adjust.authorize",
    label: "Aprobar ajustes de inventario",
    description: "Los conteos y diferencias requieren autorización.",
    roles: ["admin"],
    category: "Inventario",
  },
  {
    key: "transfers.manage",
    label: "Gestionar traslados",
    description: "Todos, solo por rutas permitidas y con permisos de sede.",
    roles: MULTISITE_ROLES,
    category: "Traslados",
  },
  {
    key: "transfers.edit.before_dispatch",
    label: "Corregir traslados antes de despacho",
    description: "No permite reescribir un movimiento ya despachado.",
    roles: MULTISITE_ROLES,
    category: "Traslados",
  },
  {
    key: "transfers.cancel",
    label: "Cancelar traslados",
    description: "Cancelación auditable; si salió mercancía se requiere retorno físico.",
    roles: MULTISITE_ROLES,
    category: "Traslados",
  },
  {
    key: "warranties.manage",
    label: "Gestionar garantías y devoluciones",
    description: "Atención posventa y seguimiento por IMEI.",
    roles: ["admin", "bodeguero"],
    category: "Ventas y caja",
  },
  {
    key: "reception.supplier.receive",
    label: "Recibir compras de proveedor en sede principal",
    description: "No habilita recepción manual de proveedores en locales.",
    roles: ["admin", "bodeguero"],
    category: "Compras",
  },
  {
    key: "reception.substitution.approve",
    label: "Aprobar referencia sustituta",
    description: "Bodeguero O Administrador, cualquiera individualmente.",
    roles: ["admin", "bodeguero"],
    category: "Compras",
  },
  {
    key: "reception.invoice.edit",
    label: "Corregir datos extraídos de factura",
    description: "La lectura automatizada nunca aprueba por sí sola.",
    roles: ["admin"],
    category: "Compras",
  },
  {
    key: "reception.cost.approve",
    label: "Confirmar costos de recepción",
    description: "Solo el Administrador confirma costos definitivos.",
    roles: ["admin"],
    category: "Compras",
  },
  {
    key: "reception.shortage.close",
    label: "Cerrar órdenes con faltantes",
    description: "Registrar faltantes no equivale a cerrar la orden.",
    roles: ["admin"],
    category: "Compras",
  },
  {
    key: "reception.extra.approve",
    label: "Aceptar mercancía extra no facturada",
    description: "Ninguna unidad adicional se acepta sin aprobación.",
    roles: ["admin"],
    category: "Compras",
  },
  {
    key: "reception.supplier.credit.manage",
    label: "Gestionar nota de crédito o deuda de proveedor",
    description: "La conciliación financiera permanece centralizada.",
    roles: ["admin"],
    category: "Compras",
  },
  {
    key: "cash.open",
    label: "Abrir caja diaria",
    description: "Administrador o Encargado individualmente.",
    roles: ["admin", "encargado"],
    category: "Ventas y caja",
  },
  {
    key: "cash.close",
    label: "Cerrar caja diaria",
    description: "Cierre operativo del local a cargo del Encargado.",
    roles: ["encargado"],
    category: "Ventas y caja",
  },
  {
    key: "cash.reopen",
    label: "Reabrir caja por error",
    description: "Excepción con motivo e historial inalterable.",
    roles: ["admin"],
    category: "Ventas y caja",
  },
  {
    key: "cash.expense.record",
    label: "Registrar y autorizar gasto de caja",
    description: "Encargado; el Administrador revisa posteriormente en arqueo.",
    roles: ["encargado"],
    category: "Ventas y caja",
  },
  {
    key: "sales.cancel",
    label: "Autorizar anulación de venta",
    description: "Conserva la venta histórica y su motivo de anulación.",
    roles: ["admin"],
    category: "Ventas y caja",
  },
  {
    key: "sales.refund.authorize",
    label: "Autorizar devolución de dinero",
    description: "Aplicable a devolución verificada, con soporte.",
    roles: ["admin"],
    category: "Ventas y caja",
  },
  {
    key: "reports.view",
    label: "Consultar reportes",
    description: "Administrador (global) y Encargado (su local).",
    roles: ["admin", "encargado"],
    category: "Finanzas",
  },
  {
    key: "finance.transfer.manage",
    label: "Gestionar transferencias de dinero entre sedes",
    description: "Movimiento interno, nunca ingreso por venta.",
    roles: ["admin"],
    category: "Finanzas",
  },
] as const satisfies readonly MultisiteCapabilitySpec[];

export type MultisiteCapability = (typeof MULTISITE_CAPABILITIES)[number]["key"];

const CAPABILITIES_BY_KEY = new Map(
  MULTISITE_CAPABILITIES.map((capability) => [capability.key, capability]),
);

export const isMultisiteRole = (value: unknown): value is MultisiteRole =>
  typeof value === "string" && MULTISITE_ROLES.some((role) => role === value);

export const canMultisite = (
  role: string | undefined | null,
  permission: MultisiteCapability,
): boolean => {
  if (!isMultisiteRole(role)) return false;
  return CAPABILITIES_BY_KEY.get(permission)?.roles.some((allowed) => allowed === role) ?? false;
};
