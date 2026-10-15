// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useCallback, useMemo, useState } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  controlIniciar: vi.fn(),
  controlMarcarSerial: vi.fn(),
  controlMarcarUnidad: vi.fn(),
  controlFinalizar: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/lib/backend", () => ({
  controlIniciar: mocks.controlIniciar,
  controlMarcarSerial: mocks.controlMarcarSerial,
  controlMarcarUnidad: mocks.controlMarcarUnidad,
  controlFinalizar: mocks.controlFinalizar,
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import type { CambioRemoto } from "@/lib/backend";
import { emptyDb } from "@/lib/db";
import { useStore } from "@/hooks/use-store";
import type { Db, Product, Unit } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import { SerialesSeccion } from "./seriales-section";

const INICIO = "2026-09-21T15:00:00.000000+00:00";
const MARCA = "2026-09-21T16:00:00.000000+00:00";

const producto = (extra: Partial<Product> = {}): Product => ({
  id: "p1",
  sku: "S1",
  name: "Apple iPhone 14 128 GB",
  price: 1,
  cost: 1,
  minStock: 0,
  isActive: true,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  ...extra,
});
const unidad = (serial: string, status: Unit["status"], receivedAt: string, extra: Partial<Unit> = {}): Unit => ({
  id: `u-${serial}`,
  productId: "p1",
  serial,
  condition: "nuevo",
  status,
  receivedAt,
  createdBy: "",
  ...extra,
});

/** Inventario de prueba: el vendido y el de reparación son los MÁS recientes (a propósito). */
const inventario = (controlActivo = false): Db => {
  const db = emptyDb();
  db.products = [
    producto(controlActivo ? { controlStartedAt: INICIO, controlStartedBy: "b1" } : {}),
    producto({ id: "p2", sku: "S2", name: "Otro producto" }),
  ];
  db.users = [{ id: "b1", email: "bod@x.com", fullName: "Bodeguero Uno", role: "bodeguero", isActive: true, createdAt: "2026-01-01T00:00:00Z" }];
  db.units = [
    unidad("350000000000010", "vendido", "2026-09-21T09:00:00Z"),
    unidad("350000000000011", "en_reparacion", "2026-09-21T08:00:00Z"),
    unidad("350000000000001", "en_bodega", "2026-09-20T10:00:00Z"),
    unidad("350000000000002", "en_bodega", "2026-09-20T09:00:00Z"),
    unidad("350000000000003", "en_bodega", "2026-09-20T08:00:00Z"),
    { ...unidad("360000000000001", "en_bodega", "2026-09-20T08:00:00Z"), id: "u-otro", productId: "p2" },
    unidad("350000000000099", "liberado", "2026-09-19T08:00:00Z"),
  ];
  return db;
};

/** Almacén mínimo: aplica en pantalla los cambios que el servidor ya guardó. */
const Almacen = ({ inicial, condicion }: { inicial: Db; condicion?: Unit["condition"] }) => {
  const [db, setDb] = useState(inicial);
  const aplicarCambios = useCallback((cambios: CambioRemoto[]) => {
    setDb((actual) => {
      const siguiente = structuredClone(actual) as unknown as Record<string, { id: string }[]>;
      for (const cambio of cambios) {
        const lista = siguiente[cambio.coleccion];
        const item = cambio.item as { id: string };
        const i = lista.findIndex((fila) => fila.id === item.id);
        if (i >= 0) lista[i] = item;
        else lista.push(item);
      }
      return siguiente as unknown as Db;
    });
  }, []);
  const value = useMemo<AppValue>(
    () => ({
      db,
      ready: true,
      user: { id: "b1", email: "bod@x.com", fullName: "Bodeguero Uno", role: "bodeguero" },
      role: "bodeguero",
      run: vi.fn(),
      aplicarCambios,
      login: vi.fn(),
      logout: vi.fn(),
    }),
    [db, aplicarCambios],
  );
  return (
    <AppContext.Provider value={value}>
      <Pantalla condicion={condicion} />
    </AppContext.Provider>
  );
};

/** Lo que hace la página de detalle: buscar el producto y sus unidades y pasarlos a la sección. */
const Pantalla = ({ condicion }: { condicion?: Unit["condition"] }) => {
  const { db } = useStore();
  const product = db.products.find((item) => item.id === "p1")!;
  const units = db.units
    .filter((unit) => unit.productId === "p1")
    .filter((unit) => (condicion ? unit.condition === condicion : true))
    .map((unit) => ({ unit, product }));
  return <SerialesSeccion product={product} units={units} condicion={condicion} onCambiarCondicion={vi.fn()} />;
};

