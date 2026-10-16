import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LogOut, Menu, UserRound } from "lucide-react";
import { useLocation, useMatch } from "react-router-dom";

import { LogoutScreen } from "@/components/shared/logout-screen";
import { RoleBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { NAV_ITEMS } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";

/** Barra superior: menú móvil, título de la sección y usuario. */
export const Topbar = ({ onOpenMenu }: { onOpenMenu: () => void }) => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [closing, setClosing] = useState(false);
  const location = useLocation();
  const productMatch = useMatch("/inventario/:productId");
  const orderMatch = useMatch("/pedidos/:orderId");
  const warrantyMatch = useMatch("/garantias/:warrantyId");

  /** Muestra la pantalla de despedida un momento y luego cierra la sesión. */
  const handleLogout = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await logout();
    } catch {
      setClosing(false);
    }
  };

  const activeItem = NAV_ITEMS.filter((item) => location.pathname.startsWith(item.to)).sort(
    (a, b) => b.to.length - a.to.length,
  )[0];

  const title = productMatch
    ? t("nav.productDetail")
    : orderMatch
      ? t("nav.orderDetail")
      : warrantyMatch
        ? t("nav.warrantyDetail")
        : activeItem
          ? t(activeItem.labelKey)
          : t("common.appName");

  return (
    <header className="safe-top sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-border/70 bg-card/90 px-5 shadow-[0_8px_30px_-24px_rgba(16,31,32,.45)] backdrop-blur-xl lg:min-h-[66px] lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 lg:hidden"
        aria-label={t("common.openMenu")}
        onClick={onOpenMenu}
      >
        <Menu />
      </Button>

      <div className="flex min-w-0 flex-1 items-center">
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-[15px] font-bold tracking-[-0.01em] text-foreground">{title}</p>
          <p className="mt-0.5 hidden xl:block text-[11px] text-muted-foreground">Centro de operaciones Nexora</p>
        </div>
      </div>

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={user?.fullName ?? t("auth.user")}>
            <UserRound />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="space-y-1">
            <p className="truncate text-sm font-semibold">{user?.fullName}</p>
            <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
          </DropdownMenuLabel>
          <div className="px-2 pb-2">{user ? <RoleBadge role={user.role} /> : null}</div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void handleLogout()} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            {t("auth.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {closing ? <LogoutScreen /> : null}
    </header>
  );
};
