// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { Package } from "lucide-react";
import { cleanup, render, screen } from "@testing-library/react";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";

beforeAll(async () => {
  const es = JSON.parse(readFileSync("public/locales/es.json", "utf8")) as Record<string, string>;
  await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false } });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
});
afterEach(cleanup);

const dibujar = (elemento: React.ReactElement) => render(<I18nextProvider i18n={i18n}>{elemento}</I18nextProvider>);

describe("DataTable · estado vacío", () => {
  it("sin filas, muestra el título (con ícono y descripción si se dan) en vez de la tabla", () => {
    dibujar(
      <DataTable
        rows={[]}
        columns={[{ key: "x", header: "X", cell: () => "x" }]}
        renderCard={() => <div />}
        rowKey={() => "id"}
        emptyTitle="Sin productos"
        emptyDescription="Registra el primero."
        emptyIcon={Package}
      />,
    );
    expect(screen.getByText("Sin productos")).toBeTruthy();
    expect(screen.getByText("Registra el primero.")).toBeTruthy();
    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelector("svg")).toBeTruthy(); // el ícono
  });

  it("sin ícono ni descripción, sigue mostrando el título (no revienta)", () => {
    dibujar(
      <DataTable
        rows={[]}
        columns={[{ key: "x", header: "X", cell: () => "x" }]}
        renderCard={() => <div />}
        rowKey={() => "id"}
        emptyTitle="Sin nada"
      />,
    );
    expect(screen.getByText("Sin nada")).toBeTruthy();
  });

  it("muestra el botón de acción del estado vacío cuando se da", () => {
    const onClick = vi.fn();
    dibujar(
      <DataTable
        rows={[]}
        columns={[{ key: "x", header: "X", cell: () => "x" }]}
        renderCard={() => <div />}
        rowKey={() => "id"}
        emptyTitle="Sin productos"
        emptyAction={<button onClick={onClick}>Crear</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Crear" })).toBeTruthy();
  });

  it("con filas, aplica la superficie y los estados visuales unificados", () => {
    dibujar(
      <DataTable
        rows={[{ id: "1" }]}
        columns={[{ key: "x", header: "X", cell: (row: { id: string }) => row.id }]}
        renderCard={(row: { id: string }) => <div>{row.id}</div>}
        rowKey={(row: { id: string }) => row.id}
        emptyTitle="Sin productos"
      />,
    );
    expect(screen.queryByText("Sin productos")).toBeNull();
    const table = screen.getByRole("table");
    expect(table.closest(".overflow-hidden")?.className).toContain("rounded-xl");
    expect(table.querySelector("thead")?.className).toContain("bg-muted/50");
    expect(table.querySelector("tbody tr")?.className).toContain("hover:bg-primary/[0.04]");
  });
});
