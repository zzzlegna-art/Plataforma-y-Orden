// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { ThemeProvider } from "next-themes";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/pwa", () => ({
  instalacionPWA: {
    suscribir: () => () => {},
    getInstalada: () => false,
    getEnModoApp: () => false,
    getEvento: () => null,
    instalar: vi.fn(),
  },
}));

import { AppContext, type AppValue } from "@/store/contexts";
import Login from "./index";

const armarValue = (login: AppValue["login"]): AppValue => ({
  db: {} as AppValue["db"], ready: true, role: undefined, run: vi.fn(),
  aplicarCambios: vi.fn(), login, logout: vi.fn(), user: null,
});

const dibujar = (login: AppValue["login"]) =>
  render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider attribute="class" defaultTheme="light">
        <AppContext.Provider value={armarValue(login)}>
          <MemoryRouter initialEntries={["/login"]}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/panel" element={<p>Pantalla del panel</p>} />
            </Routes>
          </MemoryRouter>
        </AppContext.Provider>
      </ThemeProvider>
    </I18nextProvider>,
  );

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
});
afterEach(cleanup);

describe("Login · al entrar bien, pasa a la app (con la animación cuando el navegador la soporta)", () => {
  it("con credenciales correctas, termina mostrando el panel", async () => {
    const user = userEvent.setup();
    dibujar(vi.fn().mockResolvedValue({ ok: true }));

    await user.type(screen.getByLabelText(/correo/i), "bod@x.com");
    await user.type(screen.getByLabelText(/contraseña/i), "secreta123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Pantalla del panel")).toBeTruthy();
  });

  it("con credenciales incorrectas, se queda en el login (no navega)", async () => {
    const user = userEvent.setup();
    dibujar(vi.fn().mockResolvedValue({ ok: false, error: "errors.invalidCredentials" }));

    await user.type(screen.getByLabelText(/correo/i), "bod@x.com");
    await user.type(screen.getByLabelText(/contraseña/i), "mala");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText(/inválid|incorrect/i)).toBeTruthy();
    expect(screen.queryByText("Pantalla del panel")).toBeNull();
  });
});
