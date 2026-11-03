import { describe, expect, it } from "vitest";
import {
  isMissingAuditTableNotDeployed, reconcileTransferMissingAudit,
} from "./nexora-transfer-missing-audit";

const lines = Array.from({ length: 20 }, (_, i) => ({
  id: `line-${i + 1}`,
  unitId: `unit-${i + 1}`,
  serial: `IMEI-${String(i + 1).padStart(4, "0")}`,
  state: i < 15 ? "received" : "return_pending",
}));
const observations = lines.slice(15).map((line) => ({
  transfer_line_id: line.id,
  unit_id: line.unitId,
  serial_snapshot: line.serial,
  observation: "No llegó",
  reported_by: "admin-real-en-el-servidor",
  reported_at: "2026-11-03T01:00:00.000Z",
}));

describe("Nexora V4 · auditoría individual de faltantes (solo lectura)", () => {
  it("coteja 20 enviados, 15 recibidos y 5 incidentes reales", () => {
    const input = structuredClone(observations);
    const result = reconcileTransferMissingAudit(input, lines, 5);
    expect(result.state).toBe("verified");
    expect(result.entries.map((item) => item.serial)).toEqual(
      lines.slice(15).map((item) => item.serial),
    );
    expect(input).toEqual(observations);
  });

  it("mantiene las cinco observaciones cuando cuatro IMEI regresan a origen", () => {
    const returned = lines.map((line, i) =>
      i >= 15 && i < 19 ? { ...line, state: "returned" } : line);
    expect(reconcileTransferMissingAudit(observations, returned, 5).state)
      .toBe("verified");
  });

  it("no certifica registros incompletos, duplicados o sin actor", () => {
    expect(reconcileTransferMissingAudit(observations.slice(0, 4), lines, 5).state)
      .toBe("incomplete");
    expect(reconcileTransferMissingAudit([...observations.slice(0, 4),
      observations[0]], lines, 5).state).toBe("incomplete");
    expect(reconcileTransferMissingAudit(observations.map((row, i) =>
      i === 0 ? { ...row, reported_by: "" } : row), lines, 5).state)
      .toBe("incomplete");
  });

  it("no certifica IMEI no incluidos, cambiados o ya recibidos", () => {
    expect(reconcileTransferMissingAudit(observations.map((row, i) =>
      i === 0 ? { ...row, serial_snapshot: "IMEI-AJENO" } : row), lines, 5).state)
      .toBe("incomplete");
    expect(reconcileTransferMissingAudit(observations, lines.map((line, i) =>
      i === 15 ? { ...line, state: "received" } : line), 5).state)
      .toBe("incomplete");
    expect(reconcileTransferMissingAudit(observations, lines, null).state)
      .toBe("incomplete");
    expect(reconcileTransferMissingAudit([], lines, null)).toEqual({
      state: "verified", entries: [],
    });
  });

  it("solo trata como no desplegada una tabla ausente", () => {
    expect(isMissingAuditTableNotDeployed({
      code: "PGRST205", message: "Could not find the table in the schema cache",
    })).toBe(true);
    expect(isMissingAuditTableNotDeployed({
      code: "42P01", message: "relation does not exist",
    })).toBe(true);
    expect(isMissingAuditTableNotDeployed({
      code: "42501", message: "permission denied",
    })).toBe(false);
    expect(isMissingAuditTableNotDeployed({
      code: "PGRST301", message: "JWT expired",
    })).toBe(false);
  });
});
