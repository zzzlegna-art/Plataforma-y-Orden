import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

import { PlatformGuide } from "@/components/shared/platform-guide";
import { InstallAppButton } from "@/components/shared/install-app-button";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

/** Navegación principal (sidebar en escritorio, drawer en móvil). */
export const SidebarNav = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const items = NAV_ITEMS.filter((item) => can(item.permission));

  return (
    <div className="safe-top flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-sidebar text-sidebar-foreground p-3 text-sidebar-foreground">
      <div className="nx-sidebar-brand flex items-center gap-2 px-1 pt-0">
        <img src="/branding/nexora-symbol.webp" alt="Nexora" className="h-9 w-9 shrink-0 rounded-lg object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.04]" />
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-sidebar-accent-foreground">
            NEXORA
          </p>
          <p className="truncate text-[8px] font-medium tracking-[0.12em] text-sidebar-foreground/65">
            SMART OPERATIONS
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "nx-sidebar-link relative flex items-center gap-2 rounded-lg px-2 py-2 text-[11px] font-medium outline-offset-2 transition-[background-color,color,transform,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sidebar-ring motion-reduce:transition-none",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary [&>svg]:text-sidebar-primary"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground [@media(hover:hover)]:hover:translate-x-0.5 motion-reduce:[@media(hover:hover)]:hover:translate-x-0",
              )
            }
          >
            <item.icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="rounded-xl border border-sidebar-border bg-gradient-to-br from-primary/10 to-transparent p-3 text-xs">
        <p className="font-semibold">Operaciones bajo control</p>
        <p className="mt-1 text-[10px] leading-relaxed opacity-70">Inventario, trazabilidad y garantías en un solo lugar.</p>
      </div>

      <div className="space-y-2 border-t border-sidebar-border pt-2">
        <PlatformGuide variant="sidebar" />
        <InstallAppButton variant="sidebar" />
        <p className="px-2 text-[9px] leading-relaxed text-sidebar-foreground/50">
          {t("common.localModeNote")}
        </p>
      </div>
    </div>
  );
};
