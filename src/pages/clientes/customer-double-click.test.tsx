// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { CustomerFormDialog } from "./CustomerFormDialog";
import { emptyDb } from "@/lib/db";
import { AppContext, type AppValue } from "@/store/contexts";
import type { Actor, Db } from "@/lib/types";

const actor: Actor = { id: "admin", email: "admin@example.com", fullName: "Admin", role: "admin" };
const run = vi.fn();
const Wrapper = () => {
  const value = useMemo<AppValue>(() => {
    const db: Db = emptyDb();
    return {
      db, ready: true, user: actor, role: "admin",
      run: (action) => {
        run();
        return new Promise((resolve) => setTimeout(() => resolve(action(db, actor)), 80));
      },
      aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(),
    };
  }, []);
  return <AppContext.Provider value={value}>
    <CustomerFormDialog trigger={<button type="button">Nuevo cliente prueba</button>} />
  </AppContext.Provider>;
};

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8"));
  await i18n.use(initReactI18next).init({
    lng: "es", resources: { es: { translation: es } }, keySeparator: false,
    nsSeparator: false, interpolation: { escapeValue: false },
  });
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(),
  }));
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); run.mockClear(); });

describe("Clientes · guardar una sola vez", () => {
  it("procesa un doble clic rápido una sola vez mientras Supabase responde", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Wrapper /></I18nextProvider>);
    await user.click(screen.getByRole("button", { name: "Nuevo cliente prueba" }));
    await user.type(screen.getByLabelText("Nombre o razón social"), "Cliente de prueba");
    const guardar = screen.getByRole("button", { name: "Guardar" });
    await act(async () => {
      fireEvent.click(guardar);
      fireEvent.click(guardar);
    });
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
