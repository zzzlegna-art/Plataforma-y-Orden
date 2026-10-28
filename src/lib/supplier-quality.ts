import type { Db, Unit } from "./types";
import type { Supplier } from "./suppliers";

export interface SupplierQualityRow {
  supplierId: string;
  name: string;
  received: number;
  affected: number;
  cases: number;
  rate: number;
}

export interface SupplierQualityReport {
  rows: SupplierQualityRow[];
  received: number;
  affected: number;
  cases: number;
  unassignedReceived: number;
  unassignedCases: number;
  unmatchedCases: number;
}

type Exposure = {
  receiptId: string;
  supplierId?: string;
  timestamp: number;
  unitId: string;
};

/** Use the actual stock-entry date, not a later status change to a warranty. */
const parseTimestamp = (value?: string): number => {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
};

/**
 * Quality by SUPPLIER, from verified stock entries and actual warranty cases.
 *
 * Denominator: different (receipt, unit) entry pairs from confirmed receptions.
 * Numerator: those same entries with >=1 warranty after that entry.
 * Cases: all warranty tickets attributed to the last stock entry before the claim.
 *
 * The provider is read from the receipt at calculation time so correcting a
 * receipt updates thousands of serials and this report without duplicating data.
 */
export const calculateSupplierQuality = (db: Db, suppliers: Supplier[]): SupplierQualityReport => {
  const known = new Map(suppliers.map((s) => [s.id, s]));
  const receipts = new Map(db.receptions
    .filter((r) => r.status === "confirmada")
    .map((r) => [r.id, r]));
  const unitsById = new Map(db.units.map((unit) => [unit.id, unit]));
  const serialUnits = new Map<string, Unit[]>();
  for (const unit of db.units) {
    const serial = unit.serial.trim().toLocaleUpperCase();
    if (!serial) continue;
    const units = serialUnits.get(serial) ?? [];
    units.push(unit);
    serialUnits.set(serial, units);
  }
  const exposuresByUnit = new Map<string, Map<string, Exposure>>();
  const record = (unitId: string, receiptId: string, at: string) => {
    const receipt = receipts.get(receiptId);
    if (!receipt || !unitsById.has(unitId)) return;
    const timestamp = parseTimestamp(at);
    if (!Number.isFinite(timestamp)) return;
    const forUnit = exposuresByUnit.get(unitId) ?? new Map<string, Exposure>();
    const previous = forUnit.get(receiptId);
    // Prefer actual recorded entry movement over fallback receivedAt.
    if (!previous || timestamp < previous.timestamp) {
      forUnit.set(receiptId, {
        unitId, receiptId, supplierId: receipt.supplierId, timestamp,
      });
    }
    exposuresByUnit.set(unitId, forUnit);
  };

  for (const movement of db.movements) {
    if (movement.type !== "entrada" || movement.referenceType !== "recepcion" ||
        !movement.referenceId || !movement.unitId) continue;
    record(movement.unitId, movement.referenceId, movement.createdAt);
  }
  for (const unit of db.units) {
    if (unit.receptionId) {
      const receipt = receipts.get(unit.receptionId);
      if (receipt && !exposuresByUnit.get(unit.id)?.has(unit.receptionId)) {
        record(unit.id, receipt.id, unit.receivedAt || receipt.confirmedAt || receipt.receivedAt);
      }
    }
  }

  const rows = new Map(suppliers.map((supplier) => [
    supplier.id,
    { supplierId: supplier.id, name: supplier.name, received: 0,
      affected: 0, cases: 0, rate: 0 },
  ] as const));
  const affected = new Set<string>();
  let unassignedReceived = 0;
  let unassignedCases = 0;
  let unmatchedCases = 0;

  for (const entries of exposuresByUnit.values()) {
    for (const exposure of entries.values()) {
      const row = exposure.supplierId ? rows.get(exposure.supplierId) : undefined;
      if (row) row.received += 1;
      else unassignedReceived += 1;
    }
  }

  for (const warranty of db.warranties) {
    let unit: Unit | undefined;
    if (warranty.unitId) {
      unit = unitsById.get(warranty.unitId);
    } else if (warranty.imeiManual?.trim()) {
      // Historical/manual claims: never attribute an ambiguous/reused serial.
      const matches = serialUnits.get(warranty.imeiManual.trim().toLocaleUpperCase()) ?? [];
      if (matches.length === 1) unit = matches[0];
    }
    const entryDate = parseTimestamp(warranty.receivedAt);
    if (!unit || !Number.isFinite(entryDate)) {
      unmatchedCases += 1;
      continue;
    }
    const candidates = [...(exposuresByUnit.get(unit.id)?.values() ?? [])]
      .filter((entry) => entry.timestamp <= entryDate)
      .sort((a, b) => b.timestamp - a.timestamp);
    const entry = candidates[0];
    if (!entry) {
      unmatchedCases += 1;
      continue;
    }
    const row = entry.supplierId && known.has(entry.supplierId)
      ? rows.get(entry.supplierId) : undefined;
    if (!row) {
      unassignedCases += 1;
      continue;
    }
    row.cases += 1;
    const pair = entry.receiptId + ":" + entry.unitId;
    if (!affected.has(pair)) {
      affected.add(pair);
      row.affected += 1;
    }
  }

  const resultRows = [...rows.values()].map((row) => ({
    ...row, rate: row.received > 0 ? (row.affected / row.received) * 100 : 0,
  })).sort((a, b) => b.rate - a.rate || b.cases - a.cases ||
    b.received - a.received || a.name.localeCompare(b.name, "es"));

  return {
    rows: resultRows,
    received: resultRows.reduce((total, row) => total + row.received, 0),
    affected: resultRows.reduce((total, row) => total + row.affected, 0),
    cases: resultRows.reduce((total, row) => total + row.cases, 0),
    unassignedReceived, unassignedCases, unmatchedCases,
  };
};
