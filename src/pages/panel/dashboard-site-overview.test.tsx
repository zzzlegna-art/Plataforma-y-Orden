// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSiteReadiness } from "@/lib/nexora-site-readiness";

vi.mock("@/lib/nexora-site-readiness", () => ({
  fetchSiteReadiness: vi.fn(),
}));

import { DashboardSiteOverview } from "./dashboard-site-overview";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Dashboard · disponibilidad por sede", () => {
  it("usa conteos verificados del servidor y limita el filtro a la sede elegida", async () => {
    vi.mocked(fetchSiteReadiness).mockResolvedValue({
      approved: true,
      inTransit: 0,
      returnPending: 0,
      unmapped: 3,
      sites: [
        { siteId: "s1", siteName: "Principal", siteType: "principal", physical: 12, candidate: 8, reserved: 2, restricted: 2 },
        { siteId: "s2", siteName: "Local 2", siteType: "local", physical: 7, candidate: 4, reserved: 2, restricted: 1 },
      ],
    });
    render(<DashboardSiteOverview />);
    const region = screen.getByRole("region", { name: "Distribución del inventario por sede" });
    expect(await within(region).findByText("19")).toBeTruthy();
    expect(within(region).getByText("12")).toBeTruthy();
    expect(within(region).getByText("3 equipos aún sin sede verificada; no están atribuidos a ningún local.")).toBeTruthy();

    fireEvent.change(within(region).getByRole("combobox", { name: "Filtrar disponibilidad por sede" }), {
      target: { value: "s2" },
    });
    expect(within(region).getByText("7")).toBeTruthy();
    expect(within(region).getByText("4")).toBeTruthy();
    expect(within(region).getByText("1")).toBeTruthy();
    expect(within(region).queryByText("19")).toBeNull();
    expect(within(region).queryByText(/equipos aún sin sede verificada/)).toBeNull();
  });

  it("no atribuye equipos a sedes sin conciliación aprobada", async () => {
    vi.mocked(fetchSiteReadiness).mockResolvedValue({
      approved: false, sites: [], inTransit: 0, returnPending: 0, unmapped: 25,
    });
    render(<DashboardSiteOverview />);
    expect(await screen.findByText(/Primero se debe aprobar la conciliación/)).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Filtrar disponibilidad por sede" })).toBeNull();
  });

  it("mantiene el dashboard utilizable si no hay permiso o falla la consulta", async () => {
    vi.mocked(fetchSiteReadiness).mockRejectedValue(new Error("No autorizado"));
    render(<DashboardSiteOverview />);
    await waitFor(() => {
      expect(screen.getByText(/No fue posible consultar la disponibilidad por sede/)).toBeTruthy();
    });
  });
});
