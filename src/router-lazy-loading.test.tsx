// @vitest-environment jsdom
import { Children, isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { routers } from "./router";

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
  const routes = collectRoutes(routers as unknown as RouteEntry[]);

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
