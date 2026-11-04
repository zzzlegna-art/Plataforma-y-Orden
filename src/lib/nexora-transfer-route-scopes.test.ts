import { describe, expect, it } from "vitest";
import type { NexoraSite } from "./nexora-sites";
import { isTransferRouteAllowed, transferDestinations, transferOrigins } from "./nexora-transfer-route-scopes";

const site = (id: string, siteType: NexoraSite["siteType"], parentSiteId: string | null = null): NexoraSite => ({
  id, siteType, parentSiteId, isActive: true,
  cityId: "cali", name: id, address: null,
});
const main = site("principal", "principal");
const regional = site("regional", "bodega", "principal");
const anotherWarehouse = site("regional2", "bodega", "principal");
const local = site("local", "local", "regional");
const directLocal = site("direct-local", "local", "principal");
const otherLocal = site("other-local", "local", "regional");
const network = [main, regional, anotherWarehouse, local, directLocal, otherLocal];

describe("traslados: permisos de origen por local asignado y rutas vigentes", () => {
  it("un Encargado o Vendedor puede iniciar traslado desde SU local, no desde los demás", () => {
    expect(transferOrigins(network, ["local"]).map((s) => s.id)).toEqual(["local"]);
    expect(transferDestinations(local, network).map((s) => s.id)).toEqual(["regional"]);
  });
  it("el Bodeguero sólo ofrece las bodegas asignadas como origen", () => {
    expect(transferOrigins(network, ["regional"]).map((s) => s.id)).toEqual(["regional"]);
    expect(transferDestinations(regional, network).map((s) => s.id))
      .toEqual(["regional2", "local", "other-local"]);
  });
  it("Administrador puede usar toda la red activa, incluidos locales", () => {
    expect(transferOrigins(network, network.map((s) => s.id)).length).toBe(network.length);
  });
  it("no confunde autorización de la sede con la ruta ni permite local→local", () => {
    expect(isTransferRouteAllowed(local, otherLocal)).toBe(false);
    expect(isTransferRouteAllowed(main, directLocal)).toBe(true);
    expect(isTransferRouteAllowed(local, regional)).toBe(true);
    expect(isTransferRouteAllowed(directLocal, main)).toBe(true);
    expect(isTransferRouteAllowed(local, main)).toBe(false);
  });
  it("ni una sede no asignada ni una sede inactiva se puede despachar", () => {
    expect(transferOrigins(network, [])).toEqual([]);
    expect(transferOrigins(network, ["no-asignada"])).toEqual([]);
    const inactive={...local, isActive:false};
    expect(transferOrigins([main,regional,inactive],["local"])).toEqual([]);
  });
});
