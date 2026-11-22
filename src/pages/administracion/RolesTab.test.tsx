// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RolesTab } from "./RolesTab";

afterEach(cleanup);

describe("Matriz operativa de roles", () => {
  it("muestra únicamente Administrador y Bodeguero", () => {
    render(<RolesTab />);
    for (const role of ["Administrador", "Bodeguero"]) {
      expect(screen.getByRole("button", { name: `Ver permisos de ${role}` })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: /Encargado|Vendedor/i })).toBeNull();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Consultar inventario y seriales")).toBeTruthy();
    expect(screen.getByText("Gestionar pedidos y despachos")).toBeTruthy();
    expect(screen.getByText("Gestionar garantías")).toBeTruthy();
    expect(screen.queryByText("Ventas y caja")).toBeNull();
    expect(screen.queryByText("Gestionar traslados")).toBeNull();
  });

  it("muestra al Administrador con acceso total a los diez permisos vigentes", () => {
    render(<RolesTab />);
    const adminCard = screen.getByRole("button", { name: /Ver permisos de Administrador/i });
    expect(within(adminCard).getByText("10 de 10 permisos")).toBeTruthy();
    expect(screen.getAllByLabelText("Administrador: permitido")).toHaveLength(10);
    expect(screen.getByText("Consultar el espacio operativo asignado")).toBeTruthy();
  });

  it("conserva Pedidos para Bodeguero y la administración para Administrador", async () => {
    const user = userEvent.setup();
    render(<RolesTab />);
    await user.click(screen.getByRole("button", { name: "Ver permisos de Bodeguero" }));
    const ordersRow = screen.getByRole("row", { name: /Gestionar pedidos y despachos/i });
    expect(within(ordersRow).getByLabelText("Bodeguero: permitido")).toBeTruthy();
    const workspaceRow = screen.getByRole("row", { name: /Consultar el espacio operativo asignado/i });
    expect(within(workspaceRow).getByLabelText("Bodeguero: permitido")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Ver permisos de Administrador" }));
    const usersRow = screen.getByRole("row", { name: /Administrar usuarios y perfiles/i });
    expect(within(usersRow).getByLabelText("Administrador: permitido")).toBeTruthy();
  });
});
