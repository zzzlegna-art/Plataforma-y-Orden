import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { MobileTabBar } from "./mobile-tab-bar";
import { SidebarNav } from "./sidebar-nav";
import { Topbar } from "./topbar";

/**
 * Contenedor de la aplicación: sidebar fijo en escritorio (el contenido hace
 * scroll dentro de su propia columna) y drawer + tab bar en móvil.
 */
export const AppLayout = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen h-screen min-w-0 overflow-hidden bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border lg:flex lg:flex-col">
        <SidebarNav />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-12 pt-5 lg:px-8 lg:pb-14 lg:pt-7">
          <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col">
            {/* La clave es la ruta: al cambiar de pantalla entra con un fundido suave. */}
            <div key={pathname} className="page-enter flex w-full flex-1 flex-col">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      <MobileTabBar />

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border p-0">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <SidebarNav onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
};
