import type { NexoraSite } from "./nexora-sites";

/**
 * Proyección visual de las rutas vigentes en nexora_internal.execute_transfer.
 * No concede permisos: el servidor revalida ruta, sede y custodia IMEI.
 */
export const isTransferRouteAllowed = (origin: NexoraSite, destination: NexoraSite): boolean => {
  if (!origin.isActive || !destination.isActive || origin.id === destination.id) return false;
  if (origin.siteType === "principal") {
    return destination.parentSiteId === origin.id &&
      (destination.siteType === "bodega" || destination.siteType === "local");
  }
  if (origin.siteType === "bodega") {
    return destination.siteType === "bodega" ||
      (destination.siteType === "local" && destination.parentSiteId === origin.id);
  }
  return origin.siteType === "local" &&
    (destination.siteType === "principal" || destination.siteType === "bodega") &&
    origin.parentSiteId === destination.id;
};

export const transferDestinations = (
  origin: NexoraSite | undefined,
  sites: readonly NexoraSite[],
): NexoraSite[] => origin ? sites.filter((site) => isTransferRouteAllowed(origin, site)) : [];

export const transferOrigins = (
  sites: readonly NexoraSite[],
  assignedSites: readonly string[],
): NexoraSite[] => {
  const assigned = new Set(assignedSites);
  return sites.filter((site) =>
    site.isActive && assigned.has(site.id) &&
    transferDestinations(site, sites).length > 0
  );
};
