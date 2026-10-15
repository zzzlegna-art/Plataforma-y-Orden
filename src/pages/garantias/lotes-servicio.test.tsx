// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("@/lib/warranty-documents", () => ({
  listarDocumentosDeGarantia: vi.fn().mockResolvedValue([]),
  subirDocumentoGarantia: vi.fn(),
  urlDescargaDocumento: vi.fn(),
  TIPOS_DOCUMENTO_ACEPTADOS: "application/pdf",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { emptyDb } from "@/lib/db";
import type { Db, Warranty } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import Garantias from "./index";

const YO = "yo";
const now = "2026-09-01T00:00:00Z";

const inicial = (): Db => {
  const db = emptyDb();
  db.customers = [{ id: "c1", name: "Camilo", isActive: true, createdAt: now }];
  db.orders = [
    { id: "o1", code: "PED-260901-001", customerId: "c1", status: "despachado" as const, orderDate: now, total: 0, createdBy: YO, createdAt: now, updatedAt: now },
    { id: "o2", code: "PED-260902-002", customerId: "c1", status: "despachado" as const, orderDate: now, total: 0, createdBy: YO, createdAt: now, updatedAt: now },
  ];
  db.warranties = [
    { id: "g1", code: "GAR-1", orderId: "o1", reason: "no enciende", status: "en_servicio_tecnico", receivedAt: "2026-09-10T10:00:00Z", createdBy: YO },
    { id: "g2", code: "GAR-2", orderId: "o1", reason: "no carga", status: "en_servicio_tecnico", receivedAt: "2026-09-11T10:00:00Z", createdBy: YO },
    { id: "g3", code: "GAR-3", orderId: "o2", reason: "pantalla rota", status: "en_servicio_tecnico", receivedAt: "2026-09-20T10:00:00Z", createdBy: YO },
  ] as Warranty[];
  return db;
};

const Almacen = () => {
  const [db] = useState(inicial);
  const value = useMemo<AppValue>(
    () => ({
      db, ready: true, role: "bodeguero", run: vi.fn(), aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(),
      user: { id: YO, email: "yo@x.com", fullName: "Yo", role: "bodeguero" },
    }),
    [db],
  );
  return (
    <AppContext.Provider value={value}>
      <MemoryRouter>
        <Garantias />
      </MemoryRouter>
    </AppContext.Provider>
  );
};

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);

describe("Garantías · En servicio, agrupado por lote (igual que Recibidos)", () => {
  it("dos pedidos distintos quedan en dos lotes separados, cerrados por defecto", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.click(screen.getByRole("button", { name: /^En servicio/ }));

    expect(screen.getByText("PED-260901-001", { exact: false })).toBeTruthy();
    expect(screen.getByText("PED-260902-002", { exact: false })).toBeTruthy();
    // Cerrados: no se ven los códigos de las garantías todavía.
    expect(screen.queryByText("GAR-1")).toBeNull();
    expect(screen.queryByText("GAR-3")).toBeNull();
  });

  it("el lote del pedido más viejo aparece primero, y trae sus dos casos juntos al abrirlo", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.click(screen.getByRole("button", { name: /^En servicio/ }));

    const botones = screen.getAllByRole("button", { expanded: false });
    expect(within(botones[0]).getByText("PED-260901-001", { exact: false })).toBeTruthy();

    await user.click(botones[0]);
    expect(await screen.findByText("GAR-1")).toBeTruthy();
    expect(screen.getByText("GAR-2")).toBeTruthy();
    expect(screen.queryByText("GAR-3")).toBeNull(); // el otro lote sigue cerrado
  });
});
