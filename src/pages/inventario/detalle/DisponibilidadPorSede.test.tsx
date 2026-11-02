// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Unit } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  cities: vi.fn(),
  sites: vi.fn(),
}));
vi.mock("@/lib/nexora-sites", () => ({
  listCities: mocks.cities,
  listSites: mocks.sites,
}));

import { DisponibilidadPorSede } from "./DisponibilidadPorSede";
const unit = (id: string, status: Unit["status"], siteId?: string): Unit => ({
  id, productId: "product-1", serial: `SERIAL-${id}`, condition: "nuevo",
  status, createdBy: "admin-1", receivedAt: "2026-11-01T12:00:00Z", siteId,
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Nexora 2.0 · distribución por ciudad en detalle de producto", () => {
  it("muestra únicamente unidades ubicadas y alerta por faltantes de conciliación", async () => {
    mocks.cities.mockResolvedValue([
      { id: "city-1", name: "Ciudad de prueba", code: "C1", is_active: true },
    ]);
    mocks.sites.mockResolvedValue([
      { id: "s1", city_id: "city-1", name: "Local Centro de Prueba", kind: "local" },
    ]);
    render(<DisponibilidadPorSede
      units={[
        unit("1", "en_local", "s1"),
        unit("2", "en_bodega"),
        unit("3", "en_transito"),
      ]}
      preparedUnitIds={new Set()}
      excludedWarrantyIds={new Set()}
    />);
    await waitFor(() => expect(screen.getByText("Ciudad de prueba")).toBeTruthy());
    expect(screen.getByText("Local Centro de Prueba")).toBeTruthy();
    expect(screen.getByText("1 disponibles")).toBeTruthy();
    expect(screen.getByText("Unidades sin sede conciliada")).toBeTruthy();
    expect(screen.getByText("Unidades en tránsito (no disponibles)")).toBeTruthy();
  });

  it("no rompe el detalle de inventario si la migración multisede aún no existe", async () => {
    mocks.cities.mockRejectedValue(new Error("relation does not exist"));
    mocks.sites.mockRejectedValue(new Error("relation does not exist"));
    render(<DisponibilidadPorSede
      units={[unit("1", "en_bodega")]}
      preparedUnitIds={new Set()}
      excludedWarrantyIds={new Set()}
    />);
    await waitFor(() => expect(screen.getByRole("status").textContent)
      .toMatch(/red de sedes aún no está habilitada/i));
    expect(screen.getByText(/el inventario actual sigue disponible/i)).toBeTruthy();
  });
});
