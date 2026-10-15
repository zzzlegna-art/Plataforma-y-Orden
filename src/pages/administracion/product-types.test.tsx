// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { emptyDb } from "@/lib/db";
import type { Db } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import { CatalogsTab } from "./CatalogsTab";

const ADMIN = { id: "u1", email: "a@x.com", fullName: "Admin", role: "admin" as const };
const now = new Date().toISOString();

const conCincoTipos = (): Db => {
  const db = emptyDb();
  db.productTypes = [
    { id: "t1", key: "celular", name: "Celulares", mayoristaGroup: "celulares", createdAt: now },
    { id: "t2", key: "tablet", name: "Tablets", mayoristaGroup: "celulares", createdAt: now },
    { id: "t3", key: "reloj", name: "Relojes", mayoristaGroup: "celulares", createdAt: now },
    { id: "t4", key: "audifono", name: "Audífonos", mayoristaGroup: "celulares", createdAt: now },
    { id: "t5", key: "repuesto", name: "Repuestos", mayoristaGroup: "repuestos", createdAt: now },
  ];
  return db;
};

const Almacen = () => {
  const [db, setDb] = useState(conCincoTipos);
  const value = useMemo<AppValue>(
    () => ({
      db, ready: true, role: "admin",
      run: (action) => {
        const siguiente = structuredClone(db) as Db;
        const resultado = action(siguiente, ADMIN);
        setDb(siguiente);
        return Promise.resolve(resultado);
      },
      aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(), user: ADMIN,
    }),
    [db],
  );
  return (
    <AppContext.Provider value={value}>
      <CatalogsTab />
    </AppContext.Provider>
  );
};

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
});
afterEach(cleanup);

describe("Administración > Catálogos > Tipos de producto", () => {
  it("los 5 tipos de siempre se ven, marcados como predeterminados, sin botón de borrar", () => {
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    const seccion = screen.getByText("Tipos de producto").closest("section")!;
    for (const nombre of ["Celulares", "Tablets", "Relojes", "Audífonos", "Repuestos"]) {
      expect(within(seccion).getByText(nombre, { selector: "span" })).toBeTruthy();
    }
    expect(within(seccion).getAllByText("Predeterminado")).toHaveLength(5);
    expect(within(seccion).queryByLabelText("Eliminar")).toBeNull();
  });

  it("crea un tipo nuevo eligiendo el grupo mayorista, y aparece en la lista", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    const seccion = screen.getByText("Tipos de producto").closest("section")!;

    await user.type(within(seccion).getByPlaceholderText("Nuevo tipo"), "Parlantes");
    // El grupo mayorista se elige en el formulario, antes de la lista: el botón "Repuestos" del
    // formulario es el primero en el DOM (la lista siempre tiene al menos el tipo "Repuestos" fijo).
    await user.click(within(seccion).getAllByRole("button", { name: "Repuestos" })[0]);
    await user.click(within(seccion).getAllByRole("button", { name: /Nuevo tipo/ })[0]);

    expect(await within(seccion).findByText("Parlantes", { selector: "span" })).toBeTruthy();
    const fila = within(seccion).getByText("Parlantes", { selector: "span" }).closest("li")!;
    expect(within(fila).getByLabelText("Eliminar")).toBeTruthy();
    // Y quedó de verdad en el grupo repuestos, no en el de siempre (celulares).
    expect(within(fila).getByRole("button", { name: "Repuestos" }).className).toContain("bg-primary");
  });

  it("un tipo nuevo se puede borrar si no tiene productos", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    const seccion = screen.getByText("Tipos de producto").closest("section")!;

    await user.type(within(seccion).getByPlaceholderText("Nuevo tipo"), "Parlantes");
    await user.click(within(seccion).getAllByRole("button", { name: /Nuevo tipo/ })[0]);
    await within(seccion).findByText("Parlantes", { selector: "span" });

    const fila = within(seccion).getByText("Parlantes", { selector: "span" }).closest("li")!;
    await user.click(within(fila).getByLabelText("Eliminar"));
    await user.click(await screen.findByRole("button", { name: "Eliminar" }));

    expect(within(seccion).queryByText("Parlantes", { selector: "span" })).toBeNull();
  });
});