const dibujar = (db: Db, condicion?: Unit["condition"]) =>
  render(
    <I18nextProvider i18n={i18n}>
      <Almacen inicial={db} condicion={condicion} />
    </I18nextProvider>,
  );

/** Seriales en el orden en que aparecen en la tabla. */
const seriales = () => screen.getAllByText(/^3[56]0000000000\d+$/).map((nodo) => nodo.textContent);

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({
    lng: "es",
    resources: { es: { translation: es } },
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
  });
  // jsdom no trae estas piezas del navegador que usan los componentes.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
  class Observador {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Observador);
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.releasePointerCapture = vi.fn();
});

beforeEach(() => {
  Object.values(mocks.toast).forEach((fn) => fn.mockReset());
  mocks.controlIniciar.mockReset();
  mocks.controlMarcarSerial.mockReset();
  mocks.controlMarcarUnidad.mockReset();
  mocks.controlFinalizar.mockReset();
});
afterEach(cleanup);

describe("orden de la lista de seriales", () => {
  it("primero los que están en bodega y después el resto por estado (aunque el vendido sea el más reciente)", () => {
    dibujar(inventario());
    expect(seriales()).toEqual([
      "350000000000001",
      "350000000000002",
      "350000000000003", // en bodega
      "350000000000011", // en reparación
      "350000000000010", // vendido
      "350000000000099", // liberado
    ]);
  });
});

describe("control físico · iniciar", () => {
  it("antes de iniciar se ofrece el botón y no hay barra de escaneo ni casillas", () => {
    dibujar(inventario());
    expect(screen.getByRole("button", { name: /Iniciar control físico/ })).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Escanea o escribe/)).toBeNull();
    expect(screen.queryByLabelText("Marcar como verificado")).toBeNull();
  });

  it("al iniciar, llama al servidor y aparece el avance, la barra de escaneo y las casillas", async () => {
    mocks.controlIniciar.mockResolvedValue(producto({ controlStartedAt: INICIO, controlStartedBy: "b1" }));
    const user = userEvent.setup();
    dibujar(inventario());

    await user.click(screen.getByRole("button", { name: /Iniciar control físico/ }));

    expect(mocks.controlIniciar).toHaveBeenCalledWith("p1");
    expect(await screen.findByText("En curso")).toBeTruthy();
    expect(screen.getByText(/0 de 3 en bodega verificados/)).toBeTruthy();
    expect(screen.getByText(/Iniciado por Bodeguero Uno/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/Escanea o escribe/)).toBeTruthy();
    expect(screen.getAllByLabelText("Marcar como verificado").length).toBe(6); // una por fila
  });

  it("si la base aún no tiene la actualización, avisa y no se rompe", async () => {
    const { DomainError } = await import("@/lib/db");
    mocks.controlIniciar.mockRejectedValue(new DomainError("control.notAvailable"));
    const user = userEvent.setup();
    dibujar(inventario());
    await user.click(screen.getByRole("button", { name: /Iniciar control físico/ }));
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining("falta aplicar la actualización"));
    expect(screen.queryByText("En curso")).toBeNull();
  });
});

