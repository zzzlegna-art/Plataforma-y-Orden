import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import type { Permission } from "@/lib/permissions";

/** Bloquea las rutas privadas cuando no hay sesión. */
export const RequireAuth = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
};

/** Muestra el contenido solo si el rol tiene el permiso; si no, vuelve al panel. */
export const RequirePermission = ({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) => {
  const { can } = usePermissions();
  if (!can(permission)) return <Navigate to="/panel" replace />;
  return <>{children}</>;
};
