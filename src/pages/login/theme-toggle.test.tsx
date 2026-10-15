// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { ThemeProvider } from "next-themes";
import { MemoryRouter } from "react-router-dom";
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

const value: AppValue = {
  db: {} as AppValue["db"], ready: true, role: undefined, run: vi.fn(),
  aplicarCambios: vi.fn(), login: vi.fn().mockResolvedValue({ ok: false }), logout: vi.fn(), user: null,
};

const dibujar = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider attribute="class" defaultTheme="light">
        <AppContext.Provider value={value}>
          <MemoryRouter>
            <Login />
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

describe("Login · botón de modo claro/oscuro", () => {
  it("se ve el botón sin haber iniciado sesión todavía", async () => {
    dibujar();
    expect(await screen.findByRole("button", { name: "Cambiar tema" })).toBeTruthy();
  });

  it("al pulsarlo, cambia la clase 'dark' del documento", async () => {
    const user = userEvent.setup();
    dibujar();
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await user.click(await screen.findByRole("button", { name: "Cambiar tema" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
