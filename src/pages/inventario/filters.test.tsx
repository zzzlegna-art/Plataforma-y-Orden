// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("./ProductFormDialog", () => ({ ProductFormDialog: () => null }));

import { emptyDb } from "@/lib/db";
import type { Product } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import Inventario from "./index";

const AHORA = "2026-10-01T00:00:00.000Z";

const producto = (
  id: string,
  sku: string,
  name: string,
  categoria: string,
): Product => ({
  id,
  sku,
  name,
  categoria,
  price: 100,
  cost: 50,
  minStock: 0,
  isActive: true,
  createdAt: AHORA,
  updatedAt: AHORA,
});

const Almacen = () => {
  const db = emptyDb();
  db.products = [
    producto("p1", "IPH-14", "Apple iPhone 14", "celular"),
    producto("p2", "IPD-A16", "Apple iPad A16", "tablet"),
  ];
  const value: AppValue = {
    db,
    ready: true,
    role: "admin",
    user: { id: "u1", email: "admin@example.test", fullName: "Admin", role: "admin" },
    run: vi.fn(),
    aplicarCambios: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  };

  return (
    <AppContext.Provider value={value}>
      <MemoryRouter initialEntries={["/inventario"]}>
        <Inventario />
      </MemoryRouter>
    </AppContext.Provider>
  );
};

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({
    lng: "es",
    resources: { es: { translation: es } },
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
  });
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

afterEach(cleanup);

describe("Inventario · filtros y resultados", () => {
  it("muestra el total filtrado y solo ofrece limpiar cuando hay filtros activos", async () => {
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <Almacen />
      </I18nextProvider>,
    );

    expect(screen.getByText("2 registros")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).toBeNull();

    await user.type(screen.getByPlaceholderText("Buscar por nombre o SKU"), "iPhone");

    expect(await screen.findByText("1 registros")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Limpiar filtros" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    expect(await screen.findByText("2 registros")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).toBeNull();
  });
});
