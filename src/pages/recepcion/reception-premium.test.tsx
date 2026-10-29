// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { emptyDb } from "@/lib/db";
import type { Db } from "@/lib/types";

const now = "2026-10-28T10:00:00Z";
const createDb = (): Db => {
  const db = emptyDb();
  db.products.push({
    id: "p1", sku: "PAN-SUN-IP13", name: "Display Sunlong iPhone 13",
    categoria: "repuesto", price: 135000, cost: 60000, minStock: 0,
    isActive: true, createdAt: now, updatedAt: now,
  });
  db.receptions.push(
    { id: "r1", code: "REC-00001", status: "confirmada", supplierId: "s1",
      receivedAt: now, confirmedAt: now, createdBy: "u1", createdAt: now },
    { id: "r2", code: "REC-00002", status: "captura",
      receivedAt: now, createdBy: "u1", createdAt: now },
    { id: "r3", code: "REC-00003", status: "confirmada",
      receivedAt: now, confirmedAt: now, createdBy: "u1", createdAt: now },
  );
  db.units.push(
    { id: "u1", productId: "p1", serial: "REP-0001", condition: "nuevo",
      status: "en_bodega", receptionId: "r1", receivedAt: now, createdBy: "u1" },
    { id: "u2", productId: "p1", serial: "REP-0002", condition: "nuevo",
      status: "en_bodega", receptionId: "r1", receivedAt: now, createdBy: "u1" },
    { id: "u3", productId: "p1", serial: "REP-0003", condition: "nuevo",
      status: "en_bodega", receptionId: "r3", receivedAt: now, createdBy: "u1" },
  );
  db.receptionItems.push({
    id: "ri1", receptionId: "r2", productId: "p1", serial: "REP-DRAFT",
    condition: "nuevo", createdAt: now,
  });
  return db;
};

const data = createDb();
vi.mock("@/hooks/use-store", () => ({ useStore: () => ({ db: data }) }));
vi.mock("@/lib/suppliers", () => ({
  listSuppliers: vi.fn().mockResolvedValue([
    { id: "s1", name: "Sunlong Distribuciones", isActive: true },
  ]),
}));
vi.mock("./ReceptionSupplierDialog", () => ({
  ReceptionSupplierDialog: ({ trigger }: { trigger: ReactNode }) => <>{trigger}</>,
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import Recepciones from "./index";

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({
    lng: "es", resources: { es: { translation: es } },
    keySeparator: false, nsSeparator: false,
    interpolation: { escapeValue: false },
  });
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(),
  }));
});
afterEach(cleanup);

const open = () => render(
  <I18nextProvider i18n={i18n}>
    <MemoryRouter initialEntries={["/recepcion"]}><Recepciones /></MemoryRouter>
  </I18nextProvider>,
);

describe("Recepciones premium · datos y acciones preservadas", () => {
  it("muestra los KPI reales sin contar capturas como ingreso confirmado", () => {
    const { container } = open();
    const summary = screen.getByRole("region", { name: "Resumen de recepciones" });
    expect(within(summary).getByText("Recepciones totales")).toBeTruthy();
    expect(within(summary).getByText("Confirmadas")).toBeTruthy();
    expect(within(summary).getByText("En captura")).toBeTruthy();
    expect(within(summary).getByText("Unidades ingresadas")).toBeTruthy();
    const counters = summary.querySelectorAll(".nx-reception-stat__number");
    expect([...counters].map((item) => item.textContent)).toEqual(["3", "2", "1", "3"]);
    expect(container.querySelectorAll(".nx-reception-stat")).toHaveLength(4);
    expect(screen.getByRole("link", { name: /Nueva recepción/ }).getAttribute("href")).toBe("/recepcion/nueva");
    expect(screen.getAllByText("REC-00001").length).toBeGreaterThan(0);
  });

  it("conserva filtros por estado y búsqueda por proveedor", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: /En captura/ }));
    expect(screen.getByText("REC-00002")).toBeTruthy();
    expect(screen.queryByText("REC-00001")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Todos/ }));
    const search = screen.getByPlaceholderText(/Buscar/i);
    await user.type(search, "Sunlong Distribuciones");
    expect(await screen.findByText("REC-00001")).toBeTruthy();
    expect(screen.queryByText("REC-00003")).toBeNull();
  });

  it("conserva selección múltiple, diálogo de exportar y proveedor", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("checkbox", { name: /Elegir todas|Seleccionar todas/i }));
    const exportButton = screen.getByRole("button", { name: /Exportar \(3\)/i });
    expect(exportButton.hasAttribute("disabled")).toBe(false);
    await user.click(exportButton);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Sunlong Distribuciones")).toBeTruthy();
  });

  it("aplica estilos locales sin tocar la barra lateral y soporta ambos temas", () => {
    const css = readFileSync("src/pages/recepcion/reception-premium.css", "utf8");
    expect(css).toContain(".nx-reception-hero");
    expect(css).toContain(".nx-reception-stat-grid");
    expect(css).toContain(".nx-reception-table");
    expect(css).toContain(".dark .nx-reception-premium");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).not.toMatch(/\.nx-app-sidebar|\.nx-sidebar-nav|\.nx-sidebar-/);
  });
});
