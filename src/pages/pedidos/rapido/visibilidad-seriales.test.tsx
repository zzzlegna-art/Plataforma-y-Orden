// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { emptyDb } from "@/lib/db";
import type { Db, Unit } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import PedidoRapido from "./index";
import { NEXT_SESSION_KEY } from "@/lib/next-workspaces";
import { quickOrderDraftKey, readQuickOrderDraft, writeQuickOrderDraft, clearConfirmedQuickOrderDraft } from "@/lib/quick-order-draft";

const seriales = Array.from({ length: 5 }, (_, i) => "35000000000000" + i);
const initialDb = (withColors = false): Db => {
  const db = emptyDb();
  db.customers.push({
    id: "buyer", name: "Iphone America", isActive: true,
    categoriaMayorista: "celulares", createdAt: "2026-01-01",
  });
  db.products.push({
    id: "phone", name: "iPhone 13 128 GB", sku: "IP13-128", categoria: "celular",
    minStock: 0, isActive: true, createdAt: "2026-01-01", updatedAt: "2026-01-01",
  });
  if (withColors) db.products[0].colorVariants = [{ color: "Negro" }, { color: "Azul" }];
  db.units.push(...seriales.map((serial, index): Unit => ({
    id: "u" + index, productId: "phone", serial,
    condition: "seminuevo", status: "en_bodega",
    receivedAt: "2026-01-01", createdBy: "admin",
  })));
  return db;
};

const Almacen = ({ withColors = false }: { withColors?: boolean }) => {
  const [db] = useState(() => initialDb(withColors));
  const store = useMemo<AppValue>(() => ({
    db, ready: true, role: "admin", user: {
      id: "admin", email: "admin@example.com", fullName: "Admin", role: "admin",
    },
    run: vi.fn(), aplicarCambios: vi.fn(), refrescar: vi.fn(), login: vi.fn(), logout: vi.fn(),
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
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.setItem(NEXT_SESSION_KEY, "1");
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("Pedido rápido · visibilidad de seriales", () => {
  it("reserva la mayor parte del ancho al listado y conserva scroll interno accesible", () => {
    const css = readFileSync("src/pages/pedidos/rapido/pedido-rapido.css", "utf8");
    expect(css).toContain("grid-template-columns: minmax(255px, 290px) minmax(0, 1fr)");
    expect(css).toContain("repeat(auto-fill, minmax(min(100%, 10.5rem), 1fr))");
    expect(css).toContain(".nx-quick-serial-chip {");
    expect(css).toContain(".nx-quick-chip-copy {");
    expect(css).toContain(".nx-quick-chip-remove {");
    expect(css).not.toContain("320px");
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
    expect(screen.getByRole("heading", { name: "Pedido rápido por seriales" })).toBeTruthy();
    expect(screen.queryByText("NEXORA / FLUJO DE ALTA VELOCIDAD")).toBeNull();
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

  it("solicita color y cantidad una vez, completa el lote y pregunta de nuevo", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen withColors /></I18nextProvider>);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Iphone America" }));
    await user.type(screen.getByPlaceholderText("Escanea IMEI y presiona Enter"), seriales[0] + "{Enter}");
    const config = screen.getByLabelText("Configurar lote de color");
    await user.click(within(config).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Negro" }));
    const qty = within(config).getByRole("spinbutton");
    await user.clear(qty);
    await user.type(qty, "2");
    await user.click(within(config).getByRole("button", { name: "Iniciar lote" }));
    expect(screen.getByText("Faltan 1 IMEI de este color.")).toBeTruthy();
    await user.type(screen.getByPlaceholderText("Escanea IMEI y presiona Enter"), seriales[1] + "{Enter}");
    expect(screen.queryByLabelText("Lote de color activo")).toBeNull();
    expect(readQuickOrderDraft(quickOrderDraftKey("admin", 1)).draft.serials).toEqual(
      seriales.slice(0, 2).map(serial => ({ serial, color: "Negro" })));
    await user.type(screen.getByPlaceholderText("Escanea IMEI y presiona Enter"), seriales[2] + "{Enter}");
    const next = screen.getByLabelText("Configurar lote de color");
    await user.click(within(next).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Azul" }));
    await user.click(within(next).getByRole("button", { name: "Iniciar lote" }));
    expect(readQuickOrderDraft(quickOrderDraftKey("admin", 1)).draft.serials[2]).toEqual({ serial: seriales[2], color: "Azul" });
  });
});

describe("Pedido rápido · autoguardado", () => {
  it("recupera cliente, IMEI y color tras desmontar y volver a abrir la pantalla", async () => {
    const user = userEvent.setup();
    const first = render(<I18nextProvider i18n={i18n}><Almacen withColors /></I18nextProvider>);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Iphone America" }));
    await user.type(screen.getByPlaceholderText("Escanea IMEI y presiona Enter"), seriales[0] + "{Enter}");
    const config = screen.getByLabelText("Configurar lote de color");
    await user.click(within(config).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Negro" }));
    const qty = within(config).getByRole("spinbutton");
    await user.clear(qty);
    await user.type(qty, "3");
    await user.click(within(config).getByRole("button", { name: "Iniciar lote" }));
    expect(readQuickOrderDraft(quickOrderDraftKey("admin", 1)).draft.serials).toEqual([{ serial: seriales[0], color: "Negro" }]);
    first.unmount();
    render(<I18nextProvider i18n={i18n}><Almacen withColors /></I18nextProvider>);
    expect(screen.getByText("Borrador recuperado")).toBeTruthy();
    expect(screen.getByText(seriales[0])).toBeTruthy();
    expect(readQuickOrderDraft(quickOrderDraftKey("admin", 1)).draft.customerId).toBe("buyer");
    expect(screen.getByText("Faltan 2 IMEI de este color.")).toBeTruthy();
    await user.type(screen.getByPlaceholderText("Escanea IMEI y presiona Enter"), seriales[1] + "{Enter}");
    expect(screen.getByText("Faltan 1 IMEI de este color.")).toBeTruthy();
  });

  it("aísla usuarios y espacios Next, y solo elimina la captura confirmada", () => {
    const k1 = quickOrderDraftKey("admin", 1);
    const k2 = quickOrderDraftKey("admin", 2);
    const draft = { version: 1 as const, customerId: "buyer", serials: [{ serial: seriales[0], color: "Azul" }] };
    const newer = { ...draft, serials: [...draft.serials, { serial: seriales[1], color: "Negro" }] };
    expect(writeQuickOrderDraft(k1, draft)).toBe(true);
    expect(writeQuickOrderDraft(k2, newer)).toBe(true);
    expect(readQuickOrderDraft(quickOrderDraftKey("otro", 1)).status).toBe("empty");
    expect(clearConfirmedQuickOrderDraft(k2, draft)).toBe(false);
    expect(clearConfirmedQuickOrderDraft(k1, draft)).toBe(true);
    expect(readQuickOrderDraft(k1).status).toBe("empty");
    expect(readQuickOrderDraft(k2).draft).toEqual(newer);
  });

  it("no borra el borrador si el navegador bloquea su almacenamiento", () => {
    const blocked = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: vi.fn() };
    const key = quickOrderDraftKey("admin", 1);
    const draft = { version: 1 as const, customerId: "buyer", serials: [{ serial: seriales[0] }] };
    expect(readQuickOrderDraft(key, blocked).status).toBe("unavailable");
    expect(writeQuickOrderDraft(key, draft, blocked)).toBe(false);
    expect(clearConfirmedQuickOrderDraft(key, draft, blocked)).toBe(false);
    expect(blocked.removeItem).not.toHaveBeenCalled();
  });
});
