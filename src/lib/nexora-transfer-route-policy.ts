import type { NexoraSite } from "./nexora-sites";

/**
 * Plan Maestro Nexora Multisede 2.0 V4 · rutas autorizadas (página 5).
 *
 * Política pura y PREPARATORIA: la interfaz no debe habilitar todavía rutas
 * que el motor SQL de execute_transfer no admita. En backend deberán aplicarse
 * también las autorizaciones de usuario/sede, acta, custodia y estado IMEI.
 * Las devoluciones local→bodega se acotan a su bodega matriz mientras no se
 * defina el alcance sobre sedes ajenas (decisión pendiente, página 28).
 */
export type PlannedTransferRoute =
  | "principal_to_regional"
  | "regional_to_regional"
  | "warehouse_to_own_store"
  | "store_to_parent_warehouse";

export const classifyPlannedTransferRoute = (
  origin: NexoraSite | null | undefined,
  destination: NexoraSite | null | undefined,
): PlannedTransferRoute | null => {
  if (!origin?.isActive || !destination?.isActive ||
    origin.id === destination.id) return null;

  if (origin.siteType === "principal" && destination.siteType === "bodega" &&
    destination.parentSiteId === origin.id)
    return "principal_to_regional";

  if (origin.siteType === "bodega" && destination.siteType === "bodega" &&
    origin.cityId !== destination.cityId)
    return "regional_to_regional";

  if ((origin.siteType === "principal" || origin.siteType === "bodega") &&
    destination.siteType === "local" && destination.parentSiteId === origin.id &&
    origin.cityId === destination.cityId)
    return "warehouse_to_own_store";

  if (origin.siteType === "local" &&
    (destination.siteType === "principal" || destination.siteType === "bodega") &&
    origin.parentSiteId === destination.id && origin.cityId === destination.cityId)
    return "store_to_parent_warehouse";

  return null;
};

export const canPlanTransferRoute = (
  origin: NexoraSite | null | undefined,
  destination: NexoraSite | null | undefined,
): boolean => classifyPlannedTransferRoute(origin, destination) !== null;
