/**
 * NEXORA Multisede: reglas de ruta y conciliación de IMEI en recepción.
 *
 * Política de dominio sin escritura en base de datos. Una recepción parcial
 * genera las instrucciones de devolución PENDIENTE al origen; jamás devuelve
 * inventario disponible automáticamente al origen sin verificación física.
 */
export type SiteType = "principal" | "bodega" | "local";

export interface TransferSite {
  id: string;
  city_id: string;
  kind: string;
  parent_warehouse_id: string | null;
  is_active: boolean;
}

export type TransferRouteResult =
  | { allowed: true }
  | { allowed: false; reason: string };

const isWarehouse = (kind: string): boolean =>
  kind === "principal" || kind === "bodega";

export const validateTransferRoute = (
  origin: TransferSite,
  destination: TransferSite,
): TransferRouteResult => {
  if (!origin.is_active || !destination.is_active) {
    return { allowed: false, reason: "El origen y el destino deben estar activos." };
  }
  if (origin.id === destination.id) {
    return { allowed: false, reason: "Un traslado necesita dos puntos físicos distintos." };
  }
  if (origin.kind === "local") {
    if (!isWarehouse(destination.kind)) {
      return { allowed: false, reason: "Los traslados directos de local a local están prohibidos." };
    }
    return { allowed: true };
  }
  if (isWarehouse(origin.kind) && isWarehouse(destination.kind)) {
    // Bodega → bodega, incluso entre regiones, sin aprobación previa adicional.
    return { allowed: true };
  }
  if (isWarehouse(origin.kind) && destination.kind === "local") {
    if (origin.city_id !== destination.city_id) {
      return { allowed: false, reason: "El local recibe desde su bodega de la misma ciudad." };
    }
    if (destination.parent_warehouse_id !== origin.id) {
      return { allowed: false, reason: "El local solo recibe de la bodega que lo abastece." };
    }
    return { allowed: true };
  }
  return { allowed: false, reason: "Esta ruta de traslado no está permitida." };
};

export interface DispatchedSerial {
  unitId: string;
  serial: string;
}
export interface MissingSerial {
  serial: string;
  observation: string;
}
export interface PendingOriginReturn {
  unitId: string;
  serial: string;
  observation: string;
}

/** Resultado previo a guardar atómicamente el acta y la devolución asociada. */
export interface TransferReceiptPlan {
  receivedUnitIds: string[];
  pendingOriginReturn: PendingOriginReturn[];
  dispatchedCount: number;
  receivedCount: number;
  missingCount: number;
}

export class TransferReceiptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransferReceiptValidationError";
  }
}

const normalizeSerial = (serial: string): string => serial.trim().toUpperCase();

/**
 * Toda unidad despachada tiene que marcarse como RECIBIDA o NO LLEGÓ.
 * NO se asume que lo no escaneado esté perdido automáticamente.
 */
export const planTransferReceipt = (
  dispatched: readonly DispatchedSerial[],
  receivedSerials: readonly string[],
  markedMissing: readonly MissingSerial[],
): TransferReceiptPlan => {
  if (dispatched.length === 0) {
    throw new TransferReceiptValidationError("No hay equipos despachados en este traslado.");
  }
  const expected = new Map<string, DispatchedSerial>();
  for (const unit of dispatched) {
    const key = normalizeSerial(unit.serial);
    if (!key || !unit.unitId || expected.has(key)) {
      throw new TransferReceiptValidationError("El traslado contiene un IMEI inválido o duplicado.");
    }
    expected.set(key, unit);
  }

  const received = new Set<string>();
  for (const serial of receivedSerials) {
    const key = normalizeSerial(serial);
    if (!expected.has(key)) {
      throw new TransferReceiptValidationError(`El IMEI ${serial} no pertenece al traslado.`);
    }
    if (received.has(key)) {
      throw new TransferReceiptValidationError(`El IMEI ${serial} se marcó recibido dos veces.`);
    }
    received.add(key);
  }

  const missing = new Map<string, string>();
  for (const { serial, observation } of markedMissing) {
    const key = normalizeSerial(serial);
    if (!expected.has(key)) {
      throw new TransferReceiptValidationError(`El IMEI ${serial} no pertenece al traslado.`);
    }
    if (received.has(key) || missing.has(key)) {
      throw new TransferReceiptValidationError(`El IMEI ${serial} tiene marcas incompatibles o duplicadas.`);
    }
    if (!observation.trim()) {
      throw new TransferReceiptValidationError(`Escribe una observación para el IMEI ${serial} que no llegó.`);
    }
    missing.set(key, observation.trim());
  }

  if (received.size + missing.size !== expected.size) {
    throw new TransferReceiptValidationError(
      "Marca cada IMEI como recibido o no recibido antes de confirmar el traslado.",
    );
  }

  const receivedUnitIds: string[] = [];
  const pendingOriginReturn: PendingOriginReturn[] = [];
  for (const [key, unit] of expected) {
    if (received.has(key)) {
      receivedUnitIds.push(unit.unitId);
    } else {
      pendingOriginReturn.push({
        unitId: unit.unitId,
        serial: unit.serial,
        observation: missing.get(key)!,
      });
    }
  }

  return {
    receivedUnitIds,
    pendingOriginReturn,
    dispatchedCount: expected.size,
    receivedCount: receivedUnitIds.length,
    missingCount: pendingOriginReturn.length,
  };
};
