import { describe, expect, it } from "vitest";
import {
  allowedParents, validateSiteDraft, type NexoraCity, type NexoraSite, type SiteDraft,
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
