import type { Product, Unit } from "./types";

/**
 * Valoración documentada de unidades que siguen bajo custodia del inventario.
 * Una unidad puede tener costo propio (confirmado), usar costo general de la
 * referencia (estimación) o carecer de ambos. No se interpreta 0 como costo real.
 */
export interface InventoryValuationBreakdown {
  total: number;
  confirmed: number;
  reference: number;
  confirmedUnits: number;
  referenceUnits: number;
  missingUnits: number;
  eligibleUnits: number;
}

const INVENTORY_STATES = new Set<Unit["status"]>([
  "en_bodega",
  "en_local",
  "en_reparacion",
  "defectuoso",
]);

export const calculateInventoryValuation = (
  units: readonly Unit[],
  products: readonly Product[],
  outByWarranty: ReadonlySet<string>,
  assignedToOrders: ReadonlySet<string>,
): InventoryValuationBreakdown => {
  const costs = new Map(products.map((product) => [product.id, product.cost]));
  const result: InventoryValuationBreakdown = {
    total: 0,
    confirmed: 0,
    reference: 0,
    confirmedUnits: 0,
    referenceUnits: 0,
    missingUnits: 0,
    eligibleUnits: 0,
  };

  for (const unit of units) {
    if (!INVENTORY_STATES.has(unit.status) ||
        outByWarranty.has(unit.id) || assignedToOrders.has(unit.id)) continue;

    result.eligibleUnits += 1;
    const cost = unit.cost;
    if (typeof cost === "number" && Number.isFinite(cost) && cost > 0) {
      result.confirmed += cost;
      result.confirmedUnits += 1;
      continue;
    }

    // El valor de referencia solo se utiliza si todavía no hay costo propio.
    // Si el costo de la unidad es explícitamente 0, no se sustituye en silencio.
    const referenceCost = costs.get(unit.productId);
    if (cost == null && typeof referenceCost === "number" &&
        Number.isFinite(referenceCost) && referenceCost > 0) {
      result.reference += referenceCost;
      result.referenceUnits += 1;
      continue;
    }

    result.missingUnits += 1;
  }

  result.total = result.confirmed + result.reference;
  return result;
};