describe("control físico · escanear (lector USB: escribe y envía Enter)", () => {
  it("un serial en bodega se marca: sube el avance, la casilla queda marcada y la fila resaltada", async () => {
    mocks.controlMarcarSerial.mockResolvedValue({
      resultado: "verificada",
      unidad: unidad("350000000000001", "en_bodega", "2026-09-20T10:00:00Z", { checkedAt: MARCA, checkedBy: "b1" }),
    });
    const user = userEvent.setup();
    dibujar(inventario(true));

    await user.type(screen.getByPlaceholderText(/Escanea o escribe/), "350000000000001{Enter}");

    expect(mocks.controlMarcarSerial).toHaveBeenCalledWith("p1", "350000000000001");
    expect(await screen.findByText(/1 de 3 en bodega verificados/)).toBeTruthy();
    expect(screen.getByText("Verificado: 350000000000001")).toBeTruthy();
    const fila = screen.getByText("350000000000001", { selector: "td span" }).closest("tr")!;
    expect(within(fila).getByRole("button", { name: "Quitar la marca" }).getAttribute("aria-pressed")).toBe("true");
    // Justo al marcar, destella; una vez que se apaga (ver "destello y vibración"), queda este tono.
    expect(fila.className).toMatch(/bg-success\/10|animate-row-flash-success/);
  });

  it("volver a escanear el mismo serial se rechaza en el acto, sin llamar al servidor", async () => {
    const user = userEvent.setup();
    const db = inventario(true);
    db.units[2] = unidad("350000000000001", "en_bodega", "2026-09-20T10:00:00Z", { checkedAt: MARCA });
    dibujar(db);

    await user.type(screen.getByPlaceholderText(/Escanea o escribe/), "350000000000001{Enter}");

    expect(mocks.controlMarcarSerial).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining("Ya estaba verificado"), expect.anything());
  });

  it("un serial que no existe se rechaza, no va al servidor y suma a «No registrados»", async () => {
    const user = userEvent.setup();
    dibujar(inventario(true));

    await user.type(screen.getByPlaceholderText(/Escanea o escribe/), "999999999999999{Enter}");

    expect(mocks.controlMarcarSerial).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining("no está registrado"), expect.anything());
    const dato = screen.getByText("No registrados").parentElement!;
    expect(within(dato).getByText("1")).toBeTruthy();
  });

  it("un serial de OTRO producto se rechaza y dice de cuál es", async () => {
    const user = userEvent.setup();
    dibujar(inventario(true));
    await user.type(screen.getByPlaceholderText(/Escanea o escribe/), "360000000000001{Enter}");
    expect(mocks.controlMarcarSerial).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining("Otro producto"), expect.anything());
  });

  it("un serial liberado se rechaza explicando que está fuera del sistema", async () => {
    const user = userEvent.setup();
    dibujar(inventario(true));
    await user.type(screen.getByPlaceholderText(/Escanea o escribe/), "350000000000099{Enter}");
    expect(mocks.controlMarcarSerial).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining("liberado"), expect.anything());
  });

  it("uno que el sistema tiene como vendido pero está en la mano: se marca y queda «fuera de estado»", async () => {
    mocks.controlMarcarSerial.mockResolvedValue({
      resultado: "fuera_de_estado",
      unidad: unidad("350000000000010", "vendido", "2026-09-21T09:00:00Z", { checkedAt: MARCA }),
    });
    const user = userEvent.setup();
    dibujar(inventario(true));

    await user.type(screen.getByPlaceholderText(/Escanea o escribe/), "350000000000010{Enter}");

    expect(mocks.controlMarcarSerial).toHaveBeenCalledWith("p1", "350000000000010");
    expect(mocks.toast.warning).toHaveBeenCalledWith(expect.stringContaining("figura como «Vendido»"));
    const dato = await screen.findByText("Fuera de estado", { selector: "p" });
    expect(within(dato.parentElement!).getByText("1")).toBeTruthy();
    // el avance de lo esperado NO se movió: la unidad vendida no cuenta como "en bodega"
    expect(screen.getByText(/0 de 3 en bodega verificados/)).toBeTruthy();
  });

  it("con el filtro «Nuevos», un seminuevo escaneado queda verificado pero se avisa que no aparece en la lista", async () => {
    mocks.controlMarcarSerial.mockResolvedValue({
      resultado: "verificada",
      unidad: unidad("350000000000002", "en_bodega", "2026-09-20T09:00:00Z", { condition: "seminuevo", checkedAt: MARCA }),
    });
    const user = userEvent.setup();
    const db = inventario(true);
    db.units[3] = unidad("350000000000002", "en_bodega", "2026-09-20T09:00:00Z", { condition: "seminuevo" });
    dibujar(db, "nuevo");

    await user.type(screen.getByPlaceholderText(/Escanea o escribe/), "350000000000002{Enter}");

    expect(await screen.findByText(/es seminuevo y ahora solo estás viendo nuevo/)).toBeTruthy();
    expect(screen.getByText(/0 de 2 en bodega verificados/)).toBeTruthy(); // el avance es solo de los nuevos
  });

  it("si otra persona cerró el control mientras tanto, se avisa", async () => {
    const { DomainError } = await import("@/lib/db");
    mocks.controlMarcarSerial.mockRejectedValue(new DomainError("control.notActive"));
    const user = userEvent.setup();
    dibujar(inventario(true));
    await user.type(screen.getByPlaceholderText(/Escanea o escribe/), "350000000000002{Enter}");
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining("ya no está activo"));
  });
});

