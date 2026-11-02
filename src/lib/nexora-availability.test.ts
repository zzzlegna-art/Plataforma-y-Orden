import { describe, expect, it } from "vitest";
import type { Unit } from "./types";
import type { NexoraCity, NexoraSite } from "./nexora-sites";
import { groupProductAvailability } from "./nexora-availability";

const cities: NexoraCity[] = [
  { id: "city-a", name: "Ciudad A", code: "A", department: null, is_active: true, created_at: "", created_by: null },
  { id: "city-b", name: "Ciudad B", code: "B", department: null, is_active: true, created_at: "", created_by: null },
];
const sites: NexoraSite[] = [
  { id: "bodega-a", city_id: "city-a", name: "Bodega A", code: "BA", kind: "bodega", parent_warehouse_id: null, address: null, is_active: true, created_at: "", created_by: null },
  { id: "local-a", city_id: "city-a", name: "Local A", code: "LA", kind: "local", parent_warehouse_id: "bodega-a", address: null, is_active: true, created_at: "", created_by: null },
  { id: "bodega-b", city_id: "city-b", name: "Bodega B", code: "BB", kind: "bodega", parent_warehouse_id: null, address: null, is_active: true, created_at: "", created_by: null },
];

const unit = (id: string, status: Unit["status"], siteId?: string): Unit => ({
  id, productId: "prod-1", serial: `IMEI-${id}`, condition: "nuevo", status,
  receivedAt: "2026-11-01T12:00:00.000Z", createdBy: "admin-1", siteId,
});

describe("Disponibilidad global por sede", () => {
  it("agrega la existencia por ciudad y punto físico real sin duplicar", () => {
    const result = groupProductAvailability([
      unit("1", "en_local", "local-a"),
      unit("2", "en_bodega", "bodega-a"),
      unit("3", "en_bodega", "bodega-a"),
      unit("4", "en_bodega", "bodega-b"),
    ], cities, sites);
    expect(result.availableAssigned).toBe(4);
    expect(result.rows).toEqual([
      expect.objectContaining({ cityName: "Ciudad A", siteName: "Bodega A", available: 2 }),
      expect.objectContaining({ cityName: "Ciudad A", siteName: "Local A", available: 1 }),
      expect.objectContaining({ cityName: "Ciudad B", siteName: "Bodega B", available: 1 }),
    ]);
    expect(result.awaitingPhysicalCount).toBe(0);
  });

  it("no atribuye unidades antiguas a ninguna ciudad antes del inventario físico", () => {
    const result = groupProductAvailability([
      unit("1", "en_bodega"),
      unit("2", "en_local", "id-que-no-existe"),
    ], cities, sites);
    expect(result.availableAssigned).toBe(0);
    expect(result.awaitingPhysicalCount).toBe(2);
    expect(result.rows).toEqual([]);
  });

  it("excluye vendidos, garantías de cliente y preparados; tránsito se informa aparte", () => {
    const result = groupProductAvailability([
      unit("1", "vendido", "local-a"),
      unit("2", "en_transito", "bodega-a"),
      unit("3", "en_bodega", "bodega-a"),
      unit("4", "en_local", "local-a"),
      unit("5", "en_reparacion", "bodega-a"),
    ], cities, sites, new Set(["3"]), new Set(["4"]));
    expect(result.availableAssigned).toBe(0);
    expect(result.inTransit).toBe(1);
    expect(result.preparedForDispatch).toBe(1);
    expect(result.awaitingPhysicalCount).toBe(0);
  });

  it("una sede conocida pero sin ciudad válida no recibe existencias ficticias", () => {
    const result = groupProductAvailability([
      unit("1", "en_bodega", "bodega-b"),
    ], cities.slice(0, 1), sites);
    expect(result.rows).toEqual([]);
    expect(result.awaitingPhysicalCount).toBe(1);
  });
});
