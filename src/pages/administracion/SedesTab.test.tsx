// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/nexora-sites", () => ({
  listCities: vi.fn(async () => [{
    id: "c1", name: "Ciudad de prueba", code: "C1",
    department: "Departamento de prueba", is_active: true,
    created_at: "2026-10-31T10:00:00Z", created_by: null,
  }]),
  listSites: vi.fn(async () => [
    {
      id: "b1", city_id: "c1", code: "BG01",
      name: "Bodega Central de Prueba", kind: "principal",
      parent_warehouse_id: null, address: null, is_active: true,
      created_at: "2026-10-31T10:00:00Z", created_by: null,
    },
    {
      id: "l1", city_id: "c1", code: "LC01",
      name: "Local de Prueba", kind: "local",
      parent_warehouse_id: "b1", address: null, is_active: true,
      created_at: "2026-10-31T10:00:00Z", created_by: null,
    },
  ]),
  createCity: vi.fn(), createSite: vi.fn(),
}));

import { SedesTab } from "./SedesTab";
afterEach(cleanup);

describe("Nexora Multisede · panel de sedes", () => {
  it("muestra la ciudad real y de qué bodega recibe cada local, sin inventar stock", async () => {
    render(<SedesTab />);
    await waitFor(() => expect(screen.getByText("Ciudad de prueba")).toBeTruthy());
    expect(screen.getByText("Bodega Central de Prueba")).toBeTruthy();
    expect(screen.getByText("Local de Prueba")).toBeTruthy();
    expect(screen.getByText("Recibe de: Bodega Central de Prueba")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Red empresarial multisede" })).toBeTruthy();
    expect(screen.getByText(/ningún IMEI será trasladado o reasignado automáticamente/i)).toBeTruthy();
  });
});
