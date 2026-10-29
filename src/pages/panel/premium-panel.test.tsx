// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import { emptyDb } from "@/lib/db";

const db = emptyDb();

vi.mock("@/hooks/use-store", () => ({ useStore: () => ({ db }) }));
vi.mock("@/hooks/use-prefers-reduced-motion", () => ({ usePrefersReducedMotion: () => true }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("recharts", () => {
  const WithChildren = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Shape = () => <div />;
  return {
    ResponsiveContainer: WithChildren,
    AreaChart: WithChildren,
    Area: Shape,
    Line: Shape,
    CartesianGrid: Shape,
    XAxis: Shape,
    YAxis: Shape,
    PieChart: WithChildren,
    Pie: WithChildren,
    Cell: Shape,
    Tooltip: Shape,
  };
});
vi.mock("./rank-chart", () => ({ RankChart: () => <div>Ranking</div> }));

import Panel from "./index";

afterEach(() => cleanup());

const open = () => render(
  <MemoryRouter initialEntries={["/panel"]}>
    <Panel />
  </MemoryRouter>,
);

describe("panel premium sin cambiar la barra lateral", () => {
  it("presenta primero las prioridades y luego ambos gráficos reales", () => {
    const { container } = open();
    const names = [
      "Prioridades de garantías",
      "Movimiento de inventario",
      "Estado de operaciones",
      "Resumen de la operación",
    ];
    const documentText = container.textContent ?? "";
    let previous = -1;
    for (const name of names) {
      const position = documentText.indexOf(name);
      expect(position).toBeGreaterThan(previous);
      previous = position;
    }
    expect(screen.getByRole("heading", { name: "Prioridades de garantías" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Gestionar garantías/ }).getAttribute("href")).toBe("/garantias");
    expect(screen.getByRole("status").textContent).toContain("No hay garantías abiertas");
  });

  it("muestra cuatro prioridades con sus cantidades sin duplicar datos", () => {
    open();
    for (const label of ["Críticas", "Estancadas", "Pendientes de entrega", "En servicio técnico"]) {
      expect(screen.getByRole("heading", { name: label })).toBeTruthy();
    }
    expect(screen.getByLabelText("Gráfica de entradas y salidas de inventario")).toBeTruthy();
    expect(screen.getByLabelText("Gráfica de estado de operaciones")).toBeTruthy();
  });

  it("permite cambiar el rango del gráfico sin perder el período personalizado", () => {
    open();
    const filter = screen.getByRole("combobox", { name: "Período del gráfico de inventario" }) as HTMLSelectElement;
    expect(filter.value).toBe("month");
    fireEvent.change(filter, { target: { value: "30d" } });
    expect(filter.value).toBe("30d");
    fireEvent.change(screen.getByLabelText("Reporte desde"), { target: { value: "2026-10-01" } });
    expect(filter.value).toBe("custom");
    fireEvent.change(filter, { target: { value: "7d" } });
    expect(filter.value).toBe("7d");
  });
});
