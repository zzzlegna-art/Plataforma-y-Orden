import { Suspense, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useNextWorkspace } from "./use-next-workspace";
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
  const workspace = useNextWorkspace();

  if (workspace.status === "loading") return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <p className="text-sm text-muted-foreground">Preparando espacio de trabajo Next…</p>
    </main>
  );
  if (workspace.status === "full") return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-7 text-center shadow-sm">
        <p className="text-sm font-bold uppercase tracking-widest text-primary">Nexora · Next 1 / 2 / 3</p>
        <h1 className="text-xl font-bold">Ya están ocupados los tres espacios</h1>
        <p className="text-sm text-muted-foreground">
          Solo se permiten tres pestañas de trabajo simultáneas en este navegador.
          Regresa a una pestaña de Nexora abierta o cierra Next 1, 2 o 3 para liberar ese número.
        </p>
        <Button type="button" onClick={workspace.retry}>Buscar espacio disponible</Button>
        <p className="text-xs text-muted-foreground">
          Los navegadores no permiten reutilizar automáticamente cualquier pestaña abierta manualmente.
          Si una se cierra, esta pantalla intentará recuperar su número.
        </p>
      </section>
    </main>
  );

  return (
    <div className="flex min-h-[100svh] h-[100dvh] min-w-0 overflow-hidden bg-background">
      <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 border-r border-sidebar-border lg:flex lg:flex-col">
        <SidebarNav />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMenuOpen(true)} nextSlot={workspace.slot!}
          nextFreeSlot={workspace.freeSlot} onOpenNext={workspace.openNext} />
        <main className="nx-app-main min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pb-[calc(6.25rem+env(safe-area-inset-bottom))] pt-4 lg:px-8 lg:pb-14 lg:pt-7">
          <div className="flex min-h-full w-full min-w-0 flex-col">
            {/* La clave es la ruta: al cambiar de pantalla entra con un fundido suave. */}
            <div key={pathname} className="page-enter flex w-full flex-1 flex-col">
              <Suspense fallback={
                <div role="status" aria-live="polite" className="flex min-h-[180px] items-center justify-center rounded-xl border border-border/50 bg-card/40 p-6 text-sm text-muted-foreground">
                  Cargando sección de NEXORA…
                </div>
              }>
                <Outlet />
              </Suspense>
            </div>
          </div>
        </main>
      </div>

      <MobileTabBar />

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[min(88vw,320px)] border-sidebar-border p-0">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <SidebarNav onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
};
