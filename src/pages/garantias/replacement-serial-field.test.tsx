// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
const mocks = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mocks.toastError, warning: vi.fn() },
}));

import { emptyDb } from "@/lib/db";
import type { Db, Unit } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import { ReplacementSerialField } from "./replacement-serial-field";

const now = "2026-01-01T00:00:00Z";
const YO = { id: "u1", email: "b@x.com", fullName: "Bodeguero", role: "bodeguero" as const };

const unidad = (id: string, productId: string, serial: string, status: Unit["status"]): Unit => ({
  id, productId, serial, condition: "nuevo", status, receivedAt: now, createdBy: "u1",
});

const dbBase = (): Db => {
  const db = emptyDb();
  db.units = [
    unidad("a1", "p1", "S-100", "en_bodega"),
    unidad("a2", "p2", "S-200", "en_bodega"),
    unidad("a3", "p1", "S-300", "en_reparacion"), // no se puede entregar: está en taller
  ];
  db.products = [
    { id: "p1", sku: "IPH13", name: "iPhone 13", price: 0, cost: 0, minStock: 0, isActive: true, createdAt: now, updatedAt: now },
    { id: "p2", sku: "IPH14", name: "iPhone 14", price: 0, cost: 0, minStock: 0, isActive: true, createdAt: now, updatedAt: now },
  ];
  return db;
};

const Campo = ({ productId, referenciaManual, onPick }: { productId?: string; referenciaManual?: string; onPick: (id: string) => void }) => {
  const db = useMemo(dbBase, []);
  const [value, setValue] = useState("");
  const app = useMemo<AppValue>(
    () => ({
      db, ready: true, role: "bodeguero", run: vi.fn(), aplicarCambios: vi.fn(),
      login: vi.fn(), logout: vi.fn(), user: YO,
    }),
    [db],
  );
  return (
    <AppContext.Provider value={app}>
      <ReplacementSerialField
        warranty={{ id: "w-test", productId, referenciaManual }}
        value={value}
        onChange={(id) => {
          setValue(id);
          onPick(id);
        }}
      />
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
});
beforeEach(() => mocks.toastError.mockClear());
afterEach(cleanup);

const escribir = async (texto: string) => {
  const user = userEvent.setup();
  const campo = screen.getByPlaceholderText("Escribe o escanea el serial del equipo de reemplazo");
  await user.type(campo, `${texto}{Enter}`);
};

describe("ReplacementSerialField · el serial de reemplazo se escribe, no se elige de una lista", () => {
  it("acepta un serial disponible del mismo producto y lo muestra", async () => {
    const onPick = vi.fn();
    render(<Campo productId="p1" onPick={onPick} />);
    await escribir("S-100");
    expect(onPick).toHaveBeenCalledWith("a1");
    expect(await screen.findByText("S-100")).toBeTruthy();
  });

  it("rechaza un serial de otro producto cuando el caso tiene producto", async () => {
    const onPick = vi.fn();
    render(<Campo productId="p1" onPick={onPick} />);
    await escribir("S-200");
    expect(onPick).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it("rechaza un serial que existe pero no está disponible (en taller)", async () => {
    const onPick = vi.fn();
    render(<Campo productId="p1" onPick={onPick} />);
    await escribir("S-300");
    expect(onPick).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it("rechaza un serial que no existe en el inventario", async () => {
    const onPick = vi.fn();
    render(<Campo productId="p1" onPick={onPick} />);
    await escribir("NO-EXISTE");
    expect(onPick).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it("en una garantía previa con referencia conocida rechaza otro modelo", async () => {
    const onPick = vi.fn();
    render(<Campo referenciaManual="iPhone 13" onPick={onPick} />);
    await escribir("S-200");
    expect(onPick).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it("en una garantía previa sin referencia no permite elegir un modelo a ciegas", async () => {
    const onPick = vi.fn();
    render(<Campo onPick={onPick} />);
    await escribir("S-200");
    expect(onPick).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it("confirma solo un serial válido, sin presionar Enter", async () => {
    const onPick = vi.fn();
    render(<Campo productId="p1" onPick={onPick} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Escribe o escanea el serial del equipo de reemplazo"), "S-100");
    expect(await screen.findByText("S-100", undefined, { timeout: 2000 })).toBeTruthy();
    expect(onPick).toHaveBeenCalledWith("a1");
  });

  it("no rechaza con error mientras el serial aún se está escribiendo", async () => {
    const onPick = vi.fn();
    render(<Campo productId="p1" onPick={onPick} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Escribe o escanea el serial del equipo de reemplazo"), "S-1");
    await new Promise((r) => setTimeout(r, 700));
    expect(onPick).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
