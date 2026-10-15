// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
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
import type { Db, Warranty, WarrantyEvent } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import Garantias from "./index";

const YO = "yo";
const garantia = (
  id: string,
  code: string,
  receivedAt: string,
  extra: Partial<Warranty> = {},
): Warranty => ({
  id,
  code,
  orderId: "o1",
  reason: "no enciende",
  status: "en_servicio_tecnico",
  receivedAt,
  createdBy: YO,
  imeiManual: `35000000000${id}`,
  ...extra,
});
const evento = (id: string, warrantyId: string, createdAt: string): WarrantyEvent => ({
  id,
  warrantyId,
  status: "en_servicio_tecnico",
  createdAt,
  createdBy: YO,
});

const inicial = (): Db => {
  const db = emptyDb();
  db.customers = [{ id: "c1", name: "Camilo - Cartagena", isActive: true, createdAt: "2026-01-01T00:00:00Z" }];
  db.orders = [
    {
      id: "o1", code: "PED-260901-001", customerId: "c1", status: "despachado" as const,
      orderDate: "2026-09-01T00:00:00Z", total: 0, createdBy: YO, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    },
  ];
  db.warranties = [
    // El caso más viejo (10) tuvo un movimiento reciente: por "días sin movimiento" quedaría
    // último, pero por fecha de recepción (lo pedido) debe ir primero.
    garantia("gA", "GAR-260910-001", "2026-09-10T10:00:00Z"),
    garantia("gB", "GAR-260922-001", "2026-09-22T10:00:00Z"),
    garantia("gC", "GAR-260921-001", "2026-09-21T10:00:00Z"),
  ];
  db.warrantyEvents = [evento("e1", "gA", "2026-09-23T10:00:00Z")]; // movimiento reciente en el más viejo
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

describe("Garantías · Servicio ordenado por fecha de recepción", () => {
  it("las más antiguas van primero, aunque una más nueva no haya tenido movimiento reciente", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.click(screen.getByRole("button", { name: /^En servicio/ }));

    // Los tres comparten pedido, así que quedan en un solo lote: hay que abrirlo para ver el
    // orden real de las tarjetas (los lotes empiezan cerrados, como en Recibidos).
    await user.click(screen.getByRole("button", { expanded: false }));

    const codigos = screen.getAllByText(/^GAR-/).map((nodo) => nodo.textContent);
    expect(codigos).toEqual(["GAR-260910-001", "GAR-260921-001", "GAR-260922-001"]);
  });
});
