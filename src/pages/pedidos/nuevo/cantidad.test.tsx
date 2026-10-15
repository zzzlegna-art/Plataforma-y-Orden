// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { emptyDb } from "@/lib/db";
import type { Db, Product, Unit } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import NuevoPedido from "./index";

const producto = (id: string, name: string): Product => ({
  id,
  sku: id,
  name,
  categoria: "celular",
  price: 100,
  cost: 50,
  minStock: 0,
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});
const unidad = (id: string, productId: string, serial: string): Unit => ({
  id,
  productId,
  serial,
  condition: "nuevo",
  status: "en_bodega",
  receivedAt: "2026-09-01T00:00:00Z",
  createdBy: "",
});

/** 6 iPhone disponibles y un mayorista de celulares. */
const inicial = (): Db => {
  const db = emptyDb();
  db.customers = [
    { id: "c1", name: "Iphone America", tipo: "mayorista", categoriaMayorista: "celulares", isActive: true, createdAt: "2026-01-01T00:00:00Z" },
  ];
  db.products = [producto("p1", "Apple iPhone 14 128 GB")];
  db.units = Array.from({ length: 6 }, (_, i) => unidad(`u${i}`, "p1", `35000000000000${i}`));
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

const campoCantidad = () => screen.getByLabelText("Cantidad") as HTMLInputElement;

// El desplegable de cliente (Radix Select) es delicado de reabrir varias veces seguidas en este
// entorno simulado, así que el pedido se arma UNA sola vez y cada escenario de la cantidad se
// prueba como un paso siguiente sobre ese mismo pedido, en lugar de rehacer todo desde cero.
describe("Nuevo pedido · cantidad escribible", () => {
  it("se elige el cliente y se agrega la referencia (queda en cantidad 1)", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Iphone America/ }));

    const filaDisponibles = screen.getAllByText("Apple iPhone 14 128 GB")[0].closest("li")!;
    await user.click(within(filaDisponibles).getByRole("button"));

    expect(campoCantidad().value).toBe("1");
  });

  it("se puede escribir la cantidad directamente, sin usar los botones", async () => {
    const user = userEvent.setup();
    const campo = campoCantidad();
    await user.clear(campo);
    await user.type(campo, "4");
    await user.tab(); // sale del campo: se aplica
    expect(campoCantidad().value).toBe("4");
  });

  it("Enter aplica la cantidad igual que salir del campo", async () => {
    const user = userEvent.setup();
    const campo = campoCantidad();
    await user.clear(campo);
    await user.type(campo, "3{Enter}");
    expect(campoCantidad().value).toBe("3");
  });

  it("no deja pasar de lo disponible (6 en bodega): se ajusta al máximo", async () => {
    const user = userEvent.setup();
    const campo = campoCantidad();
    await user.clear(campo);
    await user.type(campo, "50");
    await user.tab();
    expect(campoCantidad().value).toBe("6");
  });

  it("si se deja vacío, vuelve a 1 (no desaparece la línea ni queda en 0)", async () => {
    const user = userEvent.setup();
    const campo = campoCantidad();
    await user.clear(campo);
    await user.tab();
    expect(campoCantidad().value).toBe("1");
    expect(screen.getAllByText("Apple iPhone 14 128 GB").length).toBeGreaterThan(0);
  });

  it("si se escribe 0, vuelve a 1", async () => {
    const user = userEvent.setup();
    const campo = campoCantidad();
    await user.clear(campo);
    await user.type(campo, "0");
    await user.tab();
    expect(campoCantidad().value).toBe("1");
  });

  it("ignora letras y símbolos: solo quedan los dígitos escritos", async () => {
    const user = userEvent.setup();
    const campo = campoCantidad();
    await user.clear(campo);
    await user.type(campo, "a3b-");
    expect(campo.value).toBe("3");
    await user.tab();
    expect(campoCantidad().value).toBe("3");
  });

  it("los botones + y − se conservan y funcionan junto con la escritura", async () => {
    const user = userEvent.setup();
    const filaPedido = campoCantidad().closest("li")!;
    const [restar, sumar] = within(filaPedido).getAllByRole("button"); // −, +, quitar (en ese orden)

    await user.click(sumar); // 3 -> 4
    expect(campoCantidad().value).toBe("4");

    await user.clear(campoCantidad());
    await user.type(campoCantidad(), "5{Enter}");
    expect(campoCantidad().value).toBe("5");

    await user.click(restar); // 5 -> 4
    expect(campoCantidad().value).toBe("4");
  });
});
