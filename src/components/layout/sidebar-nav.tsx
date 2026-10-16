import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { Boxes } from "lucide-react";

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
    <div className="safe-top flex h-full min-h-0 flex-col gap-6 overflow-y-auto bg-gradient-to-b from-[#101F20] via-[#142C29] to-[#101F20] p-5 text-sidebar-foreground">
      <div className="flex items-center gap-3 px-2 pt-1">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#10B981] text-[#101F20] shadow-lg shadow-emerald-950/20" aria-hidden="true"><Boxes className="h-6 w-6" /></div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">
            NEXORA
          </p>
          <p className="truncate text-[10px] font-medium tracking-[0.16em] text-[#B5D4C8]">
            SMART OPERATIONS
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[background-color,color,transform] duration-200 motion-reduce:transition-none",
                isActive
                  ? "bg-gradient-to-r from-[#087F63] to-[#16473D] text-white shadow-md before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[#D4F36B] [&>svg]:text-sidebar-primary"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground [@media(hover:hover)]:hover:translate-x-0.5 motion-reduce:[@media(hover:hover)]:hover:translate-x-0",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-emerald-400/15 to-transparent p-4 text-sm">
        <p className="font-semibold">Operaciones bajo control</p>
        <p className="mt-1 text-xs opacity-70">Inventario, trazabilidad y garantías en un solo lugar.</p>
      </div>

      <div className="space-y-3 border-t border-sidebar-border pt-3">
        <PlatformGuide variant="sidebar" />
        <InstallAppButton variant="sidebar" />
        <p className="px-3 text-[11px] leading-relaxed text-sidebar-foreground/50">
          {t("common.localModeNote")}
        </p>
      </div>
    </div>
  );
};
