// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
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
import GarantiaDetalle from "./detalle";

const YO = "yo";
const garantia = (id: string, orderId: string, createdBy = YO): Warranty => ({
  id,
  code: `GAR-${id}`,
  orderId,
  reason: "no enciende",
  status: "recibido",
  receivedAt: "2026-09-21T10:00:00Z",
  createdBy,
  imeiManual: `35000000000${id}`,
});

const inicial = (): Db => {
  const db = emptyDb();
  db.customers = [{ id: "c1", name: "Camilo - Cartagena", isActive: true, createdAt: "2026-01-01T00:00:00Z" }];
  db.orders = ["1", "2"].map((n) => ({
    id: `o${n}`, code: `PED-26090${n}-00${n}`, customerId: "c1", status: "despachado" as const,
    orderDate: "2026-09-02T00:00:00Z", total: 0, createdBy: YO, createdAt: "2026-09-02T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z",
  }));
  db.warranties = [garantia("111", "o1"), garantia("112", "o2")];
  return db;
};

let agregar: (w: Warranty) => void = () => undefined;

let entrada = "/garantias";
/** Equivale al botón «atrás» del navegador. */
const Atras = () => {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>atras-del-navegador</button>;
};
const Ruta = () => <output data-testid="ruta">{useLocation().pathname + useLocation().search}</output>;

const Almacen = () => {
  const [db, setDb] = useState(inicial);
  agregar = (w) => setDb((actual) => ({ ...actual, warranties: [...actual.warranties, w] }));
  const value = useMemo<AppValue>(
    () => ({
      db, ready: true, role: "bodeguero", run: vi.fn(), aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(),
      user: { id: YO, email: "yo@x.com", fullName: "Yo", role: "bodeguero" },
    }),
    [db],
  );
  return (
    <AppContext.Provider value={value}>
      <MemoryRouter initialEntries={[entrada]}>
        <Routes>
          <Route path="/garantias" element={<Garantias />} />
          <Route path="/garantias/:warrantyId" element={<GarantiaDetalle />} />
        </Routes>
        <Atras />
        <Ruta />
      </MemoryRouter>
    </AppContext.Provider>
  );
};

const lote = (pedido: string) => screen.getByText(new RegExp(`Pedido PED-${pedido}`)).closest("button")!;

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  entrada = "/garantias";
  sessionStorage.clear();
});

const abrirRecibidos = async () => {
  const user = userEvent.setup();
  render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
  await user.click(screen.getByRole("button", { name: /^Recibidos/ }));
  return user;
};

describe("Garantías · Recibidos", () => {
  it("todos los lotes empiezan cerrados (sin tarjetas) y se abren y cierran al pulsarlos", async () => {
    const user = await abrirRecibidos();
    expect(lote("260901-001").getAttribute("aria-expanded")).toBe("false");
    expect(lote("260902-002").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("GAR-111")).toBeNull();

    await user.click(lote("260901-001"));
    expect(lote("260901-001").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("GAR-111")).toBeTruthy();
    expect(screen.queryByText("GAR-112")).toBeNull(); // el otro sigue cerrado

    await user.click(lote("260901-001"));
    expect(screen.queryByText("GAR-111")).toBeNull();
  });

  it("al ingresar una garantía mía a un lote, ese lote se despliega solo y los demás siguen cerrados", async () => {
    await abrirRecibidos();
    act(() => agregar(garantia("113", "o2")));
    expect(lote("260902-002").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("GAR-113")).toBeTruthy();
    expect(lote("260901-001").getAttribute("aria-expanded")).toBe("false");
  });

  it("si la registra otra persona, no se despliega nada", async () => {
    await abrirRecibidos();
    act(() => agregar(garantia("114", "o2", "otra-persona")));
    expect(lote("260902-002").getAttribute("aria-expanded")).toBe("false");
  });

  it("si cierras a mano el lote abierto, se queda cerrado hasta que entre otra garantía", async () => {
    const user = await abrirRecibidos();
    act(() => agregar(garantia("113", "o2")));
    await user.click(lote("260902-002"));
    expect(lote("260902-002").getAttribute("aria-expanded")).toBe("false");
    act(() => agregar(garantia("115", "o2")));
    expect(lote("260902-002").getAttribute("aria-expanded")).toBe("true");
  });
});

describe("Garantías · pestaña y lotes al ir al detalle y volver", () => {
  it("la pestaña activa queda en la dirección", async () => {
    await abrirRecibidos();
    expect(screen.getByTestId("ruta").textContent).toBe("/garantias?tab=recibidos");
  });

  it("«Ver» y luego «Volver» regresa a Recibidos con el lote todavía desplegado", async () => {
    const user = await abrirRecibidos();
    await user.click(lote("260901-001"));
    await user.click(screen.getByRole("link", { name: "Ver" }));
    expect(screen.getByTestId("ruta").textContent).toBe("/garantias/111");

    await user.click(screen.getByRole("link", { name: /Volver/ }));

    expect(screen.getByTestId("ruta").textContent).toBe("/garantias?tab=recibidos");
    expect(lote("260901-001").getAttribute("aria-expanded")).toBe("true");
    expect(lote("260902-002").getAttribute("aria-expanded")).toBe("false");
  });

  it("el botón «atrás» del navegador también regresa a Recibidos", async () => {
    const user = await abrirRecibidos();
    await user.click(lote("260901-001"));
    await user.click(screen.getByRole("link", { name: "Ver" }));
    await user.click(screen.getByRole("button", { name: "atras-del-navegador" }));
    expect(screen.getByTestId("ruta").textContent).toBe("/garantias?tab=recibidos");
    expect(lote("260901-001").getAttribute("aria-expanded")).toBe("true");
  });

  it("entrar desde el menú (sin pestaña) siempre empieza en «Recibir» y con lotes cerrados", async () => {
    sessionStorage.setItem("garantias:lotes-abiertos", JSON.stringify(["pedido:o1"]));
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    expect(screen.queryByText(/Pedido PED-260901-001/)).toBeNull(); // no está en Recibidos
    await userEvent.setup().click(screen.getByRole("button", { name: /^Recibidos/ }));
    expect(lote("260901-001").getAttribute("aria-expanded")).toBe("false");
  });

  it("abrir directamente una dirección con pestaña (p. ej. al volver) muestra esa pestaña", () => {
    entrada = "/garantias?tab=recibidos";
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    expect(lote("260901-001")).toBeTruthy();
  });
});
