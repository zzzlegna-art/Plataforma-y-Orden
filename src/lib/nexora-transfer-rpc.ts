import type { DispatchedSerial, TransferReceiptPlan } from "./nexora-transfer-rules";

/**
 * Adaptador entre la recepción visual y el contrato SQL transaccional.
 * No realiza escrituras ni confirma recepción por su cuenta.
 */
export interface ReceiveTransferRpcDecision {
  unit_id: string;
  decision: "recibido" | "no_llego";
  observation: string;
}

export const buildTransferReceiptRpcArgs = (
  transferId: string,
  dispatched: readonly DispatchedSerial[],
  plan: TransferReceiptPlan,
): { p_transfer_id: string; p_decisions: ReceiveTransferRpcDecision[] } => {
  if (!transferId.trim() || dispatched.length === 0 || plan.dispatchedCount !== dispatched.length) {
    throw new Error("El documento de traslado no coincide con los equipos enviados.");
  }
  const received = new Set(plan.receivedUnitIds);
  const missing = new Map(plan.pendingOriginReturn.map((row) => [row.unitId, row]));
  const seen = new Set<string>();
  const results: ReceiveTransferRpcDecision[] = [];

  for (const unit of dispatched) {
    if (seen.has(unit.unitId) || !unit.unitId) {
      throw new Error("Hay IMEI duplicados en la lista despachada.");
    }
    seen.add(unit.unitId);
    const isReceived = received.has(unit.unitId);
    const missingItem = missing.get(unit.unitId);
    if (isReceived === Boolean(missingItem)) {
      throw new Error(`El IMEI ${unit.serial} no tiene una única decisión de recepción.`);
    }
    if (missingItem && (!missingItem.observation.trim() || missingItem.serial.trim() !== unit.serial.trim())) {
      throw new Error(`Falta la observación o el IMEI no coincide: ${unit.serial}`);
    }
    results.push({
      unit_id: unit.unitId,
      decision: isReceived ? "recibido" : "no_llego",
      observation: isReceived ? "" : missingItem!.observation.trim(),
    });
  }
  if (received.size !== plan.receivedCount || missing.size !== plan.missingCount ||
      received.size + missing.size !== dispatched.length) {
    throw new Error("Las cantidades de la recepción no coinciden con el traslado.");
  }
  return { p_transfer_id: transferId, p_decisions: results };
};

export interface OriginReturnReview {
  unitId: string;
  found: boolean;
  observation?: string;
}

export const buildOriginReturnRpcArgs = (
  returnId: string,
  pendingUnits: readonly DispatchedSerial[],
  review: readonly OriginReturnReview[],
) => {
  if (!returnId.trim() || pendingUnits.length === 0 || review.length !== pendingUnits.length) {
    throw new Error("La devolución no está verificada completamente.");
  }
  const entries = new Map<string, OriginReturnReview>();
  for (const row of review) {
    if (!row.unitId || entries.has(row.unitId) || (!row.found && !row.observation?.trim())) {
      throw new Error("Cada IMEI necesita una única verificación y observación si no aparece.");
    }
    entries.set(row.unitId, row);
  }
  const ids = new Set<string>();
  const p_rows = pendingUnits.map((unit) => {
    if (ids.has(unit.unitId)) throw new Error("IMEI repetido en documento de devolución.");
    ids.add(unit.unitId);
    const row = entries.get(unit.unitId);
    if (!row) throw new Error("Hay un IMEI sin revisar en la devolución.");
    return { unit_id: unit.unitId, present: row.found, observation: row.observation?.trim() ?? "" };
  });
  return { p_return_id: returnId, p_rows };
};
