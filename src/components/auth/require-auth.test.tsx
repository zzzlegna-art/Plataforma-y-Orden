// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  usePermissions: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: mocks.usePermissions }));

import { RequireAuth, RequirePermission } from "./require-auth";

const LoginDestination = () => {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "";
  return <p>{"login:" + from}</p>;
};

describe("RequireAuth · protección de rutas privadas", () => {
  beforeEach(() => {
    mocks.useAuth.mockReset();
    mocks.usePermissions.mockReset();
  });
  afterEach(() => cleanup());

  const renderPrivateRoute = () => render(
    <MemoryRouter initialEntries={["/inventario"]}>
      <Routes>
        <Route path="/login" element={<LoginDestination />} />
        <Route element={<RequireAuth />}>
          <Route path="/inventario" element={<p>inventario privado</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

  it("redirige al login sin sesión y conserva la ruta solicitada", () => {
    mocks.useAuth.mockReturnValue({ user: null });
    renderPrivateRoute();
    expect(screen.getByText("login:/inventario")).toBeTruthy();
    expect(screen.queryByText("inventario privado")).toBeNull();
  });

  it("permite abrir la ruta privada con una sesión", () => {
    mocks.useAuth.mockReturnValue({ user: { id: "usuario-test" } });
    renderPrivateRoute();
    expect(screen.getByText("inventario privado")).toBeTruthy();
  });
});

describe("RequirePermission · protección por permiso", () => {
  beforeEach(() => {
    mocks.useAuth.mockReset();
    mocks.usePermissions.mockReset();
  });
  afterEach(() => cleanup());

  const renderPermissionRoute = () => render(
    <MemoryRouter initialEntries={["/garantias"]}>
      <Routes>
        <Route path="/panel" element={<p>panel seguro</p>} />
        <Route
          path="/garantias"
          element={
            <RequirePermission permission="warranties.manage">
              <p>garantias protegidas</p>
            </RequirePermission>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  it("redirige al panel cuando falta el permiso", () => {
    mocks.usePermissions.mockReturnValue({ can: () => false });
    renderPermissionRoute();
    expect(screen.getByText("panel seguro")).toBeTruthy();
    expect(screen.queryByText("garantias protegidas")).toBeNull();
  });

  it("muestra el contenido cuando el permiso está autorizado", () => {
    mocks.usePermissions.mockReturnValue({ can: () => true });
    renderPermissionRoute();
    expect(screen.getByText("garantias protegidas")).toBeTruthy();
  });
});
