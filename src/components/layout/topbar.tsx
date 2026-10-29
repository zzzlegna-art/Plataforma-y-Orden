import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LogOut, Menu, Search, UserRound } from "lucide-react";
import { Link, useLocation, useMatch } from "react-router-dom";

import { useStore } from "@/hooks/use-store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  const { db } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const resultados = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (q.length < 2) return [];
    const matches = (value: string) => value.toLocaleLowerCase().includes(q);
    return [
      ...db.units.filter((u) => matches(u.serial)).slice(0, 8).map((u) => ({ id: `u-${u.id}`, title: u.serial, subtitle: "Equipo / IMEI", to: `/seriales?serial=${encodeURIComponent(u.serial)}` })),
      ...db.orders.filter((o) => matches(o.code)).slice(0, 6).map((o) => ({ id: `o-${o.id}`, title: o.code, subtitle: "Pedido", to: `/pedidos/${o.id}` })),
      ...db.warranties.filter((w) => matches(w.code)).slice(0, 6).map((w) => ({ id: `w-${w.id}`, title: w.code, subtitle: "Garantía", to: `/garantias/${w.id}` })),
      ...db.products.filter((p) => matches(p.name) || matches(p.sku)).slice(0, 8).map((p) => ({ id: `p-${p.id}`, title: p.name, subtitle: p.sku, to: `/inventario/${p.id}` })),
      ...db.customers.filter((c) => matches(c.name)).slice(0, 6).map((c) => ({ id: `c-${c.id}`, title: c.name, subtitle: "Cliente", to: `/clientes?q=${encodeURIComponent(c.name)}${c.isActive ? "" : "&inactivas=1"}` })),
    ].slice(0, 18);
  }, [db, query]);
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
    <header className={`nx-app-topbar safe-top sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-border/70 bg-card/90 px-5 shadow-[0_8px_30px_-24px_rgba(16,31,32,.45)] backdrop-blur-xl lg:min-h-[66px] lg:px-8 ${location.pathname === "/panel" ? "nx-app-topbar--panel" : ""}`}>
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

      <Button type="button" variant="outline" size="sm" className={location.pathname === "/panel" ? "nx-dashboard-search-pill gap-2" : "gap-2"} onClick={() => setSearchOpen(true)} aria-label="Buscar en Nexora"><Search className="h-4 w-4" /><span className="hidden sm:inline">Buscar</span></Button>
      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={location.pathname === "/panel" ? "nx-dashboard-user-avatar h-11 w-11" : "h-11 w-11"} aria-label={user?.fullName ?? t("auth.user")}>
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
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Buscar en Nexora</DialogTitle></DialogHeader>
          <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="IMEI, pedido, garantía, producto o cliente…" aria-label="Búsqueda global" />
          <div className="max-h-80 space-y-1 overflow-y-auto" role="list">
            {resultados.map((item) => <Link key={item.id} to={item.to} onClick={() => { setSearchOpen(false); setQuery(""); }} className="block rounded-lg px-3 py-2 hover:bg-muted"><span className="block truncate text-sm font-medium">{item.title}</span><span className="text-xs text-muted-foreground">{item.subtitle}</span></Link>)}
            {query.trim().length >= 2 && resultados.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">No se encontraron resultados.</p> : null}
            {query.trim().length < 2 ? <p className="py-5 text-center text-xs text-muted-foreground">Escribe al menos dos caracteres para buscar.</p> : null}
          </div>
        </DialogContent>
      </Dialog>
      {closing ? <LogoutScreen /> : null}
    </header>
  );
};
