// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/nexora-imei-directory", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/nexora-imei-directory")>();
  return {
    ...original,
    fetchImeiDirectory: vi.fn(async () => ({
      initialApproved: false,
      summary: {
        sinConciliar: 1, enSede: 0, enTransito: 0, retornoPendiente: 0,
        vendidos: 0, sinCosto: 1, total: 1,
      },
      sites: [], page: 1, pageSize: 25, matched: 1,
      items: [{
        unitId: "unit-1",
        serial: "000012345678901",
        productName: "iPhone 13",
        sku: "IP13",
        cost: null,
        unitStatus: "en_bodega",
        custodyState: "sin_conciliar",
        siteId: null,
        siteName: null,
        cityName: null,
        historicalLocation: "Bodega (no verificada)",
        committedOrder: false,
        committedTransfer: false,
        commercialCandidate: false,
      }],
    })),
  };
});

import { ImeiSedesPanel } from "./ImeiSedesPanel";

afterEach(cleanup);

describe("Inventario global · ficha de IMEI", () => {
  it("abre al pulsar un IMEI y preserva la verdad física y el costo desconocido", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ImeiSedesPanel /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: /Ver IMEI por sede/ }));
    await user.click(await screen.findByRole("button", {
      name: "Abrir ficha del IMEI 000012345678901",
    }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Ficha de inventario multisede")).toBeTruthy();
    expect(within(dialog).getByText("Sin costo registrado")).toBeTruthy();
    expect(within(dialog).getAllByText("Sin sede verificada").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Operación restringida")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: /Abrir historial existente/ })
      .getAttribute("href")).toBe("/seriales?serial=000012345678901");
  });

  it("usa superficies semánticas adaptables a claro y oscuro y no habilita venta", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ImeiSedesPanel /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: /Ver IMEI por sede/ }));
    await user.click(await screen.findByRole("button", {
      name: "Abrir ficha del IMEI 000012345678901",
    }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("bg-card");
    expect(within(dialog).getByText(/integración completa de eventos multisede continúa pendiente/)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /vender|reservar|trasladar/i })).toBeNull();
  });
});
