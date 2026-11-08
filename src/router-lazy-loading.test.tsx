// @vitest-environment jsdom
import { Children, isValidElement, type ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

// La prueba inspecciona la configuración, no accede a datos remotos.
// Evitar inicializar Supabase sin variables de producción en CI.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

type RouteEntry = {
  path?: string;
  element?: ReactNode;
  children?: RouteEntry[];
};

const collectRoutes = (routes: RouteEntry[]): RouteEntry[] =>
  routes.flatMap((route) => [route, ...collectRoutes(route.children ?? [])]);

const hasLazyPage = (element: ReactNode): boolean => {
  if (!isValidElement(element)) return false;
  const component = element.type;
  if (typeof component === "object" && component !== null &&
      "$$typeof" in component && component.$$typeof === Symbol.for("react.lazy")) {
    return true;
  }
  const props = element.props as { children?: ReactNode };
  return Children.toArray(props.children).some(hasLazyPage);
};

describe("carga diferida de NEXORA", () => {
  let routes: RouteEntry[];

  beforeAll(async () => {
    // JSDOM no implementa matchMedia, requerido por el gestor PWA del login.
    // Registrar el stub antes de importar el router evita ejecutar ese gestor
    // con APIs ausentes y permite probar realmente sus rutas.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const { routers } = await import("./router");
    routes = collectRoutes(routers as unknown as RouteEntry[]);
  });

  it.each([
    "panel",
    "mi-sede",
    "recepcion",
    "recepcion/factura",
    "recepcion/nueva",
    "recepcion/nueva/:receptionId",
    "traslados",
    "inventario/:productId",
    "pedidos",
    "pedidos/nuevo",
    "pedidos/:orderId",
    "pedidos/historial/:sourceId",
    "clientes",
    "garantias",
    "garantias/:warrantyId",
    "administracion",
  ])("loads %s only when the route is opened", (path) => {
    const route = routes.find((entry) => entry.path === path);
    expect(route, `Falta la ruta ${path}`).toBeDefined();
    expect(hasLazyPage(route?.element), `La ruta ${path} no es diferida`).toBe(true);
  });

  it("retains eager login and error pages", () => {
    expect(hasLazyPage(routes.find((route) => route.path === "/login")?.element)).toBe(false);
    expect(hasLazyPage(routes.find((route) => route.path === "*")?.element)).toBe(false);
  });

  it("keeps the role-aware inventory paths and their access protections", () => {
    for (const path of ["inventario", "seriales"]) {
      const route = routes.find((entry) => entry.path === path);
      expect(route).toBeDefined();
      expect(isValidElement(route?.element)).toBe(true);
      const gate = route?.element;
      if (isValidElement(gate)) {
        expect(gate.props).toMatchObject({ permission: "inventory.view" });
      }
    }
    expect(routes.find((entry) => entry.path === "unidades")?.element).toBeDefined();
  });
});
