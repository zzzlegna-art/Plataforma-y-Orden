/**
 * Matriz visible de roles de NEXORA.
 * La autorización efectiva procede de permissions.ts y del control de rutas.
 */
import { can, type Permission } from "./permissions";
import type { Role } from "./types";

export const MULTISITE_ROLES = ["admin", "bodeguero"] as const;
export type MultisiteRole = (typeof MULTISITE_ROLES)[number];

export interface MultisiteCapabilitySpec {
  readonly key: Permission;
  readonly label: string;
  readonly description: string;
  readonly category: "Inicio" | "Bodega" | "Inventario" | "Pedidos" | "Garantías" | "Administración";
}

export const MULTISITE_CAPABILITIES = [
  {
    key: "dashboard.view",
    label: "Consultar el panel operativo",
    description: "Ver indicadores y actividad de la operación.",
    category: "Inicio",
  },
  {
    key: "receptions.manage",
    label: "Gestionar recepciones de bodega",
    description: "Registrar y controlar la entrada de equipos.",
    category: "Bodega",
  },
  {
    key: "inventory.view",
    label: "Consultar inventario y seriales",
    description: "Buscar referencias, unidades e historial de IMEI.",
    category: "Inventario",
  },
  {
    key: "inventory.manage",
    label: "Gestionar inventario",
    description: "Administrar unidades y operaciones de inventario autorizadas.",
    category: "Inventario",
  },
  {
    key: "orders.manage",
    label: "Gestionar pedidos y despachos",
    description: "Preparar pedidos, asignar seriales y confirmar despachos.",
    category: "Pedidos",
  },
  {
    key: "customers.manage",
    label: "Gestionar clientes de pedidos",
    description: "Consultar y mantener los datos de clientes.",
    category: "Pedidos",
  },
  {
    key: "warranties.manage",
    label: "Gestionar garantías",
    description: "Registrar casos, diagnósticos, seguimiento y entregas.",
    category: "Garantías",
  },
  {
    key: "users.manage",
    label: "Administrar usuarios y perfiles",
    description: "Gestionar las cuentas y los accesos del personal.",
    category: "Administración",
  },
  {
    key: "audit.view",
    label: "Consultar auditoría",
    description: "Revisar el historial de acciones administrativas y operativas.",
    category: "Administración",
  },
] as const satisfies readonly MultisiteCapabilitySpec[];

export type MultisiteCapability = (typeof MULTISITE_CAPABILITIES)[number]["key"];

export const isMultisiteRole = (value: unknown): value is MultisiteRole =>
  typeof value === "string" && MULTISITE_ROLES.some((role) => role === value);

export const canMultisite = (
  role: string | undefined | null,
  permission: MultisiteCapability,
): boolean => {
  if (!isMultisiteRole(role)) return false;
  // Administrador siempre tiene todas las capacidades que aparecen en esta matriz.
  if (role === "admin") return true;
  return can(role as Role, permission);
};
