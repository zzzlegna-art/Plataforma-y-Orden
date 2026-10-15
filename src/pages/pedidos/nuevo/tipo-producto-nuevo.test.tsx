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
import type { Customer, Db } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import NuevoPedido from "./index";

const now = "2026-01-01T00:00:00Z";

const inicial = (): Db => {
  const db = emptyDb();
  db.productTypes = [
    { id: "t1", key: "celular", name: "Celulares", mayoristaGroup: "celulares", createdAt: now },
    { id: "t2", key: "repuesto", name: "Repuestos", mayoristaGroup: "repuestos", createdAt: now },
    // Un tipo creado por el usuario desde Administración: condición sí, pero grupo repuestos
    // (una combinación que antes no existía, justo lo que se pidió poder elegir).
    { id: "t3", key: "parlante", name: "Parlantes", mayoristaGroup: "repuestos", createdAt: now },
  ];
  const clienteRepuestos: Customer = {
    id: "c1", name: "Repuestos del Caribe", tipo: "mayorista", categoriaMayorista: "repuestos", isActive: true, createdAt: now,
  };
  db.customers = [clienteRepuestos];
  db.products = [
    { id: "p1", sku: "PARL", name: "Parlante JBL", categoria: "parlante", price: 50, cost: 20, minStock: 0, isActive: true, createdAt: now, updatedAt: now },
  ];
  db.units = [
    { id: "u1", productId: "p1", serial: "PARL-001", condition: "nuevo", status: "en_bodega", receivedAt: now, createdBy: "u1" },
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
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(cleanup);

describe("Nuevo pedido · un tipo de producto creado por el usuario", () => {
  it("aparece como botón de filtro junto a los de siempre, con su propio nombre", () => {
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    expect(screen.getByRole("button", { name: "Parlantes" })).toBeTruthy();
  });

  it("respeta el grupo mayorista elegido al crearlo (repuestos), aunque tenga condición como celular", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);

    await user.click(screen.getByRole("button", { name: "Parlantes" }));
    // Al ser "como celular", sí debe mostrar el filtro de condición.
    expect(screen.getByText("Nuevo")).toBeTruthy();
    expect(screen.getByText("Seminuevo")).toBeTruthy();

    // Elegir el cliente de repuestos: como "Parlantes" pertenece al grupo repuestos, debe ser
    // compatible (antes de este cambio, cualquier tipo que no fuera literalmente "repuesto" se
    // trataba siempre como tecnología, y esto habría fallado).
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText(/Repuestos del Caribe/));

    // Mientras la referencia sigue cargando, puede aparecer un instante; se espera a que el
    // estado final se asiente y confirmamos que NO quedó el aviso de incompatibilidad.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Este mayorista no puede llevar esta categoría de productos.")).toBeNull();
  });
});
