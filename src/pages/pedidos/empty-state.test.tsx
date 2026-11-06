// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("@/lib/historical-orders", () => ({ listHistoricalOrders: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { emptyDb } from "@/lib/db";
import type { Db } from "@/lib/types";
import { listHistoricalOrders, type HistoricalOrderListItem } from "@/lib/historical-orders";
import { AppContext, type AppValue } from "@/store/contexts";
import Pedidos from "./index";

const Almacen = ({ initialDb }: { initialDb?: Db }) => {
  const [db] = useState(() => initialDb ?? emptyDb()); // sin pedidos: la lista está vacía de entrada
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
beforeEach(() => {
  vi.mocked(listHistoricalOrders).mockReset();
  vi.mocked(listHistoricalOrders).mockResolvedValue({ items: [], total: 0 });
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
  it("mezcla pedidos operativos e históricos por fecha e incluye cancelados sin seriales", async () => {
    const db = emptyDb();
    db.orders.push({
      id: "current", code: "PED-CURRENT", customerId: "customer",
      status: "despachado", orderDate: "2026-09-05T12:00:00Z", total: 0,
      createdBy: "u1", createdAt: "2026-09-05T12:00:00Z", updatedAt: "2026-09-05T12:00:00Z",
    });
    db.customers.push({ id: "customer", name: "Cliente actual", isActive: true, createdAt: "2026-09-01T12:00:00Z" });
    const item: HistoricalOrderListItem = {
      sourceId: "hist-old", code: "PED-HIST-OLD", status: "despachado",
      customerName: "Cliente histórico de prueba", orderDate: "2026-09-01T12:00:00Z",
      total: 0, lineCount: 0, requestedUnits: 0, serialCount: 0,
    };
    vi.mocked(listHistoricalOrders).mockResolvedValueOnce({ items: [
      item,
      { ...item, sourceId: "hist-new", code: "PED-HIST-NEW", orderDate: "2026-09-10T12:00:00Z" },
      { ...item, sourceId: "hist-cancel", code: "PED-HIST-CANCEL", status: "cancelado", orderDate: "2026-09-04T12:00:00Z", requestedUnits: 30 },
    ], total: 3 });
    render(<I18nextProvider i18n={i18n}><Almacen initialDb={db} /></I18nextProvider>);
    await screen.findAllByText("PED-HIST-NEW");
    const orderedCodes = screen.getAllByRole("row").map((row) =>
      within(row).queryByText(/^PED-(CURRENT|HIST-OLD|HIST-NEW|HIST-CANCEL)$/)?.textContent,
    ).filter(Boolean);
    expect(orderedCodes).toEqual(["PED-HIST-NEW", "PED-CURRENT", "PED-HIST-CANCEL", "PED-HIST-OLD"]);
    expect(screen.getAllByRole("link").some((link) => link.getAttribute("href") === "/pedidos/historial/hist-cancel")).toBe(true);
    expect(screen.getAllByRole("link").some((link) => link.getAttribute("href") === "/pedidos/current")).toBe(true);
    expect(db.orders).toHaveLength(1);
  });

});

