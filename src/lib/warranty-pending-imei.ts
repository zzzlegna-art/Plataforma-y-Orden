import { esCodigoInterno } from "./imei";
import type { Warranty } from "./types";

/** Marcador persistente en notes: sin migraciones ni nuevos campos en Supabase. */
export const MARCA_IMEI_PENDIENTE = "NEXORA:IMEI_PENDIENTE_RECEPCION";

/** Solo se marca la recepción por IMEI de un equipo apagado, no las previas antiguas. */
export const garantiaSinImeiPendiente = (
  warranty: Pick<Warranty, "notes" | "imeiManual" | "unitId">,
): boolean =>
  warranty.notes === MARCA_IMEI_PENDIENTE &&
  !warranty.unitId &&
  esCodigoInterno(warranty.imeiManual ?? "");
