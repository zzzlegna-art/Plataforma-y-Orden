import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTransferAssignedSites } from "./nexora-transfer-site-access";
import { transferOrigins, transferDestinations } from "./nexora-transfer-route-scopes";
import type { NexoraSite } from "./nexora-sites";

const mocks = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  from: vi.fn(),
}));
vi.mock("./nexora-worker", () => ({
  getWorkerSession: mocks.getWorkerSession,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

const principal: NexoraSite = {
  id: "principal", name: "Bodega 6A", cityId: "cali",
  siteType: "principal", parentSiteId: null, address: null, isActive: true,
};
const bodega: NexoraSite = {
  id: "bodega", name: "Bodega Cali", cityId: "cali",
  siteType: "bodega", parentSiteId: "principal", address: null, isActive: true,
};
const localA: NexoraSite = {
  id: "local-a", name: "Local Cali", cityId: "cali",
  siteType: "local", parentSiteId: "bodega", address: null, isActive: true,
};
const localB: NexoraSite = {
  id: "local-b", name: "iPhone America", cityId: "cali",
  siteType: "local", parentSiteId: "principal", address: null, isActive: true,
};
const inactive: NexoraSite = {
  id: "cerrada", name: "Sede cerrada", cityId: "cali",
  siteType: "local", parentSiteId: "principal", address: null, isActive: false,
};
const network = [principal, bodega, localA, localB, inactive];

const mockBodegueroAssignments = (ids: string[]) => {
  const result = Promise.resolve({
    data: ids.map((site_id) => ({ site_id })),
    error: null,
  });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    then: result.then.bind(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  return query;
};

describe("Traslados multisede · enviar desde el origen y recibir en el destino asignados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkerSession.mockResolvedValue(null);
  });

  it("Administrador puede operar en todas las sedes activas, no en sedes cerradas", async () => {
    expect(await getTransferAssignedSites("admin", "admin-1", network))
      .toEqual(["principal", "bodega", "local-a", "local-b"]);
    expect(mocks.getWorkerSession).not.toHaveBeenCalled();
  });

  it("Bodeguero solo puede operar desde/hacia sus sedes activas asignadas", async () => {
    const query = mockBodegueroAssignments(["principal", "cerrada"]);
    const scope = await getTransferAssignedSites("bodeguero", "bod-1", network);
    expect(mocks.from).toHaveBeenCalledWith("nexora_staff_sites");
    expect(query.eq).toHaveBeenCalledWith("user_id", "bod-1");
    expect(query.eq).toHaveBeenCalledWith("is_active", true);
    expect(scope).toEqual(["principal"]);
    expect(transferOrigins(network, scope).map((s) => s.id)).toEqual(["principal"]);
    expect(transferDestinations(principal, network).map((s) => s.id))
      .toContain("local-b");
  });

  it.each(["encargado", "vendedor"] as const)(
    "%s puede despachar equipos de su local y recibir en ese mismo local, no en otro",
    async (role) => {
      mocks.getWorkerSession.mockResolvedValue({
        role, siteId: "local-a", siteName: "Local Cali",
      });
      const allowed = await getTransferAssignedSites(role, "trabajador-1", network);
      expect(allowed).toEqual(["local-a"]);
      expect(transferOrigins(network, allowed).map((s) => s.id)).toEqual(["local-a"]);
      expect(transferDestinations(localA, network).map((s) => s.id)).toContain("bodega");
      expect(allowed.includes("bodega")).toBe(false);
      expect(allowed.includes("local-b")).toBe(false);
      // La sede de recepción se comprueba contra destino, NO contra origen.
      expect(allowed.includes("local-a")).toBe(true);
    },
  );

  it("no concede acceso si no hay sesión de trabajador o el rol/sede no coincide", async () => {
    expect(await getTransferAssignedSites("vendedor", "trabajador-1", network)).toEqual([]);
    mocks.getWorkerSession.mockResolvedValue({
      role: "encargado", siteId: "local-a", siteName: "Local Cali",
    });
    expect(await getTransferAssignedSites("vendedor", "trabajador-1", network)).toEqual([]);
    mocks.getWorkerSession.mockResolvedValue({
      role: "vendedor", siteId: "principal", siteName: "Bodega 6A",
    });
    expect(await getTransferAssignedSites("vendedor", "trabajador-1", network)).toEqual([]);
    mocks.getWorkerSession.mockResolvedValue({
      role: "vendedor", siteId: "cerrada", siteName: "Sede cerrada",
    });
    expect(await getTransferAssignedSites("vendedor", "trabajador-1", network)).toEqual([]);
  });

  it("no autoriza acciones de ningún tipo sin identidad o rol", async () => {
    expect(await getTransferAssignedSites("admin", undefined, network)).toEqual([]);
    expect(await getTransferAssignedSites(undefined, "u-1", network)).toEqual([]);
  });
});
