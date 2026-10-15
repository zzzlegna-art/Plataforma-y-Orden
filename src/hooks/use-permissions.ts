import { can, type Permission } from "@/lib/permissions";
import { useApp } from "./use-app";

/** Permisos del rol de la sesión actual. */
export const usePermissions = () => {
  const { role } = useApp();
  return {
    role,
    isAdmin: role === "admin",
    can: (permission: Permission) => can(role, permission),
  };
};
