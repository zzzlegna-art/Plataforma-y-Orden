import { useTranslation } from "react-i18next";
import {
  ArrowLeftRight,
  Boxes,
  BriefcaseBusiness,
  ChevronRight,
  Database,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { PlatformGuide } from "@/components/shared/platform-guide";
import { BrandLogo } from "@/components/shared/brand-logo";
import { InstallAppButton } from "@/components/shared/install-app-button";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import type { NavItem } from "./nav-items";
import "./sidebar-premium.css";

/** Agrupación visual de los módulos; las rutas y permisos siguen viniendo de NAV_ITEMS. */
const SIDEBAR_GROUPS = [
  {
    id: "home",
    label: "INICIO",
    icon: LayoutDashboard,
    routes: ["/mi-sede", "/panel"],
  },
  {
    id: "operations",
    label: "OPERACIÓN",
    icon: ArrowLeftRight,
    routes: ["/recepcion", "/traslados"],
  },
  {
    id: "inventory",
    label: "INVENTARIO",
    icon: Boxes,
    routes: ["/inventario", "/seriales"],
  },
  {
    id: "management",
    label: "GESTIÓN",
    icon: BriefcaseBusiness,
    routes: ["/pedidos", "/clientes", "/garantias", "/administracion"],
  },
] as const;

/** Misma navegación, permisos y acciones; organizada por el flujo real de trabajo. */
export const SidebarNav = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const allowedItems = NAV_ITEMS.filter((item) => can(item.permission));

  const groups = SIDEBAR_GROUPS.map((group) => ({
    ...group,
    items: group.routes.flatMap((route) => allowedItems.filter((item) => item.to === route)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="nx-sidebar-premium safe-top flex h-full min-h-0 flex-col px-3 pb-4">
      <div className="nx-sidebar-brand" aria-label="Nexora Smart Operations">
        <BrandLogo variant="horizontal" className="nx-sidebar-logo" />
        <p className="nx-sidebar-tagline">SMART OPERATIONS</p>
      </div>

      <div className="nx-sidebar-nav-caption" aria-hidden="true">
        <span>MENÚ PRINCIPAL</span>
      </div>

      <nav aria-label="Navegación principal" className="nx-sidebar-navigation">
        {groups.map((group, index) => (
          <section key={group.id} className="nx-sidebar-group" aria-label={group.label}>
            <div className="nx-sidebar-group-heading">
              <group.icon aria-hidden="true" />
              <span>{group.label}</span>
              <span className="nx-sidebar-group-count">{String(index + 1).padStart(2, "0")}</span>
            </div>

            <div className="nx-sidebar-group-links">
              {group.items.map((item: NavItem) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn("nx-sidebar-link", isActive && "nx-sidebar-link--active")
                  }
                >
                  <span className="nx-sidebar-link-icon" aria-hidden="true">
                    <item.icon />
                  </span>
                  <span className="nx-sidebar-link-label">{t(item.labelKey)}</span>
                  <ChevronRight className="nx-sidebar-link-arrow" aria-hidden="true" />
                </NavLink>
              ))}
            </div>
          </section>
        ))}
      </nav>

      <section className="nx-sidebar-support" aria-label="Soporte y recursos">
        <div className="nx-sidebar-support-heading">
          <span className="nx-sidebar-support-kicker">CENTRO DE AYUDA</span>
          <span className="nx-sidebar-support-rule" />
        </div>

        <div className="nx-sidebar-support-card">
          <span className="nx-sidebar-support-symbol" aria-hidden="true">
            <ShieldCheck />
          </span>
          <div className="min-w-0">
            <strong>Operaciones bajo control</strong>
            <p>Inventario, trazabilidad y garantías en un solo lugar.</p>
          </div>
        </div>

        <div className="nx-sidebar-tools">
          <div className="nx-sidebar-tool">
            <PlatformGuide variant="sidebar" />
            <ChevronRight className="nx-sidebar-tool-arrow" aria-hidden="true" />
          </div>
          <div className="nx-sidebar-tool">
            <InstallAppButton variant="sidebar" />
            <ChevronRight className="nx-sidebar-tool-arrow" aria-hidden="true" />
          </div>
        </div>

        <p className="nx-sidebar-note">
          <Database aria-hidden="true" />
          <span>{t("common.localModeNote")}</span>
        </p>
      </section>
    </div>
  );
};
