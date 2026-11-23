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
import type { Db, Unit } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import PedidoRapido from "./index";

const seriales = Array.from({ length: 5 }, (_, i) => "35000000000000" + i);
const initialDb = (): Db => {
  const db = emptyDb();
  db.customers.push({
    id: "buyer", name: "Iphone America", isActive: true,
    categoriaMayorista: "celulares", createdAt: "2026-01-01",
  });
  db.products.push({
    id: "phone", name: "iPhone 13 128 GB", sku: "IP13-128", categoria: "celular",
    minStock: 0, isActive: true, createdAt: "2026-01-01", updatedAt: "2026-01-01",
  });
  db.units.push(...seriales.map((serial, index): Unit => ({
    id: "u" + index, productId: "phone", serial,
    condition: "seminuevo", status: "en_bodega",
    receivedAt: "2026-01-01", createdBy: "admin",
  })));
  return db;
};

const Almacen = () => {
  const [db] = useState(initialDb);
  const store = useMemo<AppValue>(() => ({
    db, ready: true, role: "admin", user: {
      id: "admin", email: "admin@example.com", fullName: "Admin", role: "admin",
    },
    run: vi.fn(), aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(),
  }), [db]);
  return (
    <AppContext.Provider value={store}>
      <MemoryRouter initialEntries={["/pedidos/rapido"]}>
        <PedidoRapido />
      </MemoryRouter>
    </AppContext.Provider>
  );
};

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({
    lng: "es", resources: { es: { translation: es } },
    keySeparator: false, nsSeparator: false,
    interpolation: { escapeValue: false },
  });
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(),
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(cleanup);

describe("Pedido rápido · visibilidad de seriales", () => {
  it("reserva la mayor parte del ancho al listado y conserva scroll interno accesible", () => {
    const css = readFileSync("src/pages/pedidos/rapido/pedido-rapido.css", "utf8");
    expect(css).toContain("grid-template-columns: minmax(255px, 290px) minmax(0, 1fr)");
    expect(css).toContain("repeat(auto-fit, minmax(min(100%, 320px), 1fr))");
    expect(css).toContain("max-height: min(74vh, 780px)");
    expect(css).toContain("@media(max-width:980px)");
    expect(css).toContain(".nx-quick-confirm-bar {");
    expect(css).toContain("position: static;");
  });

  it("muestra cinco IMEI agrupados de forma compacta, permite copiar y quitar sin cambiar el flujo", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Iphone America" }));
    const scanner = screen.getByPlaceholderText("Escanea IMEI y presiona Enter");
    for (const serial of seriales) {
      await user.type(scanner, serial + "{Enter}");
    }

    const list = screen.getByRole("region", { name: "Seriales agrupados por referencia" });
    expect(within(list).getAllByRole("button", { name: /Copiar serial/ })).toHaveLength(5);
    expect(within(list).getAllByRole("button", { name: /Quitar serial/ })).toHaveLength(5);
    expect(within(list).getByText("iPhone 13 128 GB")).toBeTruthy();
    for (const serial of seriales) {
      expect(within(list).getByText(serial)).toBeTruthy();
    }
    expect(screen.getByText("5", { selector: ".nx-quick-summary strong" })).toBeTruthy();
    expect(screen.getByText("1", { selector: ".nx-quick-summary strong" })).toBeTruthy();

    await user.click(within(list).getByRole("button", { name: "Quitar serial " + seriales[0] }));
    expect(within(list).queryByText(seriales[0])).toBeNull();
    expect(within(list).getAllByRole("button", { name: /Quitar serial/ })).toHaveLength(4);
    expect(screen.getByText("4", { selector: ".nx-quick-summary strong" })).toBeTruthy();
  });
});
