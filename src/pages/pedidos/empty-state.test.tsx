// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { emptyDb } from "@/lib/db";
import { AppContext, type AppValue } from "@/store/contexts";
import Pedidos from "./index";

const Almacen = () => {
  const [db] = useState(emptyDb); // sin pedidos: la lista está vacía de entrada
  const value = useMemo<AppValue>(
    () => ({
      db, ready: true, role: "bodeguero", run: vi.fn(), aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(),
      user: { id: "u1", email: "b@x.com", fullName: "Bodeguero", role: "bodeguero" },
    }),
    [db],
  );
  return (
    <AppContext.Provider value={value}>
      <MemoryRouter initialEntries={["/pedidos"]}>
        <Pedidos />
      </MemoryRouter>
    </AppContext.Provider>
  );
};

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
});
afterEach(cleanup);

describe("Pedidos · estado vacío con acción", () => {
  it("sin ningún pedido y sin filtro, ofrece el atajo para crear el primero (además del de siempre arriba)", () => {
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    expect(screen.getByText("Sin pedidos")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Nuevo pedido/ }).length).toBe(2);
  });

  it("si el vacío es por una búsqueda, no ofrece 'crear' en el estado vacío (sería engañoso): solo queda el de arriba", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.type(screen.getByPlaceholderText(/Buscar por código o cliente/), "nadie existe");

    expect(screen.getByText("No hay pedidos con ese filtro")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Nuevo pedido/ }).length).toBe(1); // solo el del encabezado
  });
});
