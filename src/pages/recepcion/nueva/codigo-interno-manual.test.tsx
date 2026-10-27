// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useRef, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
const mocks = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.toastError, warning: vi.fn() } }));

import { emptyDb } from "@/lib/db";
import type { Db } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import NuevaRecepcion from "./index";

const now = "2026-01-01T00:00:00Z";
const YO = { id: "u1", email: "b@x.com", fullName: "Bodeguero", role: "bodeguero" as const };

const inicial = (): Db => {
  const db = emptyDb();
  db.productTypes = [{ id: "t1", key: "celular", name: "Celulares", mayoristaGroup: "celulares", createdAt: now }];
  db.products = [
    { id: "p1", sku: "IP13", name: "Apple iPhone 13 128 GB", categoria: "celular", price: 1, cost: 1, minStock: 0, isActive: true, createdAt: now, updatedAt: now },
  ];
  return db;
};

const Almacen = () => {
  // Referencia mutable (como el dbRef real de la app), no estado de React: así dos llamadas
  // seguidas a "run" (como crear la recepción y luego agregar el ítem, en un solo escaneo)
  // siempre ven el cambio de la anterior, sin depender de que React ya haya vuelto a renderizar.
  const dbRef = useRef(inicial());
  const [, forceRender] = useState(0);
  const value = useMemo<AppValue>(
    () => ({
      db: dbRef.current, ready: true, role: "bodeguero",
      run: (action) => {
        const siguiente = structuredClone(dbRef.current) as Db;
        const resultado = action(siguiente, YO);
        dbRef.current = siguiente;
        forceRender((n) => n + 1);
        return Promise.resolve(resultado);
      },
      aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(), user: YO,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- render() a propósito para refrescar
    [dbRef.current],
  );
  return (
    <AppContext.Provider value={value}>
      <MemoryRouter initialEntries={["/recepcion/nueva"]}>
        <Routes><Route path="/recepcion/nueva" element={<NuevaRecepcion />} /></Routes>
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
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);

describe("Recepción · escribir a mano un código interno (no solo con el botón)", () => {
  it("un código interno escrito a mano en el campo se acepta, no se rechaza como IMEI inválido", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);

    await user.click(screen.getAllByRole("combobox").find((element) => element.tagName === "BUTTON")!);
    await user.click(await screen.findByText("Apple iPhone 13 128 GB"));

    await user.type(screen.getByPlaceholderText("Serial nuevo"), "000000001234567");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(await screen.findByText("IMEI pendiente")).toBeTruthy(); // quedó marcado como código interno
  });

  it("un IMEI real inválido (no es código interno) SÍ se sigue rechazando", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);

    await user.click(screen.getAllByRole("combobox").find((element) => element.tagName === "BUTTON")!);
    await user.click(await screen.findByText("Apple iPhone 13 128 GB"));

    await user.type(screen.getByPlaceholderText("Serial nuevo"), "123456789012345"); // 15 dígitos pero dígito de control inválido
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(mocks.toastError).toHaveBeenCalled();
  });
});
