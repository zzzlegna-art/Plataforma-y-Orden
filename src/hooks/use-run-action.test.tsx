// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import { emptyDb } from "@/lib/db";
import { useRunAction } from "@/hooks/use-run-action";
import { AppContext, type AppValue } from "@/store/contexts";

/** Componente mínimo con dos botones: una acción normal y una "weighty". */
const Botones = () => {
  const runAction = useRunAction();
  return (
    <>
      <button onClick={() => void runAction(() => "ok", { success: "common.save" })}>Normal</button>
      <button onClick={() => void runAction(() => "ok", { success: "common.save", weighty: true })}>
        Importante
      </button>
    </>
  );
};

const Almacen = () => {
  const [db] = useState(emptyDb);
  const value = useMemo<AppValue>(
    () => ({
      db, ready: true, role: "admin", run: (action) => Promise.resolve(action(db, { id: "u1", email: "a@x.com", fullName: "Admin", role: "admin" })),
      aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(),
      user: { id: "u1", email: "a@x.com", fullName: "Admin", role: "admin" },
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
  await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
});
afterEach(() => {
  cleanup();
  mocks.toast.success.mockClear();
});

describe("useRunAction · aviso de éxito", () => {
  it("por defecto no manda ícono (el de sonner de siempre)", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.click(screen.getByRole("button", { name: "Normal" }));
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
    const [, opciones] = mocks.toast.success.mock.calls[0];
    expect(opciones?.icon).toBeUndefined();
  });

  it("con weighty manda el ícono del check dibujado, sin cambiar el mensaje", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.click(screen.getByRole("button", { name: "Importante" }));
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
    const [mensaje, opciones] = mocks.toast.success.mock.calls[0];
    expect(mensaje).toBe(i18n.t("common.save"));
    expect(opciones?.icon).toBeTruthy();
  });
});
