// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useRef, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/warranty-documents", () => ({
  listarDocumentosDeGarantia: vi.fn().mockResolvedValue([]),
  subirDocumentoGarantia: vi.fn(),
  urlDescargaDocumento: vi.fn(),
  TIPOS_DOCUMENTO_ACEPTADOS: "application/pdf",
}));
const mocks = vi.hoisted(() => ({ imprimirEtiquetas: vi.fn() }));
vi.mock("@/lib/print-labels", () => ({ imprimirEtiquetas: mocks.imprimirEtiquetas }));

import { emptyDb } from "@/lib/db";
import type { Db } from "@/lib/types";
import { esCodigoInterno } from "@/lib/imei";
import { AppContext, type AppValue } from "@/store/contexts";
import Garantias from "./index";

const now = "2026-01-01T00:00:00Z";
const YO = { id: "u1", email: "b@x.com", fullName: "Bodeguero", role: "bodeguero" as const };

const inicial = (): Db => {
  const db = emptyDb();
  db.customers = [
    { id: "c1", name: "Camilo Cartagena", categoriaMayorista: "celulares", isActive: true, createdAt: now },
  ];
  db.products = [
    { id: "p1", sku: "IP13-128", name: "Apple iPhone 13 128 GB", categoria: "celular",
      minStock: 0, isActive: true, createdAt: now, updatedAt: now },
  ];
  db.warranties = [
    {
      id: "w1", code: "GAR-1", reason: "no enciende", status: "recibido", receivedAt: now,
      imeiManual: "000000001112223", referenciaManual: "Apple iPhone 13 128 GB",
      clienteManual: "Juan Pérez", createdBy: YO.id,
    },
  ];
  return db;
};

const Almacen = () => {
  const dbRef = useRef(inicial());
  const [, forceRender] = useState(0);
  const value = useMemo<AppValue>(
    () => ({
      db: dbRef.current, ready: true, role: "bodeguero",
      run: (action) => {
        const siguiente = structuredClone(dbRef.current) as Db;
        const resultado = action(siguiente, YO);
        dbRef.current = siguiente;
        forceRender((n) => n + 1);
        return Promise.resolve(resultado);
      },
      aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(), user: YO,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fuerza refresco a propósito
    [dbRef.current],
  );
  return (
    <AppContext.Provider value={value}>
      <MemoryRouter initialEntries={["/garantias"]}>
        <Routes><Route path="/garantias" element={<Garantias />} /></Routes>
      </MemoryRouter>
    </AppContext.Provider>
  );
};

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
});
afterEach(cleanup);

describe("Garantía previa · celular apagado, sin IMEI legible", () => {
  it('el botón "Apagado / sin IMEI" llena el campo con un código generado válido', async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);

    await user.click(screen.getByRole("button", { name: "Garantía previa" }));
    await user.click(screen.getByRole("button", { name: "Apagado / sin IMEI" }));

    const campo = screen.getByPlaceholderText("IMEI o serial") as HTMLInputElement;
    expect(campo.value).not.toBe("");
    expect(esCodigoInterno(campo.value)).toBe(true);
  });

  it("no repite un código ya usado por otra garantía previa abierta", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.click(screen.getByRole("button", { name: "Garantía previa" }));
    await user.click(screen.getByRole("button", { name: "Apagado / sin IMEI" }));
    const campo = screen.getByPlaceholderText("IMEI o serial") as HTMLInputElement;
    expect(campo.value).not.toBe("000000001112223"); // el que ya existe en la garantía w1
  });
});

describe("Garantía previa · por lote · cliente persistente", () => {
  it("mantiene el cliente entre dos celulares y limpia solo los campos particulares", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);

    await user.click(screen.getByRole("button", { name: "Garantía previa" }));
    await user.click(screen.getByRole("button", { name: "Por lote" }));

    // El selector de cliente se elige una sola vez para todo el lote.
    await user.click(screen.getAllByRole("combobox")[2]);
    await user.click(await screen.findByRole("option", { name: "Camilo Cartagena" }));

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Celulares" }));
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByRole("option", { name: "Apple iPhone 13 128 GB" }));

    await user.type(screen.getByPlaceholderText("IMEI o serial"), "358071246352941");
    await user.type(screen.getByPlaceholderText("El cliente reporta que…"), "Pantalla apagada");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getAllByRole("combobox")[2].textContent).toContain("Camilo Cartagena");
    expect((screen.getByPlaceholderText("IMEI o serial") as HTMLInputElement).value).toBe("");
    expect((screen.getByPlaceholderText("El cliente reporta que…") as HTMLTextAreaElement).value).toBe("");

    // El modelo sí se elige de nuevo; el cliente ya está seleccionado.
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByRole("option", { name: "Apple iPhone 13 128 GB" }));
    await user.type(screen.getByPlaceholderText("IMEI o serial"), "358071246352959");
    await user.type(screen.getByPlaceholderText("El cliente reporta que…"), "No carga");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getAllByRole("combobox")[2].textContent).toContain("Camilo Cartagena");
    expect(screen.getByText("358071246352941")).toBeTruthy();
    expect(screen.getByText("358071246352959")).toBeTruthy();
    expect(screen.getAllByText("Apple iPhone 13 128 GB · Camilo Cartagena")).toHaveLength(2);
  });
});

describe("Garantías · Buscar · imprimir la etiqueta de un serial generado", () => {
  it("al buscar un código generado con un caso registrado, ofrece imprimir la etiqueta", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);

    await user.click(screen.getByRole("button", { name: "Buscar IMEI" }));
    await user.type(screen.getByPlaceholderText(/serial|IMEI/i), "000000001112223{Enter}");

    await user.click(await screen.findByRole("button", { name: "Imprimir etiqueta" }));

    expect(mocks.imprimirEtiquetas).toHaveBeenCalledWith([
      { producto: "Apple iPhone 13 128 GB", serial: "000000001112223" },
    ]);
  });

  it("al buscar un IMEI real (no generado), no ofrece imprimir ahí", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);

    await user.click(screen.getByRole("button", { name: "Buscar IMEI" }));
    await user.type(screen.getByPlaceholderText(/serial|IMEI/i), "354198263141008{Enter}");

    expect(screen.queryByRole("button", { name: "Imprimir etiqueta" })).toBeNull();
  });
});
