// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RolesTab } from "./RolesTab";

afterEach(cleanup);

describe("Matriz operativa de roles", () => {
  it("muestra cuatro perfiles y solo módulos del flujo vigente", () => {
    render(<RolesTab />);
    for (const role of ["Administrador", "Bodeguero", "Encargado", "Vendedor"]) {
      expect(screen.getByRole("button", { name: `Ver permisos de ${role}` })).toBeTruthy();
    }
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Consultar inventario y seriales")).toBeTruthy();
    expect(screen.getByText("Gestionar pedidos y despachos")).toBeTruthy();
    expect(screen.getByText("Gestionar garantías")).toBeTruthy();
    expect(screen.queryByText("Ventas y caja")).toBeNull();
    expect(screen.queryByText("Gestionar traslados")).toBeNull();
    expect(screen.queryByText("Gestionar transferencias de dinero entre sedes")).toBeNull();
  });

  it("refleja el acceso limitado de Encargado y conserva Pedidos para Bodeguero", async () => {
    const user = userEvent.setup();
    render(<RolesTab />);

    await user.click(screen.getByRole("button", { name: "Ver permisos de Encargado" }));
    const inventoryRow = screen.getByRole("row", { name: /Consultar inventario y seriales/i });
    expect(within(inventoryRow).getByLabelText("Encargado: permitido")).toBeTruthy();
    const ordersRow = screen.getByRole("row", { name: /Gestionar pedidos y despachos/i });
    expect(within(ordersRow).getByLabelText("Encargado: restringido")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Mostrar todos" }));
    const bodegueroOrders = screen.getByRole("row", { name: /Gestionar pedidos y despachos/i });
    expect(within(bodegueroOrders).getByLabelText("Bodeguero: permitido")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Administrador" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Vendedor" })).toBeTruthy();
  });
});
