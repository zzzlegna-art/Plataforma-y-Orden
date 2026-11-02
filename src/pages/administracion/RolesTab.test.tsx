// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RolesTab } from "./RolesTab";

afterEach(cleanup);

describe("Pantalla premium de permisos multisede", () => {
  it("muestra los cuatro roles y reconoce que aún no están activados en servidor", () => {
    render(<RolesTab />);
    expect(screen.getByText("Pendiente de activación")).toBeTruthy();
    for (const role of ["Administrador", "Bodeguero", "Encargado", "Vendedor"]) {
      expect(screen.getByRole("button", { name: `Ver permisos de ${role}` })).toBeTruthy();
    }
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Consultar inventario de todas las sedes")).toBeTruthy();
  });

  it("filtra las reglas de caja y mantiene la autorización exclusiva del Encargado", async () => {
    const user = userEvent.setup();
    render(<RolesTab />);
    await user.click(screen.getByRole("button", { name: "Ver permisos de Encargado" }));
    expect(screen.getByText("Permisos del perfil Encargado")).toBeTruthy();
    const row = screen.getByRole("row", { name: /Cerrar caja diaria/i });
    expect(within(row).getByLabelText("Encargado: permitido")).toBeTruthy();

    const rowReapertura = screen.getByRole("row", { name: /Reabrir caja por error/i });
    expect(within(rowReapertura).getByLabelText("Encargado: restringido")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Mostrar todos" }));
    expect(screen.getByRole("columnheader", { name: "Administrador" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Vendedor" })).toBeTruthy();
  });
});
