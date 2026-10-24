// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { emptyDb } from "@/lib/db";
import type { Db, Warranty } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import HistorialSerial from "./index";

const admin = { id: "u1", email: "admin@example.com", fullName: "Admin", role: "admin" as const };

const Almacen = ({ db, serial }: { db: Db; serial: string }) => {
  const value = useMemo<AppValue>(
    () => ({
      db, ready: true, role: "admin", run: vi.fn(), aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(),
      user: admin,
    }),
    [db],
  );
  return (
    <AppContext.Provider value={value}>
      <MemoryRouter initialEntries={[`/seriales?serial=${encodeURIComponent(serial)}`]}>
        <HistorialSerial />
      </MemoryRouter>
    </AppContext.Provider>
  );
};

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({
    lng: "es",
    resources: { es: { translation: es } },
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
  });
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(),
  }));
});
afterEach(cleanup);

describe("Historial de seriales", () => {
  it("muestra el recorrido de una garantía previa sin romper la pantalla", async () => {
    const warranty: Warranty = {
      id: "w1",
      code: "GAR-001",
      imeiManual: "359111222333444",
      referenciaManual: "iPhone 13",
      clienteManual: "Ana",
      reason: "No carga",
      status: "recibido",
      receivedAt: "2026-10-20T10:00:00.000Z",
      createdBy: "u1",
    };
    const db = { ...emptyDb(), warranties: [warranty], warrantyEvents: [], units: [], serialesPrevios: [] } as Db;

    render(<I18nextProvider i18n={i18n}><Almacen db={db} serial="359111222333444" /></I18nextProvider>);

    expect(await screen.findByText("Garantía previa vinculada al serial")).toBeTruthy();
    expect(screen.getByText("GAR-001")).toBeTruthy();
    expect(screen.getByText("Recibido")).toBeTruthy();
  });

  it("identifica un serial importado de una venta previa cuando no existe una unidad en Nexora", async () => {
    const db = {
      ...emptyDb(),
      units: [],
      warranties: [],
      warrantyEvents: [],
      serialesPrevios: [{
        id: "sp1",
        serial: "111222333444555",
        referencia: "Apple iPhone 13 128 GB",
        cliente: "Camilo Lider",
        fechaVenta: "2025-08-15",
        archivoOrigen: "Ventas_Camilo_2025-08-15.xlsx",
        notas: "Venta antigua",
        createdBy: "u1",
        createdAt: "2026-10-20T10:00:00.000Z",
      }],
    } as Db;

    render(<I18nextProvider i18n={i18n}><Almacen db={db} serial="111222333444555" /></I18nextProvider>);

    expect(await screen.findByText("Serial de una venta previa")).toBeTruthy();
    expect(screen.getByText(/pertenece a una venta anterior a Nexora/)).toBeTruthy();
    expect(screen.getByText("Apple iPhone 13 128 GB")).toBeTruthy();
    expect(screen.getByText("Camilo Lider")).toBeTruthy();
    expect(screen.getByText(/Fecha de venta/)).toBeTruthy();
    expect(screen.getByText(/Venta antigua/)).toBeTruthy();
  });
});
