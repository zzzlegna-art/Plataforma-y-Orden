import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

/** Barra inferior de navegación en móvil (app-like, con safe area). */
export const MobileTabBar = () => {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const items = NAV_ITEMS.filter((item) => item.primary && can(item.permission));

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur lg:hidden">
      <div className="flex items-stretch justify-around">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium transition-[color,transform] duration-150 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100",
                isActive ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "flex h-8 w-12 items-center justify-center rounded-full transition-colors",
                    isActive && "animate-pop-in bg-primary/12 motion-reduce:animate-none",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="truncate">{t(item.labelKey)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