describe("control físico · marca manual y filtros", () => {
  it("marcar a mano una fila llama al servidor con esa unidad", async () => {
    mocks.controlMarcarUnidad.mockResolvedValue(
      unidad("350000000000002", "en_bodega", "2026-09-20T09:00:00Z", { checkedAt: MARCA }),
    );
    const user = userEvent.setup();
    dibujar(inventario(true));

    const fila = screen.getByText("350000000000002", { selector: "td span" }).closest("tr")!;
    await user.click(within(fila).getByRole("button", { name: "Marcar como verificado" }));

    expect(mocks.controlMarcarUnidad).toHaveBeenCalledWith("u-350000000000002", true);
    expect(await screen.findByText(/1 de 3 en bodega verificados/)).toBeTruthy();
  });

  it("quitar la marca de una fila verificada la desmarca", async () => {
    mocks.controlMarcarUnidad.mockResolvedValue(unidad("350000000000001", "en_bodega", "2026-09-20T10:00:00Z"));
    const user = userEvent.setup();
    const db = inventario(true);
    db.units[2] = unidad("350000000000001", "en_bodega", "2026-09-20T10:00:00Z", { checkedAt: MARCA });
    dibujar(db);

    const fila = screen.getByText("350000000000001", { selector: "td span" }).closest("tr")!;
    await user.click(within(fila).getByRole("button", { name: "Quitar la marca" }));

    expect(mocks.controlMarcarUnidad).toHaveBeenCalledWith("u-350000000000001", false);
    expect(await screen.findByText(/0 de 3 en bodega verificados/)).toBeTruthy();
  });

  it("«Pendientes» oculta lo verificado y «Verificados» muestra solo eso", async () => {
    const user = userEvent.setup();
    const db = inventario(true);
    db.units[2] = unidad("350000000000001", "en_bodega", "2026-09-20T10:00:00Z", { checkedAt: MARCA });
    dibujar(db);

    await user.click(screen.getByRole("button", { name: "Pendientes" }));
    expect(seriales()).not.toContain("350000000000001");
    expect(seriales()).toContain("350000000000002");

    await user.click(screen.getByRole("button", { name: "Verificados" }));
    expect(seriales()).toEqual(["350000000000001"]);
  });
});

