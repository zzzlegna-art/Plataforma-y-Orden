// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { emptyDb } from "@/lib/db";
import type { Customer, Db } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import Clientes from "./index";

const cliente = (id: string, name: string, categoriaMayorista?: Customer["categoriaMayorista"]): Customer => ({
  id,
  name,
  tipo: "mayorista",
  categoriaMayorista,
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
});

const inicial = (): Db => {
  const db = emptyDb();
  db.customers = [
    cliente("c1", "Iphone America", "celulares"),
    cliente("c2", "Repuestos del Caribe", "repuestos"),
    cliente("c3", "Distribuidora Todo", "ambos"),
    cliente("c4", "Sin categorizar aún"), // sin categoriaMayorista: cuenta como "ambos"
  ];
  return db;
};

const Almacen = () => {
  const [db] = useState(inicial);
  const value = useMemo<AppValue>(
    () => ({
      db, ready: true, role: "admin", run: vi.fn(), aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(),
      user: { id: "u1", email: "a@x.com", fullName: "Admin", role: "admin" },
    }),
    [db],
  );
  return (
    <AppContext.Provider value={value}>
      <MemoryRouter>
        <Clientes />
      </MemoryRouter>
    </AppContext.Provider>
  );
};

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);

const nombresVisibles = () =>
  ["Iphone America", "Repuestos del Caribe", "Distribuidora Todo", "Sin categorizar aún"].filter((n) =>
    screen.queryAllByText(n).length > 0,
  );

describe("Clientes · categoría", () => {
  it("cada cliente muestra su categoría en la tabla", () => {
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    const fila = screen.getByText("Iphone America").closest("tr")!;
    expect(within(fila).getByText("Celulares/Tablets/Relojes")).toBeTruthy();
  });

  it("un cliente sin categoría se trata (y se muestra) como 'ambos'", () => {
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    const fila = screen.getByText("Sin categorizar aún").closest("tr")!;
    expect(within(fila).getByText("Celulares y repuestos")).toBeTruthy();
  });

  it("el filtro 'Tecnología' deja solo celulares y a quien vende de todo", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.click(screen.getByRole("button", { name: "Tecnología" }));
    expect(nombresVisibles().sort()).toEqual(["Distribuidora Todo", "Iphone America", "Sin categorizar aún"].sort());
    expect(screen.queryByText("Repuestos del Caribe")).toBeNull();
  });

  it("el filtro 'Repuestos' deja solo repuestos y a quien vende de todo", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.click(screen.getByRole("button", { name: "Repuestos" }));
    expect(nombresVisibles().sort()).toEqual(["Distribuidora Todo", "Repuestos del Caribe", "Sin categorizar aún"].sort());
    expect(screen.queryByText("Iphone America")).toBeNull();
  });

  it("'Todos' vuelve a mostrarlos a todos", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.click(screen.getByRole("button", { name: "Repuestos" }));
    await user.click(screen.getByRole("button", { name: "Todos" }));
    expect(nombresVisibles().length).toBe(4);
  });
});
