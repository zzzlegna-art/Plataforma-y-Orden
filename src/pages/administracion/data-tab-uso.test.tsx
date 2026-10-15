// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
const mocks = vi.hoisted(() => ({ obtenerUsoAlmacenamiento: vi.fn() }));
vi.mock("@/lib/storage-usage", () => ({
  obtenerUsoAlmacenamiento: mocks.obtenerUsoAlmacenamiento,
  LIMITE_ARCHIVOS_BYTES: 1024 ** 3,
  LIMITE_BASE_DATOS_BYTES: 500 * 1024 ** 2,
  nivelDeUso: (bytes: number, limite: number) => {
    const p = limite > 0 ? bytes / limite : 0;
    if (p >= 0.9) return "critico";
    if (p >= 0.7) return "aviso";
    return "ok";
  },
  formatBytes: (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  },
}));

import { emptyDb } from "@/lib/db";
import { AppContext, type AppValue } from "@/store/contexts";
import { DataTab } from "./DataTab";

const Almacen = () => {
  const [db] = useState(emptyDb);
  const value = useMemo<AppValue>(
    () => ({
      db, ready: true, role: "admin", run: vi.fn(), aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(),
      user: { id: "u1", email: "a@x.com", fullName: "Admin", role: "admin" },
    }),
    [db],
  );
  return (
    <AppContext.Provider value={value}>
      <DataTab />
    </AppContext.Provider>
  );
};

const dibujar = () => render(<I18nextProvider i18n={i18n}><Almacen /></I18nextProvider>);

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
});
beforeEach(() => mocks.obtenerUsoAlmacenamiento.mockReset());
afterEach(cleanup);

describe("Administración > Datos · uso de almacenamiento", () => {
  it("con uso bajo, muestra los porcentajes y NO muestra ningún aviso", async () => {
    mocks.obtenerUsoAlmacenamiento.mockResolvedValue({
      documentosBytes: 4 * 1024 ** 2, // 4 MB de 1 GB
      documentosCount: 2,
      baseDatosBytes: 17 * 1024 ** 2, // 17 MB de 500 MB
    });
    dibujar();

    expect(await screen.findByText("0%")).toBeTruthy(); // archivos: 4MB/1GB redondea a 0%
    expect(screen.getByText("3%")).toBeTruthy(); // base de datos: 17/500 ≈ 3%
    expect(screen.getByText(/2 archivos/)).toBeTruthy();
    expect(screen.queryByText("Ya va quedando poco espacio.")).toBeNull();
    expect(screen.queryByText(/Muy cerca del límite/)).toBeNull();
  });

  it("entre 70% y 90%, muestra el aviso (no el crítico)", async () => {
    mocks.obtenerUsoAlmacenamiento.mockResolvedValue({
      documentosBytes: 0,
      documentosCount: 0,
      baseDatosBytes: Math.round(500 * 1024 ** 2 * 0.75), // 75% de la base de datos
    });
    dibujar();

    expect(await screen.findByText("Ya va quedando poco espacio.")).toBeTruthy();
    expect(screen.queryByText(/Muy cerca del límite/)).toBeNull();
  });

  it("90% o más, muestra el aviso crítico", async () => {
    mocks.obtenerUsoAlmacenamiento.mockResolvedValue({
      documentosBytes: Math.round(1024 ** 3 * 0.95), // 95% de archivos
      documentosCount: 500,
      baseDatosBytes: 0,
    });
    dibujar();

    expect(await screen.findByText(/Muy cerca del límite/)).toBeTruthy();
  });
});
