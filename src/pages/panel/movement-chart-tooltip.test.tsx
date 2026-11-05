import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MovementChartTooltip, MOVEMENT_SERIES } from "./movement-chart-tooltip";

describe("Gráfica premium · movimiento de inventario", () => {
  it("conserva las tres series originales de Nexora en la leyenda y el tooltip", () => {
    expect(MOVEMENT_SERIES.map((series) => series.key))
      .toEqual(["entradas", "salidas", "asignaciones"]);
  });

  it("muestra los valores recibidos de Recharts, incluidos los ceros reales", () => {
    const markup = renderToStaticMarkup(
      <MovementChartTooltip
        active
        label="2 de nov"
        payload={[
          { dataKey: "asignaciones", value: 0 },
          { dataKey: "entradas", value: 2 },
          { dataKey: "salidas", value: 3 },
        ]}
      />,
    );
    expect(markup).toContain("2 de nov");
    expect(markup).toContain("Entradas");
    expect(markup).toContain("Salidas");
    expect(markup).toContain("Asignaciones");
    expect(markup).toContain('nx-movement-tooltip__number">0</strong>');
    expect(markup).toContain('nx-movement-tooltip__number">2</strong>');
    expect(markup).toContain('nx-movement-tooltip__number">3</strong>');
    expect(markup).toContain("no ventas");
  });

  it("no inventa cifras si una serie no vino en el tooltip", () => {
    const markup = renderToStaticMarkup(
      <MovementChartTooltip active label="5 de nov" payload={[{ dataKey: "entradas", value: 7 }]} />,
    );
    expect(markup).toContain("—");
  });

  it("no dibuja tooltip si no hay punto activo o datos", () => {
    expect(renderToStaticMarkup(<MovementChartTooltip active={false} payload={[]} />)).toBe("");
    expect(renderToStaticMarkup(<MovementChartTooltip active />)).toBe("");
  });
});
