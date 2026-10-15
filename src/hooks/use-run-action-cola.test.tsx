// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useMemo, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { useRunAction } from "@/hooks/use-run-action";
import { AppContext, type AppValue } from "@/store/contexts";

const ACTOR = { id: "u1", email: "a@x.com", fullName: "Admin", role: "admin" as const };

/**
 * Imita el `run` real de la app: guarda en una referencia mutable (como `dbRef`), aplica el
 * cambio de la acción de forma OPTIMISTA y SÍNCRONA (como `aplicarDb`), y solo después espera
 * un guardado que tarda un poco (como el viaje al servidor). Con esto se reproduce la misma
 * carrera que había en la app real: si dos llamadas a `run` arrancan casi juntas, sin ponerse
 * en fila, la segunda lee la referencia ANTES de que la primera alcance a escribir su cambio.
 */
const armarRunConCarrera = (estado: { seriales: string[] }) => {
  const run: AppValue["run"] = async (action) => {
    const borrador = { seriales: [...estado.seriales] };
    const resultado = await action(borrador as never, ACTOR);
    estado.seriales = borrador.seriales; // "aplicarDb": síncrono, optimista
    await new Promise((resolve) => setTimeout(resolve, 15)); // "pushDb": tarda un poco
    return resultado;
  };
  return run;
};

const Botones = ({ onLista }: { onLista: (seriales: string[]) => void }) => {
  const runAction = useRunAction();
  const agregar = (serial: string) =>
    void runAction((db) => {
      (db as unknown as { seriales: string[] }).seriales.push(serial);
      onLista([...(db as unknown as { seriales: string[] }).seriales]);
    });
  return (
    <>
      <button onClick={() => agregar("A")}>Escanear A</button>
      <button onClick={() => agregar("B")}>Escanear B</button>
      <button
        onClick={() => {
          agregar("C");
          agregar("D"); // dos "escaneos" disparados sin esperar el primero
        }}
      >
        Escanear rápido C y D
      </button>
    </>
  );
};

const Almacen = ({ onLista }: { onLista: (seriales: string[]) => void }) => {
  const [estado] = useState({ seriales: [] as string[] });
  const value = useMemo<AppValue>(
    () => ({
      db: {} as AppValue["db"], ready: true, role: "admin", run: armarRunConCarrera(estado),
      aplicarCambios: vi.fn(), login: vi.fn(), logout: vi.fn(), user: ACTOR,
    }),
    [estado],
  );
  return (
    <AppContext.Provider value={value}>
      <Botones onLista={onLista} />
    </AppContext.Provider>
  );
};

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
});
afterEach(cleanup);

describe("useRunAction · pone en fila las acciones que se disparan muy seguido", () => {
  it("dos escaneos casi juntos: los dos quedan, ninguno se pisa ni desaparece", async () => {
    let ultimaLista: string[] = [];
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen onLista={(l) => (ultimaLista = l)} /></I18nextProvider>);

    // Sin esperar el primer clic (el "escaneo" A) antes de disparar el segundo (B): es
    // justo la situación de escanear rápido que antes hacía que uno "desapareciera".
    await user.click(screen.getByRole("button", { name: "Escanear A" }));
    await user.click(screen.getByRole("button", { name: "Escanear B" }));

    await new Promise((resolve) => setTimeout(resolve, 80)); // deja terminar las dos en fila

    expect(ultimaLista.sort()).toEqual(["A", "B"]);
  });

  it("dos acciones disparadas EN EL MISMO instante (sin ningún await entre ellas) también quedan las dos", async () => {
    let ultimaLista: string[] = [];
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}><Almacen onLista={(l) => (ultimaLista = l)} /></I18nextProvider>);

    await user.click(screen.getByRole("button", { name: "Escanear rápido C y D" }));
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(ultimaLista.sort()).toEqual(["C", "D"]);
  });
});
