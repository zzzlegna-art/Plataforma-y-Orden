// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import { emptyDb } from "@/lib/db";

const db = emptyDb();

vi.mock("@/hooks/use-store", () => ({ useStore: () => ({ db }) }));
vi.mock("@/lib/dashboard-order-rankings", () => ({
  getDashboardOrderRankings: vi.fn().mockResolvedValue({
    totalOrders: 0,
    consideredOrders: 0,
    cancelledOrders: 0,
    operationalOrders: 0,
    historicalOrders: 0,
    products: [],
    customers: [],
  }),
}));
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
    Area: ({ dataKey, type, strokeWidth, fill, dot }: {
      dataKey: string; type: string; strokeWidth: number; fill: string; dot: boolean;
    }) => <div data-testid="inventory-curve" data-key={dataKey}
      data-curve={type} data-width={strokeWidth} data-fill={fill}
      data-no-dots={dot === false ? "true" : "false"} />,
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
  it("respeta las cuatro secciones en el orden solicitado y conserva los accesos", () => {
    const { container } = open();
    const expected = [
      "Resumen de la operación",
      "Movimiento de inventario",
      "Rendimiento de pedidos",
      "Prioridades de garantías",
    ];
    const regions = [...container.querySelectorAll(".nx-dashboard-showcase > section.nx-dashboard-block")];
    expect(regions.map((region) => region.getAttribute("aria-label"))).toEqual(expected);
    expect(screen.getByRole("heading", { name: "Resumen de la operación" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Movimiento de inventario" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Rendimiento de pedidos" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Prioridades de garantías" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Gestionar garantías/ }).getAttribute("href")).toBe("/garantias");
    expect(screen.getByRole("status").textContent).toContain("No hay garantías abiertas");
    expect(screen.getByRole("link", { name: /Consultar seriales/ }).getAttribute("href")).toBe("/seriales");
  });

  it("muestra cuatro prioridades con sus cantidades sin duplicar datos", () => {
    open();
    for (const label of ["Críticas", "Estancadas", "Pendientes de entrega", "En servicio técnico"]) {
      expect(screen.getByRole("heading", { name: label })).toBeTruthy();
    }
    expect(screen.getByLabelText("Gráfica de entradas, asignaciones a pedidos y salidas físicas de inventario")).toBeTruthy();
    expect(screen.getByLabelText("Gráfica de estado de operaciones")).toBeTruthy();
  });

  it("dibuja entradas, salidas y asignaciones con líneas uniformes y áreas separadas", () => {
    const { container } = open();
    const chart = container.querySelector(".nx-dashboard-block--movement .nx-movement-chart");
    expect(container.querySelector(".nx-movement-premium")).toBeTruthy();
    expect(container.querySelectorAll(".nx-movement-legend")).toHaveLength(3);
    expect(chart).toBeTruthy();
    const curves = [...(chart?.querySelectorAll('[data-testid="inventory-curve"]') ?? [])];
    expect(curves).toHaveLength(3);
    expect(curves.map((el) => el.getAttribute("data-key")).sort()).toEqual([
      "asignaciones", "entradas", "salidas",
    ]);
    expect(curves.every((el) => el.getAttribute("data-curve") === "monotone"
      && el.getAttribute("data-no-dots") === "true")).toBe(true);
    expect(curves.map((el) => el.getAttribute("data-width"))).toEqual(["3", "3", "2.75"]);
    expect(new Set(curves.map((el) => el.getAttribute("data-fill"))).size).toBe(3);
  });

  it("mantiene indicadores, rankings y exportaciones sin restaurar la sección eliminada de últimos seriales", () => {
    const { container } = open();
    const summary = container.querySelector(".nx-dashboard-block--summary");
    const movement = container.querySelector(".nx-dashboard-block--movement");
    const performance = container.querySelector(".nx-dashboard-block--performance");
    const warranties = container.querySelector(".nx-dashboard-block--warranties");
    expect(summary?.querySelectorAll(".nx-premium-stat-card")).toHaveLength(4);
    expect(summary?.querySelectorAll(".nx-wide-stat")).toHaveLength(2);
    expect(movement?.querySelectorAll(".nx-analytics-card")).toHaveLength(2);
    expect(movement?.querySelector(".nx-dashboard-report-filters")).toBeTruthy();
    expect(movement?.textContent).toContain("Exportar CSV");
    expect(movement?.textContent).toContain("Exportar a Excel");
    expect(performance?.querySelectorAll(".nx-ranking-card")).toHaveLength(2);
    expect(performance?.querySelector(".nx-operation-card")).toBeNull();
    expect(warranties?.querySelectorAll(".nx-warranty-kpi")).toHaveLength(4);
    expect(container.querySelector(".nx-dashboard-showcase .nx-app-sidebar")).toBeNull();
  });

  it("conserva datos y acciones con el tema oscuro activado", () => {
    document.documentElement.classList.add("dark");
    try {
      const { container } = open();
      expect(container.querySelectorAll(".nx-dashboard-block")).toHaveLength(4);
      expect(screen.getByRole("button", { name: "Ver detalle de productos con stock bajo" })).toBeTruthy();
      expect(screen.getByRole("link", { name: /Gestionar garantías/ })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Rendimiento de pedidos" })).toBeTruthy();
    } finally {
      document.documentElement.classList.remove("dark");
    }
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
