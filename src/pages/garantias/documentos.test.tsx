// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
const mocks = vi.hoisted(() => ({
  subirDocumentoGarantia: vi.fn().mockResolvedValue(undefined),
  listarDocumentosDeGarantia: vi.fn(),
  urlDescargaDocumento: vi.fn(),
}));
vi.mock("@/lib/warranty-documents", () => ({
  subirDocumentoGarantia: mocks.subirDocumentoGarantia,
  listarDocumentosDeGarantia: mocks.listarDocumentosDeGarantia,
  urlDescargaDocumento: mocks.urlDescargaDocumento,
  TIPOS_DOCUMENTO_ACEPTADOS: "application/pdf,image/jpeg,image/png",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { emptyDb } from "@/lib/db";
import type { Db, Unit } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import Garantias from "./index";
import GarantiaDetalle from "./detalle";

const YO = { id: "b1", email: "bod@x.com", fullName: "Bodeguero", role: "bodeguero" as const };

const unidadVendida = (serial: string): Unit => ({
  id: `u-${serial}`,
  productId: "p1",
  serial,
  condition: "nuevo",
  status: "vendido",
  receivedAt: "2026-09-01T00:00:00Z",
  createdBy: YO.id,
});

const inicial = (): Db => {
  const db = emptyDb();
  db.products = [{ id: "p1", sku: "S1", name: "Apple iPhone 13 128 GB", price: 1, cost: 1, minStock: 0, isActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }];
  db.units = [unidadVendida("354198263141008"), unidadVendida("352114955762987"), unidadVendida("354347183921300")];
  return db;
};

const archivoPdf = (nombre = "relacion.pdf") => new File(["contenido"], nombre, { type: "application/pdf" });

const Almacen = () => {
  const [db, setDb] = useState(inicial);
  const value = useMemo<AppValue>(
    () => ({
      db,
      ready: true,
      role: "bodeguero",
      // Ejecuta la acción de verdad contra `db` (a diferencia de otras pruebas de esta
      // pantalla): aquí sí importa que la garantía quede creada, para poder enlazarle el archivo.
      run: (action) => {
        const siguiente = structuredClone(db) as Db;
        const resultado = action(siguiente, YO);
        setDb(siguiente);
        return Promise.resolve(resultado);
      },
      aplicarCambios: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      user: YO,
    }),
    [db],
  );
  return (
    <AppContext.Provider value={value}>
      <MemoryRouter initialEntries={["/garantias"]}>
        <Routes>
          <Route path="/garantias" element={<Garantias />} />
          <Route path="/garantias/:warrantyId" element={<GarantiaDetalle />} />
        </Routes>
      </MemoryRouter>
    </AppContext.Provider>
  );
};

const seleccionarArchivo = async (user: ReturnType<typeof userEvent.setup>, archivo: File) => {
  await user.click(screen.getByRole("button", { name: /Adjuntar PDF\/foto/ }));
  const input = screen.getByTestId("input-documento-garantia") as HTMLInputElement;
  await user.upload(input, archivo);
};

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => {
  mocks.subirDocumentoGarantia.mockClear();
  mocks.listarDocumentosDeGarantia.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

describe("Recibir garantía · adjuntar el PDF de la relación del proveedor", () => {
  it("una sola (por IMEI): al registrar, el documento se enlaza al id de la garantía creada", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);

    await user.type(screen.getByPlaceholderText(/serial|IMEI/i), "354198263141008{Enter}");
    await user.type(screen.getByLabelText("Motivo de la devolución"), "no enciende");
    await seleccionarArchivo(user, archivoPdf());
    expect(screen.getByText("relacion.pdf")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Registrar garantía" }));

    expect(mocks.subirDocumentoGarantia).toHaveBeenCalledTimes(1);
    const [archivo, ids] = mocks.subirDocumentoGarantia.mock.calls[0];
    expect(archivo.name).toBe("relacion.pdf");
    expect(ids).toHaveLength(1);
    expect(typeof ids[0]).toBe("string");
  });

  it("sin elegir archivo, no llama a subir nada", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.type(screen.getByPlaceholderText(/serial|IMEI/i), "354198263141008{Enter}");
    await user.type(screen.getByLabelText("Motivo de la devolución"), "no enciende");
    await user.click(screen.getByRole("button", { name: "Registrar garantía" }));
    expect(mocks.subirDocumentoGarantia).not.toHaveBeenCalled();
  });

  it("por lote (la hoja con varios equipos, como la del proveedor): un solo archivo se enlaza a las tres garantías del lote", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);

    await user.click(screen.getByRole("button", { name: "Por lote" }));
    const campo = screen.getByPlaceholderText(/serial|IMEI/i);
    for (const imei of ["354198263141008", "352114955762987", "354347183921300"]) {
      await user.type(campo, `${imei}{Enter}`);
    }
    for (const caja of screen.getAllByPlaceholderText(/motivo|razón/i)) {
      await user.type(caja, "revisión de rutina");
    }
    await seleccionarArchivo(user, archivoPdf("hoja-relacion-proveedor.pdf"));

    await user.click(screen.getByRole("button", { name: "Recibir todos" }));

    expect(mocks.subirDocumentoGarantia).toHaveBeenCalledTimes(1);
    const [archivo, ids] = mocks.subirDocumentoGarantia.mock.calls[0];
    expect(archivo.name).toBe("hoja-relacion-proveedor.pdf");
    expect(ids).toHaveLength(3); // las tres garantías del lote, un solo archivo
  });

  it("cambiar de modo limpia el archivo elegido (no se arrastra a otro registro)", async () => {
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);
    await user.type(screen.getByPlaceholderText(/serial|IMEI/i), "354198263141008{Enter}");
    await seleccionarArchivo(user, archivoPdf());
    expect(screen.getByText("relacion.pdf")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Falla de inventario" }));
    await user.click(screen.getByRole("button", { name: "Por IMEI" }));

    expect(screen.queryByText("relacion.pdf")).toBeNull();
  });
});

