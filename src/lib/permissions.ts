import type { Role } from "./types";

/** Permisos de la aplicación. El bodeguero administra la operación diaria
 *  (recepción, inventario, pedidos, clientes y garantías), pero no toca
 *  usuarios, auditoría ni catálogos. */
export type Permission =
  | "dashboard.view"
  | "inventory.view"
  | "inventory.manage"
  | "receptions.manage"
  | "orders.manage"
  | "customers.manage"
  | "warranties.manage"
  | "users.manage"
  | "audit.view";

const BODEGUERO_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "inventory.view",
  "inventory.manage",
  "receptions.manage",
  "orders.manage",
  "customers.manage",
  "warranties.manage",
];

const PERMISSIONS_BY_ROLE: Record<Role, Permission[]> = {
  admin: [...BODEGUERO_PERMISSIONS, "users.manage", "audit.view"],
  bodeguero: BODEGUERO_PERMISSIONS,
};

/** Los catálogos (categorías/marcas) se editan solo por administradores: los
 *  bodegueros los ven, pero cualquier escritura exige users.manage. */
export const canManageCatalogs = (role?: Role) => role === "admin";

export const can = (role: Role | undefined, permission: Permission) =>
  role ? PERMISSIONS_BY_ROLE[role].includes(permission) : false;
