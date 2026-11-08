// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useCallback, useMemo, useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const mocks = vi.hoisted(() => ({ imprimirEtiquetas: vi.fn() }));
vi.mock("@/lib/print-labels", () => ({ imprimirEtiquetas: mocks.imprimirEtiquetas }));

import type { CambioRemoto } from "@/lib/backend";
import { emptyDb } from "@/lib/db";
import { useStore } from "@/hooks/use-store";
import type { Db, Product, Unit } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import { SerialesSeccion } from "./seriales-section";

const producto = (extra: Partial<Product> = {}): Product => ({
  id: "p1",
  sku: "S1",
  name: "Apple iPhone 12 - 128 GB",
  price: 1,
  cost: 1,
  minStock: 0,
  isActive: true,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  ...extra,
});
const unidad = (serial: string, status: Unit["status"], receivedAt: string): Unit => ({
  id: `u-${serial}`,
  productId: "p1",
  serial,
  condition: "nuevo",
  status,
  receivedAt,
  createdBy: "",
});

const inventario = (): Db => {
  const db = emptyDb();
  db.products = [producto()];
  db.units = [
    unidad("359175923749557", "en_bodega", "2026-09-20T10:00:00Z"),
    unidad("354791666675724", "en_bodega", "2026-09-20T09:00:00Z"),
    unidad("357065942117702", "vendido", "2026-09-19T09:00:00Z"),
  ];
  return db;
};

const Almacen = ({ inicial }: { inicial: Db }) => {
  const [db] = useState(inicial);
  const aplicarCambios = useCallback((_cambios: CambioRemoto[]) => undefined, []);
  const value = useMemo<AppValue>(
    () => ({
      db, ready: true, user: { id: "b1", email: "bod@x.com", fullName: "Bodeguero Uno", role: "bodeguero" },
      role: "bodeguero", run: vi.fn(), aplicarCambios, login: vi.fn(), logout: vi.fn(),
    }),
    [db, aplicarCambios],
  );
  return (
    <AppContext.Provider value={value}>
      <Pantalla />
    </AppContext.Provider>
  );
};

const Pantalla = () => {
  const { db } = useStore();
  const product = db.products[0];
  const units = db.units.map((unit) => ({ unit, product }));
  return <SerialesSeccion product={product} units={units} condicion={undefined} onCambiarCondicion={vi.fn()} />;
};

const dibujar = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <Almacen inicial={inventario()} />
    </I18nextProvider>,
  );

const filaDe = (serial: string) => screen.getByText(serial).closest("tr")!;
const casillaDe = (serial: string) => within(filaDe(serial)).getByRole("checkbox");
const botonImprimir = () => screen.getByRole("button", { name: /Imprimir etiquetas/ });

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
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => mocks.imprimirEtiquetas.mockReset());
afterEach(cleanup);