describe("Detalle de garantía · ver los documentos", () => {
  const dibujarDetalle = () =>
    render(
      <I18nextProvider i18n={i18n}>
        <AppContext.Provider
          value={{
            db: { ...emptyDb(), warranties: [{ id: "g1", code: "GAR-1", reason: "no enciende", status: "recibido", receivedAt: "2026-09-22T10:00:00Z", createdBy: YO.id }] },
            ready: true, role: "bodeguero", run: vi.fn(), aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(), user: YO,
          }}
        >
          <MemoryRouter initialEntries={["/garantias/g1"]}>
            <Routes><Route path="/garantias/:warrantyId" element={<GarantiaDetalle />} /></Routes>
          </MemoryRouter>
        </AppContext.Provider>
      </I18nextProvider>,
    );

  it("muestra los documentos enlazados, con botón para abrir cada uno", async () => {
    mocks.listarDocumentosDeGarantia.mockResolvedValue([
      { id: "d1", fileName: "relacion.pdf", createdAt: "2026-09-22T10:00:00Z", storagePath: "2026/x.pdf" },
    ]);
    mocks.urlDescargaDocumento.mockResolvedValue("https://x/relacion.pdf?token=1");
    const clickOriginal = HTMLAnchorElement.prototype.click;
    let enlaceClicado: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      enlaceClicado = this;
      return clickOriginal.call(this);
    });

    dibujarDetalle();

    expect(await screen.findByText("relacion.pdf")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(enlaceClicado).not.toBeNull();
    expect(enlaceClicado!.href).toBe("https://x/relacion.pdf?token=1");
    expect(enlaceClicado!.target).toBe("_blank");
  });

  it("sin documentos, muestra el mensaje vacío en vez de una lista", async () => {
    mocks.listarDocumentosDeGarantia.mockResolvedValue([]);
    dibujarDetalle();
    expect(await screen.findByText("No hay documentos para esta garantía.")).toBeTruthy();
  });

  it("desde el detalle también se puede subir un documento (no solo al recibirla)", async () => {
    mocks.listarDocumentosDeGarantia.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "d1", fileName: "nota-tecnico.jpg", createdAt: "2026-09-22T12:00:00Z", storagePath: "2026/n.jpg" },
    ]);
    const user = userEvent.setup();
    dibujarDetalle();

    expect(await screen.findByText("No hay documentos para esta garantía.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Subir" })).toBeNull(); // sin archivo elegido, no aparece

    await user.click(screen.getByRole("button", { name: /Adjuntar PDF\/foto/ }));
    const input = screen.getByTestId("input-documento-garantia") as HTMLInputElement;
    await user.upload(input, new File(["x"], "nota-tecnico.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "Subir" }));

    expect(mocks.subirDocumentoGarantia).toHaveBeenCalledWith(expect.objectContaining({ name: "nota-tecnico.jpg" }), ["g1"]);
    expect(await screen.findByText("nota-tecnico.jpg")).toBeTruthy(); // la lista se recarga sola
    expect(mocks.listarDocumentosDeGarantia).toHaveBeenCalledTimes(2);
  });

  it("si falla la subida desde el detalle, avisa y no borra el archivo elegido", async () => {
    mocks.listarDocumentosDeGarantia.mockResolvedValue([]);
    mocks.subirDocumentoGarantia.mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    dibujarDetalle();

    await screen.findByText("No hay documentos para esta garantía.");
    await user.click(screen.getByRole("button", { name: /Adjuntar PDF\/foto/ }));
    await user.upload(screen.getByTestId("input-documento-garantia"), archivoPdf());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    expect(screen.getByText("relacion.pdf")).toBeTruthy(); // sigue elegido, no se perdió
  });
});
