// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { emptyDb } from "@/lib/db";
import type { Db, Order } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import Pedidos from "./index";
import PedidoDetalle from "./detalle";

const pedido = (id: string, code: string, customerId: string, status: Order["status"] = "en_preparacion"): Order => ({
  id,
  code,
  customerId,
  status,
  orderDate: "2026-09-21",
  total: 0,
  createdBy: "u1",
  createdAt: "2026-09-21T00:00:00Z",
  updatedAt: "2026-09-21T00:00:00Z",
});

const inicial = (): Db => {
  const db = emptyDb();
  db.customers = [
    { id: "c1", name: "Iphone America", tipo: "mayorista", isActive: true, createdAt: "2026-01-01T00:00:00Z" },
    { id: "c2", name: "Celutronic", tipo: "mayorista", isActive: true, createdAt: "2026-01-01T00:00:00Z" },
  ];
  db.orders = [pedido("o1", "PED-260921-001", "c1"), pedido("o2", "PED-260921-002", "c2")];
  return db;
};

let entrada = "/pedidos";
/** Equivale al botón «atrás» del navegador. */
const Atras = () => {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>atras-del-navegador</button>;
};
const Ruta = () => <output data-testid="ruta">{useLocation().pathname + useLocation().search}</output>;

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
      <MemoryRouter initialEntries={[entrada]}>
        <Routes>
          <Route path="/pedidos" element={<Pedidos />} />
          <Route path="/pedidos/:orderId" element={<PedidoDetalle />} />
        </Routes>
        <Atras />
        <Ruta />
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
  entrada = "/pedidos";
});

describe("Pedidos · la búsqueda se conserva al ver un pedido y volver", () => {
  it("escribir en el buscador queda en la dirección", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.type(screen.getByPlaceholderText(/Buscar por código o cliente/), "Iphone America");
    expect(screen.getByTestId("ruta").textContent).toBe("/pedidos?q=Iphone+America");
  });

  it("«Ver» y luego «Volver» regresa a Pedidos con la búsqueda todavía escrita", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);

    await user.type(screen.getByPlaceholderText(/Buscar por código o cliente/), "Iphone America");
    expect(screen.queryByText("PED-260921-002")).toBeNull(); // ya filtrado

    await user.click(screen.getByRole("link", { name: "Ver" }));
    expect(screen.getByTestId("ruta").textContent).toBe("/pedidos/o1");

    await user.click(screen.getByRole("link", { name: /Volver a pedidos/ }));

    expect(screen.getByTestId("ruta").textContent).toBe("/pedidos?q=Iphone+America");
    expect(screen.getByDisplayValue("Iphone America")).toBeTruthy();
    expect(screen.getByText("PED-260921-001")).toBeTruthy();
    expect(screen.queryByText("PED-260921-002")).toBeNull(); // el filtro se conservó
  });

  it("el botón «atrás» del navegador también conserva la búsqueda y el filtro de estado", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);

    await user.click(screen.getByRole("button", { name: "En preparación" }));
    await user.type(screen.getByPlaceholderText(/Buscar por código o cliente/), "Celutronic");
    await user.click(screen.getByRole("link", { name: "Ver" }));

    await user.click(screen.getByRole("button", { name: "atras-del-navegador" }));

    expect(screen.getByTestId("ruta").textContent).toBe("/pedidos?estado=en_preparacion&q=Celutronic");
    expect(screen.getByDisplayValue("Celutronic")).toBeTruthy();
  });

  it("entrar desde el menú (sin dirección previa) empieza sin ningún filtro", () => {
    entrada = "/pedidos";
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    expect((screen.getByPlaceholderText(/Buscar por código o cliente/) as HTMLInputElement).value).toBe("");
    expect(screen.getByText("PED-260921-001")).toBeTruthy();
    expect(screen.getByText("PED-260921-002")).toBeTruthy();
  });
});
