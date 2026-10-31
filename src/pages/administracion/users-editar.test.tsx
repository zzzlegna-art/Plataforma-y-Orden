// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useRef, useState } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { emptyDb } from "@/lib/db";
import type { Db } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import { UsersTab } from "./UsersTab";

const now = "2026-01-01T00:00:00Z";
const ADMIN = { id: "u1", email: "admin@x.com", fullName: "Admin", role: "admin" as const, isActive: true, createdAt: now };

const inicial = (): Db => {
  const db = emptyDb();
  db.users = [
    ADMIN,
    { id: "u2", email: "luis@x.com", fullName: "Luis", role: "bodeguero", isActive: true, createdAt: now },
  ];
  return db;
};

const Almacen = ({ falloGuardado = false }: { falloGuardado?: boolean }) => {
  const dbRef = useRef(inicial());
  const [, forceRender] = useState(0);
  const value = useMemo<AppValue>(
    () => ({
      db: dbRef.current, ready: true, role: "admin",
      run: (action) => {
        if (falloGuardado) return Promise.reject(new Error("Fallo simulado al guardar el rol"));
        const siguiente = structuredClone(dbRef.current) as Db;
        const resultado = action(siguiente, ADMIN);
        dbRef.current = siguiente;
        forceRender((n) => n + 1);
        return Promise.resolve(resultado);
      },
      aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(), user: ADMIN,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fuerza refresco a propósito
    [dbRef.current],
  );
  return (
    <AppContext.Provider value={value}>
      <UsersTab />
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

describe("Administración > Usuarios · botón Editar (ya no hay botón directo de un clic)", () => {
  it('ya no aparece "Hacer administrador" ni "Hacer bodeguero" como botón directo', () => {
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    expect(screen.queryByRole("button", { name: /Hacer administrador/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Hacer bodeguero/ })).toBeNull();
  });

  it('el botón "Editar" abre un diálogo donde se puede cambiar el rol y guardar', async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);

    const fila = screen.getByText("Luis").closest("tr") ?? screen.getByText("Luis").closest("li")!;
    await user.click(within(fila).getByRole("button", { name: "Editar" }));

    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("luis@x.com")).toBeTruthy();

    await user.click(within(dialogo).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Administrador" }));
    await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    // El diálogo se cierra y el rol quedó actualizado en la lista.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(screen.getByText("Luis").closest("tr") ?? document.body).getByText("Administrador")).toBeTruthy();
  });
  it("conserva abierto el editor si falla guardar el rol en el servidor", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen falloGuardado /></I18nextProvider>);
    const fila = screen.getByText("Luis").closest("tr") ?? screen.getByText("Luis").closest("li")!;
    await user.click(within(fila).getByRole("button", { name: "Editar" }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Administrador" }));
    await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(within(screen.getByText("Luis").closest("tr") ?? document.body).getByText("Bodeguero")).toBeTruthy();
    });
  });

});
