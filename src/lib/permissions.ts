import type { Role } from "./types";

/** Permisos activos del flujo operativo de NEXORA. */
export type Permission =
  | "workspace.view"
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

/** Los catálogos se editan solo por administradores. */
export const canManageCatalogs = (role?: Role) => role === "admin";

export const can = (role: Role | undefined, permission: Permission) =>
  role ? (PERMISSIONS_BY_ROLE[role] ?? []).includes(permission) : false;
