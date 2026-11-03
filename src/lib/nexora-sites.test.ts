import { describe, expect, it } from "vitest";
import {
  allowedParents, isAllowedTransferRoute, listAllowedTransferRoutes, validateSiteDraft,
  type NexoraCity, type NexoraSite, type SiteDraft,
} from "./nexora-sites";

const cities: NexoraCity[] = [
  { id: "ct1", name: "Ciudad 1", region: null },
  { id: "ct2", name: "Ciudad 2", region: null },
];
const sites: NexoraSite[] = [
  { id: "main", cityId: "ct1", name: "Principal", siteType: "principal", parentSiteId: null, address: null, isActive: true },
  { id: "regional", cityId: "ct2", name: "Bodega regional", siteType: "bodega", parentSiteId: "main", address: null, isActive: true },
  { id: "inactive", cityId: "ct2", name: "Bodega inactiva", siteType: "bodega", parentSiteId: "main", address: null, isActive: false },
];
const draft = (overrides: Partial<SiteDraft> = {}): SiteDraft => ({
  name: "Punto prueba", cityId: "ct2", siteType: "local", parentSiteId: "regional",
  ...overrides,
});

describe("Nexora 2.0: jerarquía segura de ciudades y sedes", () => {
  it("solo permite una sede principal en la empresa", () => {
    expect(validateSiteDraft(draft({ siteType: "principal", parentSiteId: null }), cities, sites))
      .toMatch(/ya tiene una sede principal/);
    expect(validateSiteDraft(draft({ siteType: "principal", parentSiteId: null }), cities, []))
      .toBeNull();
  });

  it("bodegas regionales tienen origen principal incluso en otra ciudad", () => {
    expect(allowedParents("bodega", "ct2", sites).map((site) => site.id)).toEqual(["main"]);
    expect(validateSiteDraft(draft({ siteType: "bodega", parentSiteId: "main" }), cities, sites))
      .toBeNull();
    expect(validateSiteDraft(draft({ siteType: "bodega", parentSiteId: "regional" }), cities, sites))
      .not.toBeNull();
  });

  it("locales solo pueden depender de una bodega de su propia ciudad", () => {
    expect(allowedParents("local", "ct2", sites).map((site) => site.id)).toEqual(["regional"]);
    expect(validateSiteDraft(draft(), cities, sites)).toBeNull();
    expect(validateSiteDraft(draft({ parentSiteId: "main" }), cities, sites)).not.toBeNull();
    expect(validateSiteDraft(draft({ parentSiteId: "inactive" }), cities, sites)).not.toBeNull();
    expect(validateSiteDraft(draft({ cityId: "ct1", parentSiteId: "main" }), cities, sites)).toBeNull();
  });

  it("rechaza ciudades inventadas, nombres vacíos y orígenes no definidos", () => {
    expect(validateSiteDraft(draft({ cityId: "otra" }), cities, sites)).toMatch(/ciudad/);
    expect(validateSiteDraft(draft({ name: " " }), cities, sites)).toMatch(/nombre/);
    expect(validateSiteDraft(draft({ parentSiteId: null }), cities, sites)).toMatch(/Selecciona/);
  });
});


describe("Nexora V4: rutas físicas de traslados", () => {
  const network: NexoraSite[] = [
    { id: "principal", cityId: "barranquilla", name: "Bodega 6A", siteType: "principal", parentSiteId: null, address: null, isActive: true },
    { id: "bodega-cali", cityId: "cali", name: "Bodega Cali", siteType: "bodega", parentSiteId: "principal", address: null, isActive: true },
    { id: "bodega-medellin", cityId: "medellin", name: "Bodega Medellín", siteType: "bodega", parentSiteId: "principal", address: null, isActive: true },
    { id: "local-baq", cityId: "barranquilla", name: "iPhone America", siteType: "local", parentSiteId: "principal", address: null, isActive: true },
    { id: "local-cali", cityId: "cali", name: "Local Cali", siteType: "local", parentSiteId: "bodega-cali", address: null, isActive: true },
    { id: "local-medellin", cityId: "medellin", name: "Local Medellín", siteType: "local", parentSiteId: "bodega-medellin", address: null, isActive: true },
    { id: "local-inactive", cityId: "cali", name: "Local inactivo", siteType: "local", parentSiteId: "bodega-cali", address: null, isActive: false },
  ];
  const byId = (id: string) => network.find((site) => site.id === id)!;

  it("permite principal a bodega regional y bodega a otra ciudad", () => {
    expect(isAllowedTransferRoute(byId("principal"), byId("bodega-cali"))).toBe(true);
    expect(isAllowedTransferRoute(byId("bodega-cali"), byId("bodega-medellin"))).toBe(true);
  });

  it("permite bodega a su local y retorno del local a su bodega de origen", () => {
    expect(isAllowedTransferRoute(byId("bodega-cali"), byId("local-cali"))).toBe(true);
    expect(isAllowedTransferRoute(byId("local-cali"), byId("bodega-cali"))).toBe(true);
    expect(isAllowedTransferRoute(byId("principal"), byId("local-baq"))).toBe(true);
    expect(isAllowedTransferRoute(byId("local-baq"), byId("principal"))).toBe(true);
  });

  it("rechaza local a otro local, bodega ajena y destinos inactivos", () => {
    expect(isAllowedTransferRoute(byId("local-cali"), byId("local-medellin"))).toBe(false);
    expect(isAllowedTransferRoute(byId("bodega-cali"), byId("local-medellin"))).toBe(false);
    expect(isAllowedTransferRoute(byId("local-cali"), byId("local-inactive"))).toBe(false);
  });

  it("enumera únicamente rutas válidas y no duplica destinos", () => {
    const routes = listAllowedTransferRoutes(network);
    expect(routes.some((route) => route.origin.id === "local-cali" && route.destination.id === "bodega-cali")).toBe(true);
    expect(routes.some((route) => route.origin.id === "local-cali" && route.destination.id === "local-medellin")).toBe(false);
    expect(routes.every((route) => route.origin.isActive && route.destination.isActive)).toBe(true);
  });
});