describe("control físico · finalizar y reiniciar", () => {
  it("finalizar muestra lo que falta y guarda el resumen; no cambia estados", async () => {
    mocks.controlFinalizar.mockResolvedValue(producto());
    const user = userEvent.setup();
    const db = inventario(true);
    db.units[2] = unidad("350000000000001", "en_bodega", "2026-09-20T10:00:00Z", { checkedAt: MARCA });
    dibujar(db);

    await user.click(screen.getByRole("button", { name: "Finalizar control" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Faltan por verificar (2)")).toBeTruthy();
    expect(within(dialogo).getByText("350000000000002")).toBeTruthy();
    expect(within(dialogo).getByText("350000000000003")).toBeTruthy();

    await user.click(within(dialogo).getByRole("button", { name: "Finalizar y guardar" }));

    expect(mocks.controlFinalizar).toHaveBeenCalledTimes(1);
    const [productId, resumen] = mocks.controlFinalizar.mock.calls[0];
    expect(productId).toBe("p1");
    expect(resumen).toContain("1 de 3 en bodega verificados");
    expect(resumen).toContain("faltan 2: 350000000000002, 350000000000003");
    expect(await screen.findByRole("button", { name: /Iniciar control físico/ })).toBeTruthy(); // el control se cerró
    expect(mocks.toast.success).toHaveBeenCalledWith("Control finalizado y guardado en la auditoría");
  });

  it("si está todo verificado, el resumen lo dice", async () => {
    const user = userEvent.setup();
    const db = inventario(true);
    for (const i of [2, 3, 4]) db.units[i] = { ...db.units[i], checkedAt: MARCA };
    dibujar(db);
    await user.click(screen.getByRole("button", { name: "Finalizar control" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Están todos los equipos que el sistema tiene en bodega.")).toBeTruthy();
  });

  it("reiniciar pide confirmación y vuelve a llamar a iniciar", async () => {
    mocks.controlIniciar.mockResolvedValue(producto({ controlStartedAt: "2026-09-21T17:00:00.000000+00:00", controlStartedBy: "b1" }));
    const user = userEvent.setup();
    const db = inventario(true);
    db.units[2] = unidad("350000000000001", "en_bodega", "2026-09-20T10:00:00Z", { checkedAt: MARCA });
    dibujar(db);
    expect(screen.getByText(/1 de 3 en bodega verificados/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Reiniciar" }));
    expect(mocks.controlIniciar).not.toHaveBeenCalled(); // primero pregunta
    await user.click(await screen.findByRole("button", { name: "Confirmar" }));

    expect(mocks.controlIniciar).toHaveBeenCalledWith("p1");
    // el nuevo inicio es posterior a la marca: lo verificado antes deja de contar
    expect(await screen.findByText(/0 de 3 en bodega verificados/)).toBeTruthy();
  });
});

describe("control físico · destello y vibración al marcar", () => {
  // Reloj real: mezclar temporizadores simulados con la escritura de userEvent resultó frágil.
  // La espera de 850 ms (más que los 800 ms del destello) es real pero corta.
  const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("al escanear un serial en bodega, la fila destella en verde, el celular vibra cortito, y el destello se apaga solo", async () => {
    const vibrar = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, vibrate: vibrar });
    mocks.controlMarcarSerial.mockResolvedValue({
      resultado: "verificada",
      unidad: unidad("350000000000001", "en_bodega", "2026-09-20T10:00:00Z", { checkedAt: MARCA, checkedBy: "b1" }),
    });
    const user = userEvent.setup();
    dibujar(inventario(true));

    await user.type(screen.getByPlaceholderText(/Escanea o escribe/), "350000000000001{Enter}");

    const fila = screen.getByText("350000000000001", { selector: "td span" }).closest("tr")!;
    expect(fila.className).toContain("animate-row-flash-success");
    expect(vibrar).toHaveBeenCalledWith(15);

    await waitFor(() => expect(fila.className).not.toContain("animate-row-flash-success"), { timeout: 2000 });
    expect(fila.className).toContain("bg-success/10"); // queda con el tono de reposo
  });

  it("uno que el sistema tiene como vendido pero está en la mano: destella en ámbar, con doble vibración", async () => {
    const vibrar = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, vibrate: vibrar });
    mocks.controlMarcarSerial.mockResolvedValue({
      resultado: "fuera_de_estado",
      unidad: unidad("350000000000010", "vendido", "2026-09-21T09:00:00Z", { checkedAt: MARCA }),
    });
    const user = userEvent.setup();
    dibujar(inventario(true));

    await user.type(screen.getByPlaceholderText(/Escanea o escribe/), "350000000000010{Enter}");

    const fila = screen.getByText("350000000000010", { selector: "td span" }).closest("tr")!;
    expect(fila.className).toContain("animate-row-flash-warning");
    expect(vibrar).toHaveBeenCalledWith([10, 40, 15]);
  });

  it("marcar a mano también destella; desmarcar NO vibra ni destella", async () => {
    const vibrar = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, vibrate: vibrar });
    mocks.controlMarcarUnidad.mockResolvedValue(
      unidad("350000000000002", "en_bodega", "2026-09-20T09:00:00Z", { checkedAt: MARCA }),
    );
    const user = userEvent.setup();
    dibujar(inventario(true));

    const fila = screen.getByText("350000000000002", { selector: "td span" }).closest("tr")!;
    await user.click(within(fila).getByRole("button", { name: "Marcar como verificado" }));

    expect(fila.className).toContain("animate-row-flash-success");
    expect(vibrar).toHaveBeenCalledTimes(1);

    // Desmarcar, ya sin destello (esperamos a que termine para no mezclar los dos estados).
    await esperar(850);
    mocks.controlMarcarUnidad.mockResolvedValue(unidad("350000000000002", "en_bodega", "2026-09-20T09:00:00Z"));
    await user.click(within(fila).getByRole("button", { name: "Quitar la marca" }));
    expect(vibrar).toHaveBeenCalledTimes(1); // no sumó una segunda vibración al desmarcar
  }, 10_000);

  it("si no hay soporte de vibración en el navegador, no revienta", async () => {
    vi.stubGlobal("navigator", { ...navigator, vibrate: undefined });
    mocks.controlMarcarSerial.mockResolvedValue({
      resultado: "verificada",
      unidad: unidad("350000000000001", "en_bodega", "2026-09-20T10:00:00Z", { checkedAt: MARCA }),
    });
    const user = userEvent.setup();
    dibujar(inventario(true));
    await user.type(screen.getByPlaceholderText(/Escanea o escribe/), "350000000000001{Enter}");
    expect(await screen.findByText(/1 de 3 en bodega verificados/)).toBeTruthy();
  });
});
