// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("@/lib/nexora-archived-imei-trace", () => ({ getArchivedImeiTrace: vi.fn() }));
vi.mock("@/lib/nexora-imei-timeline",()=>({
  fetchMultisiteImeiTimeline: vi.fn(async (unitId:string)=>({
    scope:"multisite_confirmed_only",unitId,serial:"354070964857184",
    total:0,page:1,pageSize:25,items:[],
  })),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
const mocks = vi.hoisted(() => ({ imprimirEtiquetas: vi.fn() }));
vi.mock("@/lib/print-labels", () => ({ imprimirEtiquetas: mocks.imprimirEtiquetas }));

import { emptyDb } from "@/lib/db";
import { getArchivedImeiTrace, type ArchivedImeiTrace } from "@/lib/nexora-archived-imei-trace";
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
beforeEach(() => {
  vi.mocked(getArchivedImeiTrace).mockReset();
  vi.mocked(getArchivedImeiTrace).mockResolvedValue(null);
  mocks.imprimirEtiquetas.mockReset();
});
afterEach(cleanup);

const historicalTrace: ArchivedImeiTrace = {
  found: true,
  source: "Techrez",
  readOnly: true,
  serial: "359111222333444",
  order: {
    sourceId: "historical-order-original",
    code: "PED-HIST-001",
    status: "despachado",
    orderDate: "2026-09-03T12:00:00Z",
    deliveryDate: "2026-09-04T12:00:00Z",
    total: 2500000,
  },
  customer: { name: "Cliente histórico de prueba", phone: null },
  product: {
    name: "Apple iPhone 14 Pro Max 128 GB",
    sku: "IPH-14PM-128",
    category: "celular",
    imageUrl: "https://example.com/iphone-14pm.png",
    imageSource: "exact_catalog_reference",
  },
  unit: {
    sourceId: "historical-unit",
    status: "vendido",
    condition: "nuevo",
    color: null,
    receivedAt: "2026-09-01T12:00:00Z",
    assignedAt: "2026-09-03T12:00:00Z",
  },
  line: { sourceId: "historical-line", quantity: 1, unitPrice: 2500000 },
  movements: [{
    id: "historical-movement",
    occurredAt: "2026-09-03T14:00:00Z",
    type: "salida",
    referenceType: "pedido",
    referenceId: "historical-order-original",
    quantity: "1",
    notes: "Despacho por pedido",
  }],
  warranties: [],
};

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

  it("identifica un serial importado de una venta previa cuando no existe una unidad en Nexora y permite imprimir su etiqueta", async () => {
    const user = userEvent.setup();
    const db = {
      ...emptyDb(),
      units: [],
      warranties: [],
      warrantyEvents: [],
      serialesPrevios: [{
        id: "sp1",
        serial: "111222333444555",
        referencia: "iPhone 11 128 GB",
        notas: "Venta antigua",
        createdBy: "u1",
        createdAt: "2026-10-20T10:00:00.000Z",
      }],
    } as Db;

    render(<I18nextProvider i18n={i18n}><Almacen db={db} serial="111222333444555" /></I18nextProvider>);

    expect(await screen.findByText("Serial de una venta previa")).toBeTruthy();
    expect(screen.getByText(/pertenece a una venta anterior a Nexora/)).toBeTruthy();
    expect(screen.getByText(/Venta antigua/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Imprimir etiqueta" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Imprimir etiqueta" }));
    expect(mocks.imprimirEtiquetas).toHaveBeenCalledWith([{
      producto: "iPhone 11 128 GB",
      serial: "111222333444555",
      nota: "",
    }]);
  });
  it("muestra un IMEI comprometido con pedido sin confundir ubicación en bodega con venta", async () => {
    vi.mocked(getArchivedImeiTrace).mockResolvedValueOnce({
      ...historicalTrace, serial: "354070964857184",
    });
    const unit = {
      id:"unit-1",productId:"product-1",serial:"354070964857184",
      status:"en_bodega" as const,condition:"seminuevo" as const,
      receivedAt:"2026-11-01T10:00:00.000Z",createdBy:"u1",
    };
    const order = {
      id:"order-1",code:"PED-TEST-001",customerId:"customer-1",
      status:"en_preparacion" as const,orderDate:"2026-11-03",
      total:1000000,createdBy:"u1",createdAt:"2026-11-03T10:00:00.000Z",
      updatedAt:"2026-11-03T10:00:00.000Z",
    };
    const db:Db={...emptyDb(),
      units:[unit],
      products:[{
        id:"product-1",sku:"IP15P-256",name:"iPhone 15 Pro 256GB",
        price:1000000,cost:700000,minStock:1,isActive:true,
        createdAt:"2026-11-01T10:00:00.000Z",updatedAt:"2026-11-01T10:00:00.000Z",
      }],
      orders:[order],
      customers:[{id:"customer-1",name:"Cliente de prueba",isActive:true,
        createdAt:"2026-11-01T10:00:00.000Z"}],
      orderItems:[{id:"item-1",orderId:order.id,productId:"product-1",
        quantity:1,unitPrice:1000000,subtotal:1000000}],
      orderItemUnits:[{id:"link-1",orderItemId:"item-1",unitId:unit.id,
        createdAt:"2026-11-03T10:00:00.000Z"}],
    };
    render(<I18nextProvider i18n={i18n}><Almacen db={db} serial={unit.serial}/></I18nextProvider>);
    expect(await screen.findByText("Asignado a pedido · En preparación")).toBeTruthy();
    expect(screen.getByText("PED-TEST-001")).toBeTruthy();
    expect(screen.getByText(/no disponible para asignarlo a otro/)).toBeTruthy();
    expect(screen.getByText(/Cliente de prueba/)).toBeTruthy();
    expect(await screen.findByRole("link", { name: "Ver pedido completo" })).toBeTruthy();
    expect(unit.id).toBe("unit-1");
    expect(unit.status).toBe("en_bodega");
    expect(db.orderItemUnits[0].unitId).toBe("unit-1");
  });

  it("permite imprimir la etiqueta de un serial localizado en el archivo histórico", async () => {
    const user = userEvent.setup();
    vi.mocked(getArchivedImeiTrace).mockResolvedValueOnce(historicalTrace);
    const db = emptyDb();
    render(<I18nextProvider i18n={i18n}><Almacen db={db} serial=" 359111222333444 " /></I18nextProvider>);
    const link = await screen.findByRole("link", { name: "Ver pedido completo" });
    expect(link.getAttribute("href")).toBe("/pedidos/historial/historical-order-original");
    expect(screen.getByText("Movimientos y pedido original de Techrez")).toBeTruthy();
    expect(screen.getByText("Cliente histórico de prueba")).toBeTruthy();
    expect(screen.queryByText(i18n.t("serialHistory.notFound"))).toBeNull();
    expect(screen.queryByRole("button", { name: /despachar|reactivar|editar/i })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Imprimir etiqueta" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Imprimir etiqueta" }));
    expect(mocks.imprimirEtiquetas).toHaveBeenCalledWith([{
      producto: "Apple iPhone 14 Pro Max 128 GB",
      serial: "359111222333444",
      nota: "",
    }]);
    expect(getArchivedImeiTrace).toHaveBeenCalledWith("359111222333444");
    expect(db.units).toHaveLength(0);
    expect(db.orders).toHaveLength(0);
  });

  it("no atribuye un pedido al serial si solo coincide el código o el nombre del cliente", async () => {
    vi.mocked(getArchivedImeiTrace).mockResolvedValueOnce(null);
    render(<I18nextProvider i18n={i18n}><Almacen db={emptyDb()} serial="PED-HIST-001" /></I18nextProvider>);
    expect(await screen.findByText(i18n.t("serialHistory.notFound"))).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Hoja de vida histórica del serial" })).toBeNull();
  });

  it("informa una consulta histórica fallida sin afirmar que el serial no existe", async () => {
    vi.mocked(getArchivedImeiTrace).mockRejectedValueOnce(new Error("Consulta no disponible"));
    render(<I18nextProvider i18n={i18n}><Almacen db={emptyDb()} serial="359111222333444" /></I18nextProvider>);
    expect((await screen.findByRole("alert")).textContent).toContain("Consulta no disponible");
    expect(screen.queryByText(i18n.t("serialHistory.notFound"))).toBeNull();
  });

});

