/**
 * Inventario global por ciudad y punto físico.
 * El registro de cada IMEI es la fuente de verdad: sin siteId conciliado
 * nunca se atribuye stock a una ubicación por inferencia.
 */
import type { Unit } from "@/lib/types";
import type { NexoraCity, NexoraSite, SiteKind } from "@/lib/nexora-sites";

export interface SiteAvailabilityRow {
  siteId: string;
  siteName: string;
  cityId: string;
  cityName: string;
  kind: SiteKind;
  available: number;
}

export interface SiteAvailabilitySummary {
  availableAssigned: number;
  awaitingPhysicalCount: number;
  inTransit: number;
  preparedForDispatch: number;
  rows: SiteAvailabilityRow[];
}

export const groupProductAvailability = (
  units: readonly Unit[],
  cities: readonly NexoraCity[],
  sites: readonly NexoraSite[],
  preparedUnitIds: ReadonlySet<string> = new Set(),
  excludedWarrantyIds: ReadonlySet<string> = new Set(),
): SiteAvailabilitySummary => {
  const byCity = new Map(cities.map((city) => [city.id, city]));
  const bySite = new Map(sites.map((site) => [site.id, site]));
  const counts = new Map<string, number>();
  let awaitingPhysicalCount = 0;
  let inTransit = 0;
  let preparedForDispatch = 0;

  for (const unit of units) {
    if (unit.status === "en_transito") {
      inTransit++;
      continue;
    }
    if (unit.status !== "en_bodega" && unit.status !== "en_local") continue;
    if (excludedWarrantyIds.has(unit.id)) continue;
    if (preparedUnitIds.has(unit.id)) {
      preparedForDispatch++;
      continue;
    }

    const site = unit.siteId ? bySite.get(unit.siteId) : undefined;
    const city = site ? byCity.get(site.city_id) : undefined;
    if (!site || !city) {
      awaitingPhysicalCount++;
      continue;
    }
    counts.set(site.id, (counts.get(site.id) ?? 0) + 1);
  }

  const rows: SiteAvailabilityRow[] = [...counts.entries()]
    .map(([siteId, available]) => {
      const site = bySite.get(siteId)!;
      const city = byCity.get(site.city_id)!;
      return {
        siteId,
        siteName: site.name,
        cityId: city.id,
        cityName: city.name,
        kind: site.kind as SiteKind,
        available,
      };
    })
    .sort((a, b) =>
      a.cityName.localeCompare(b.cityName, "es") ||
      a.siteName.localeCompare(b.siteName, "es"),
    );

  return {
    availableAssigned: rows.reduce((sum, row) => sum + row.available, 0),
    awaitingPhysicalCount,
    inTransit,
    preparedForDispatch,
    rows,
  };
};
