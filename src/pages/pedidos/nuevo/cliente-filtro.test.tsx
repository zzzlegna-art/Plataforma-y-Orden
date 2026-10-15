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
import NuevoPedido from "./index";

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
    cliente("c1", "Zapatos Beto", "celulares"), // nombre a propósito fuera de orden
    cliente("c2", "Repuestos del Caribe", "repuestos"),
    cliente("c3", "Antioquia Móviles", "celulares"),
    cliente("c4", "Distribuidora Todo", "ambos"),
  ];
  return db;
};

const Almacen = () => {
  const [db] = useState(inicial);
  const value = useMemo<AppValue>(
    () => ({
      db, ready: true, role: "bodeguero", run: vi.fn(), aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(),
      user: { id: "u1", email: "b@x.com", fullName: "Bodeguero", role: "bodeguero" },
    }),
    [db],
  );
  return (
    <AppContext.Provider value={value}>
      <MemoryRouter>
        <NuevoPedido />
      </MemoryRouter>
    </AppContext.Provider>
  );
};

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  document.body.style.pointerEvents = "";
});

const abrirSelector = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("combobox"));
};
const nombresEnLista = () =>
  screen
    .getAllByRole("option")
    .map((o) => o.textContent ?? "")
    .filter((texto) => texto !== "Selecciona un cliente");

describe("Nuevo pedido · selector de cliente", () => {
  it("la lista sale en orden alfabético, no en el orden en que se crearon", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await abrirSelector(user);
    const nombres = nombresEnLista();
    const soloNombres = nombres.map((n) => n.split(" · ")[0]);
    expect(soloNombres).toEqual(["Antioquia Móviles", "Distribuidora Todo", "Repuestos del Caribe", "Zapatos Beto"]);
  });

  it("el filtro 'Tecnología' deja solo celulares y a quien vende de todo", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.click(screen.getByRole("button", { name: "Mostrar solo clientes de Tecnología" }));
    await abrirSelector(user);
    const nombres = nombresEnLista().map((n) => n.split(" · ")[0]);
    expect(nombres.sort()).toEqual(["Antioquia Móviles", "Distribuidora Todo", "Zapatos Beto"].sort());
  });

  it("el filtro 'Repuestos' deja solo repuestos y a quien vende de todo", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.click(screen.getByRole("button", { name: "Mostrar solo clientes de Repuestos" }));
    await abrirSelector(user);
    const nombres = nombresEnLista().map((n) => n.split(" · ")[0]);
    expect(nombres.sort()).toEqual(["Distribuidora Todo", "Repuestos del Caribe"].sort());
  });
});
