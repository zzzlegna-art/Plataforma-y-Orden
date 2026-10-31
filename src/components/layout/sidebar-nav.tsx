import { useTranslation } from "react-i18next";
import { ChevronRight, Database, ShieldCheck } from "lucide-react";
import { NavLink } from "react-router-dom";

import { PlatformGuide } from "@/components/shared/platform-guide";
import { BrandLogo } from "@/components/shared/brand-logo";
import { InstallAppButton } from "@/components/shared/install-app-button";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import "./sidebar-premium.css";

/** Misma navegación, permisos y acciones del menú original, con acabado premium para ambos temas. */
export const SidebarNav = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const items = NAV_ITEMS.filter((item) => can(item.permission));

  return (
    <div className="nx-sidebar-premium safe-top flex h-full min-h-0 flex-col px-3 pb-4">
      <div className="nx-sidebar-brand" aria-label="Nexora Smart Operations">
        <BrandLogo variant="horizontal" className="nx-sidebar-logo" />
        <p className="nx-sidebar-tagline">SMART OPERATIONS</p>
      </div>

      <div className="nx-sidebar-section-title" aria-hidden="true">
        <span>NAVEGACIÓN PRINCIPAL</span>
      </div>
      <nav aria-label="Navegación principal" className="nx-sidebar-navigation">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) => cn("nx-sidebar-link", isActive && "nx-sidebar-link--active")}
          >
            <span className="nx-sidebar-link-icon" aria-hidden="true">
              <item.icon />
            </span>
            <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
            <ChevronRight className="nx-sidebar-link-arrow" aria-hidden="true" />
          </NavLink>
        ))}
      </nav>

      <section className="nx-sidebar-support" aria-label="Soporte y recursos">
        <div className="nx-sidebar-support-heading">
          <div className="nx-sidebar-section-title" aria-hidden="true">
            <span>SOPORTE Y RECURSOS</span>
          </div>
        </div>
        <div className="nx-sidebar-support-card">
          <span className="nx-sidebar-support-symbol" aria-hidden="true"><ShieldCheck /></span>
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
