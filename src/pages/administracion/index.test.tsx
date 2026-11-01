// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

let isAdmin = false;
vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ isAdmin, can: (permission: string) => isAdmin || permission === "receptions.manage" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/shared/page-header", () => ({
  PageHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("../proveedores", () => ({
  default: () => <div>Directorio real de proveedores</div>,
}));
vi.mock("./UsersTab", () => ({ UsersTab: () => <div>Panel de usuarios</div> }));
vi.mock("./SedesTab", () => ({ SedesTab: () => <div>Red de ciudades y sedes</div> }));
vi.mock("./CatalogsTab", () => ({ CatalogsTab: () => <div>Panel de catálogos</div> }));
vi.mock("./AuditTab", () => ({ AuditTab: () => <div>Bitácora privada</div> }));
vi.mock("./DataTab", () => ({ DataTab: () => <div>Datos privados</div> }));

import Administracion from "./index";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { can } from "@/lib/permissions";

afterEach(() => { cleanup(); isAdmin = false; });

describe("Administración unifica el directorio de proveedores", () => {
  it("no duplica Proveedores en el menú y permite al bodeguero abrir Administración", () => {
    expect(NAV_ITEMS.filter((item) => item.to === "/proveedores")).toHaveLength(0);
    expect(NAV_ITEMS.filter((item) => item.to === "/administracion")).toHaveLength(1);
    expect(can("bodeguero", NAV_ITEMS.find((item) => item.to === "/administracion")!.permission)).toBe(true);
    expect(can("bodeguero", "users.manage")).toBe(false);
  });

  it("un bodeguero ve solo proveedores, sin pestañas de usuarios ni auditoría", () => {
    isAdmin = false;
    render(<MemoryRouter initialEntries={["/administracion?tab=users"]}><Administracion /></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "admin.tabSuppliers" }).getAttribute("data-state")).toBe("active");
    expect(screen.getByText("Directorio real de proveedores")).toBeTruthy();
    for (const tab of ["admin.tabUsers", "Sedes", "admin.tabCatalogs", "admin.tabAudit", "admin.tabData"]) {
      expect(screen.queryByRole("tab", { name: tab })).toBeNull();
    }
    expect(screen.queryByText("Panel de usuarios")).toBeNull();
    expect(screen.queryByText("Bitácora privada")).toBeNull();
  });

  it("un administrador puede abrir proveedores mediante enlace y volver a catálogos", async () => {
    isAdmin = true;
    render(<MemoryRouter initialEntries={["/administracion?tab=suppliers"]}><Administracion /></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "admin.tabSuppliers" }).getAttribute("data-state")).toBe("active");
    expect(screen.getByText("Directorio real de proveedores")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "admin.tabUsers" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Sedes" })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("tab", { name: "admin.tabCatalogs" }));
    expect(screen.getByRole("tab", { name: "admin.tabCatalogs" }).getAttribute("data-state")).toBe("active");
    expect(screen.getByText("Panel de catálogos")).toBeTruthy();
  });
});


describe("Sedes multisede · administración central", () => {
  it("el administrador accede a sedes; el bodeguero no puede ver el panel", () => {
    isAdmin = true;
    const view = render(<MemoryRouter initialEntries={["/administracion?tab=sedes"]}><Administracion /></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "Sedes" }).getAttribute("data-state")).toBe("active");
    expect(screen.getByText("Red de ciudades y sedes")).toBeTruthy();
    view.unmount();
    isAdmin = false;
    render(<MemoryRouter initialEntries={["/administracion?tab=sedes"]}><Administracion /></MemoryRouter>);
    expect(screen.queryByText("Red de ciudades y sedes")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Sedes" })).toBeNull();
  });
});