describe("Detalle de producto · elegir seriales e imprimir etiquetas", () => {
  it("el botón empieza deshabilitado, sin nada elegido", () => {
    dibujar();
    expect(botonImprimir().hasAttribute("disabled")).toBe(true);
  });

  it("elegir dos seriales e imprimir manda exactamente esos dos, con el nombre del producto", async () => {
    const user = userEvent.setup();
    dibujar();

    await user.click(casillaDe("359175923749557"));
    await user.click(casillaDe("354791666675724"));
    expect(botonImprimir().hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/2 elegidos/)).toBeTruthy();

    await user.click(botonImprimir());
    // El botón abre una ventana para escribir una nota opcional; se imprime al confirmar ahí.
    expect(mocks.imprimirEtiquetas).not.toHaveBeenCalled();
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Imprimir etiqueta" }),
    );

    expect(mocks.imprimirEtiquetas).toHaveBeenCalledTimes(1);
    expect(mocks.imprimirEtiquetas).toHaveBeenCalledWith([
      { producto: "Apple iPhone 12 - 128 GB", serial: "359175923749557", nota: "" },
      { producto: "Apple iPhone 12 - 128 GB", serial: "354791666675724", nota: "" },
    ]);
  });

  it("«Elegir todos los que se ven» marca los tres y vuelve a desmarcarlos", async () => {
    const user = userEvent.setup();
    dibujar();

    await user.click(screen.getByRole("checkbox", { name: "Elegir todos los que se ven" }));
    expect(casillaDe("359175923749557").getAttribute("aria-checked")).toBe("true");
    expect(casillaDe("354791666675724").getAttribute("aria-checked")).toBe("true");
    expect(casillaDe("357065942117702").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/3 elegidos/)).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "Elegir todos los que se ven" }));
    expect(casillaDe("359175923749557").getAttribute("aria-checked")).toBe("false");
  });

  it("«Limpiar» quita toda la selección", async () => {
    const user = userEvent.setup();
    dibujar();
    await user.click(casillaDe("359175923749557"));
    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(casillaDe("359175923749557").getAttribute("aria-checked")).toBe("false");
    expect(botonImprimir().hasAttribute("disabled")).toBe(true);
  });

  it("marcar un serial para el control físico es independiente de elegirlo para imprimir", async () => {
    const user = userEvent.setup();
    dibujar();
    await user.click(screen.getByRole("button", { name: /Iniciar control físico/ }));
    await user.click(casillaDe("359175923749557"));
    // El control físico también agrega botones a la fila; la casilla de imprimir sigue única y marcada.
    expect(casillaDe("359175923749557").getAttribute("aria-checked")).toBe("true");
    expect(mocks.imprimirEtiquetas).not.toHaveBeenCalled();
  });
});


describe("Detalle de producto · búsqueda instantánea de seriales", () => {
  it("filtra en tiempo real por cualquier fragmento del IMEI y restaura la lista al borrar", async () => {
    const user = userEvent.setup();
    dibujar();
    const search = screen.getByRole("searchbox", {
      name: "Buscar serial o IMEI en esta referencia",
    });

    await user.type(search, "6666");
    expect(screen.getByText("354791666675724")).toBeTruthy();
    expect(screen.queryByText("359175923749557")).toBeNull();
    expect(screen.queryByText("357065942117702")).toBeNull();
    expect(screen.getByText("1 de 3 seriales")).toBeTruthy();

    await user.clear(search);
    expect(screen.getByText("359175923749557")).toBeTruthy();
    expect(screen.getByText("354791666675724")).toBeTruthy();
    expect(screen.getByText("357065942117702")).toBeTruthy();
  });

  it("muestra un estado vacío cuando no hay coincidencias y permite limpiar el filtro", async () => {
    const user = userEvent.setup();
    dibujar();
    await user.type(
      screen.getByRole("searchbox", { name: "Buscar serial o IMEI en esta referencia" }),
      "no-existe-imei",
    );
    expect(screen.getByText("No hay seriales que coincidan")).toBeTruthy();
    expect(screen.getByText("0 de 3 seriales")).toBeTruthy();
    expect(screen.queryByText("359175923749557")).toBeNull();

    await user.click(screen.getAllByRole("button", { name: "Limpiar búsqueda de seriales" })[0]);
    expect(screen.getByText("359175923749557")).toBeTruthy();
  });

  it("conserva la selección entre búsquedas e imprime todos los seriales elegidos", async () => {
    const user = userEvent.setup();
    dibujar();
    const search = screen.getByRole("searchbox", {
      name: "Buscar serial o IMEI en esta referencia",
    });

    await user.type(search, "359175");
    await user.click(casillaDe("359175923749557"));
    await user.clear(search);
    await user.type(search, "354791");
    await user.click(casillaDe("354791666675724"));

    expect(screen.getByText(/2 elegidos/)).toBeTruthy();
    await user.click(botonImprimir());
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Imprimir etiqueta" }),
    );
    expect(mocks.imprimirEtiquetas).toHaveBeenCalledWith([
      { producto: "Apple iPhone 12 - 128 GB", serial: "359175923749557", nota: "" },
      { producto: "Apple iPhone 12 - 128 GB", serial: "354791666675724", nota: "" },
    ]);
  });
});
