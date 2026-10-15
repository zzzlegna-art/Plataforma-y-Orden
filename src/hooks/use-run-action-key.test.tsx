// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { emptyDb } from "@/lib/db";
import { useRunAction } from "@/hooks/use-run-action";
import { AppContext, type AppValue } from "@/store/contexts";

const ejecuciones = vi.fn();
const YO = { id: "u1", email: "a@x.com", fullName: "Admin", role: "admin" as const };

const Botones = () => {
  const runAction = useRunAction();
  return (
    <>
      <button onClick={() => void runAction(() => ejecuciones("con-clave"), { key: "toggle" })}>Con clave</button>
      <button onClick={() => void runAction(() => ejecuciones("sin-clave"))}>Sin clave</button>
    </>
  );
};

const Almacen = () => {
  const [db] = useState(emptyDb);
  const value = useMemo<AppValue>(
    () => ({
      db, ready: true, role: "admin", user: YO,
      // El guardado en el servidor tarda: así el segundo clic llega con el primero aún en curso.
      run: (action) => new Promise((resolve) => setTimeout(() => resolve(action(db, YO)), 60)),
      aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(),
    }),
    [db],
  );
  return (
    <AppContext.Provider value={value}>
      <Botones />
    </AppContext.Provider>
  );
};

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({
    lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false,
    interpolation: { escapeValue: false },
  });
});
afterEach(() => {
  cleanup();
  ejecuciones.mockClear();
});

describe("useRunAction · clave anti doble clic", () => {
  it("con clave, un doble clic ejecuta la acción una sola vez", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.dblClick(screen.getByRole("button", { name: "Con clave" }));
    await new Promise((r) => setTimeout(r, 200));
    expect(ejecuciones).toHaveBeenCalledTimes(1);
  });

  it("con clave, se puede volver a ejecutar cuando la anterior terminó", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.click(screen.getByRole("button", { name: "Con clave" }));
    await new Promise((r) => setTimeout(r, 200));
    await user.click(screen.getByRole("button", { name: "Con clave" }));
    await new Promise((r) => setTimeout(r, 200));
    expect(ejecuciones).toHaveBeenCalledTimes(2);
  });

  it("sin clave no se descarta nada (dos escaneos seguidos se procesan)", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.dblClick(screen.getByRole("button", { name: "Sin clave" }));
    await new Promise((r) => setTimeout(r, 300));
    expect(ejecuciones).toHaveBeenCalledTimes(2);
  });
});
