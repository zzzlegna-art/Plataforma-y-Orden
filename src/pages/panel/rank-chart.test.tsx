// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import type { RankDatum } from "@/lib/dashboard-charts";
import { RankChart } from "./rank-chart";

afterEach(cleanup);

const products: RankDatum[] = [
  { key: "iphone-16", name: "iPhone 16 Pro 128 GB", short: "iPhone 16", value: 5, units: 5 },
  { key: "iphone-18", name: "iPhone 18 Pro Max 256 GB", short: "iPhone 18", value: 3, units: 3 },
  { key: "iphone-13", name: "iPhone 13 128 GB", short: "iPhone 13", value: 3, units: 3 },
  { key: "iphone-14", name: "iPhone 14 256", short: "iPhone 14", value: 1, units: 1 },
];

const renderProducts = () =>
  render(
    <RankChart
      data={products}
      summaryLabel="12 unidades totales"
      selectedSummaryLabel="Unidades vendidas de esta referencia"
      formatValue={(value) => String(value)}
    />,
  );

const summary = () => document.querySelector('[aria-live="polite"]') as HTMLElement;

describe("ranking interactivo del panel", () => {
  it("empieza con el líder y el total general, igual que el panel actual", () => {
    renderProducts();
    const area = within(summary());

    expect(area.getByText("12")).toBeTruthy();
    expect(area.getByText("12 unidades totales")).toBeTruthy();
    expect(area.getByText("LÍDER")).toBeTruthy();
    expect(area.getByText("iPhone 16 Pro 128 GB")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ver resumen de iPhone 16 Pro 128 GB/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("selecciona el segundo producto, actualiza cantidad, nombre, puesto y porcentaje; vuelve a #1 al seleccionarlo", () => {
    renderProducts();
    const second = screen.getByRole("button", { name: /Ver resumen de iPhone 18 Pro Max 256 GB/ });
    fireEvent.click(second);

    const area = within(summary());
    expect(second.getAttribute("aria-pressed")).toBe("true");
    expect(area.getByText("3")).toBeTruthy();
    expect(area.getByText("Unidades vendidas de esta referencia")).toBeTruthy();
    expect(area.getByText("PUESTO #2")).toBeTruthy();
    expect(area.getByText("iPhone 18 Pro Max 256 GB")).toBeTruthy();
    expect(area.getByText("3 · 25% del total")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Ver resumen de iPhone 16 Pro 128 GB/ }));
    expect(area.getByText("LÍDER")).toBeTruthy();
    expect(area.getByText("12 unidades totales")).toBeTruthy();
  });

  it("usa las cifras monetarias de clientes y el puesto real sin cambiar el total del ranking", () => {
    render(
      <RankChart
        data={[
          { key: "monica", name: "Monica", short: "Monica", value: 12000, units: 3 },
          { key: "ana", name: "Ana", short: "Ana", value: 8000, units: 2 },
        ]}
        summaryLabel="Valor acumulado"
        selectedSummaryLabel="Compras acumuladas de este cliente"
        formatValue={(value) => `$ ${value.toLocaleString("es-CO")}`}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Ver resumen de Ana/ }));
    const area = within(summary());
    expect(area.getByText("PUESTO #2")).toBeTruthy();
    expect(area.getByText("$ 8.000")).toBeTruthy();
    expect(area.getByText("$ 8.000 · 40% del total")).toBeTruthy();
  });

  it("restablece el #1 al desmontar el panel y volver a entrar", () => {
    const view = renderProducts();
    fireEvent.click(screen.getByRole("button", { name: /Ver resumen de iPhone 18 Pro Max 256 GB/ }));
    expect(within(summary()).getByText("PUESTO #2")).toBeTruthy();

    view.unmount();
    renderProducts();
    expect(within(summary()).getByText("LÍDER")).toBeTruthy();
    expect(within(summary()).getByText("12 unidades totales")).toBeTruthy();
  });

  it("vuelve visualmente al #1 cuando el seleccionado desaparece por una actualización", () => {
    const view = render(
      <RankChart
        data={products}
        summaryLabel="12 unidades totales"
        selectedSummaryLabel="Unidades de esta referencia"
        formatValue={String}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Ver resumen de iPhone 18 Pro Max 256 GB/ }));
    view.rerender(
      <RankChart
        data={products.filter((row) => row.key !== "iphone-18")}
        summaryLabel="9 unidades totales"
        selectedSummaryLabel="Unidades de esta referencia"
        formatValue={String}
      />,
    );
    expect(within(summary()).getByText("LÍDER")).toBeTruthy();
    expect(within(summary()).getByText("9 unidades totales")).toBeTruthy();
  });
});
