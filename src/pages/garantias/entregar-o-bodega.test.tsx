// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useRef, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({}));
const mocks = vi.hoisted(() => ({ toastSuccess: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: vi.fn(), warning: vi.fn() } }));

import { emptyDb } from "@/lib/db";
import type { Db, Warranty } from "@/lib/types";
import { AppContext, type AppValue } from "@/store/contexts";
import { EntregarDialog } from "./modals";

const now = "2026-01-01T00:00:00Z";
const YO = { id: "u1", email: "b@x.com", fullName: "Bodeguero", role: "bodeguero" as const };

const dbCon = (warranty: Warranty): Db => {
  const db = emptyDb();
  db.units = [{ id: "un1", productId: "p1", serial: "354198263141008", condition: "seminuevo", status: "en_reparacion", receivedAt: now, createdBy: "u1" }];
  db.warranties = [warranty];
  return db;
};

const Almacen = ({ warranty }: { warranty: Warranty }) => {
  const dbRef = useRef(dbCon(warranty));
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
      <EntregarDialog warranty={warranty} trigger={<button>Abrir</button>} />
    </AppContext.Provider>
  );
};

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
});
afterEach(cleanup);

describe("EntregarDialog · elegir entre entregar al cliente o devolver a bodega", () => {
  it("con cliente y resolución reparado, ofrece elegir; por defecto entrega al cliente", async () => {
    const user = userEvent.setup();
    const warranty: Warranty = { id: "w1", code: "GAR-1", reason: "no enciende", status: "reenvio_pendiente", receivedAt: now, createdBy: "u1", resolucion: "reparado", unitId: "un1", customerId: "c1" };
    render(<Almacen warranty={warranty} />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("button", { name: "Entregar al cliente" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Devolver a bodega" })).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: "Entregar" }).slice(-1)[0]);
    // sin elegir nada, el botón principal dice "Entregar" (comportamiento de siempre)
  });

  it("eligiendo 'Devolver a bodega', el equipo queda en bodega, no entregado", async () => {
    const user = userEvent.setup();
    const warranty: Warranty = { id: "w1", code: "GAR-1", reason: "no enciende", status: "reenvio_pendiente", receivedAt: now, createdBy: "u1", resolucion: "reparado", unitId: "un1", customerId: "c1" };
    render(<Almacen warranty={warranty} />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await user.click(screen.getByRole("button", { name: "Devolver a bodega" }));
    await user.click(screen.getAllByRole("button", { name: "Devolver a bodega" }).slice(-1)[0]);

    expect(await screen.findByRole("button", { name: "Abrir" })).toBeTruthy(); // se cerró el diálogo
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Devuelto a bodega", expect.anything());
  });

  it("sin cliente (falla en inventario), no se ofrece elegir: ya vuelve solo a bodega", async () => {
    const user = userEvent.setup();
    const warranty: Warranty = { id: "w1", code: "GAR-1", reason: "no enciende", status: "reenvio_pendiente", receivedAt: now, createdBy: "u1", resolucion: "reparado", unitId: "un1" };
    render(<Almacen warranty={warranty} />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.queryByRole("button", { name: "Entregar al cliente" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Devolver a bodega" })).toBeNull();
  });

  it('con resolución "cambio", tampoco se ofrece elegir (el original no vuelve al cliente de todas formas)', async () => {
    const user = userEvent.setup();
    const warranty: Warranty = { id: "w1", code: "GAR-1", reason: "no enciende", status: "reenvio_pendiente", receivedAt: now, createdBy: "u1", resolucion: "cambio", unitId: "un1", customerId: "c1", productId: "p1" };
    render(<Almacen warranty={warranty} />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.queryByRole("button", { name: "Entregar al cliente" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Devolver a bodega" })).toBeNull();
  });
});
