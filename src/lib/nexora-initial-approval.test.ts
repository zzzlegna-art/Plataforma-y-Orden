import { describe, expect, it } from "vitest";
import {
  canApproveInitialInventory, getInitialApprovalBlocker,
  parseInitialInventoryProgress, type InitialInventoryProgress,
} from "./nexora-initial-approval";

const base: InitialInventoryProgress = {
  total: 2758, verified: 2758, pending: 0, stale: 0, approved: 0,
  approvedAt: null, isApproved: false, ready: true,
};

describe("Nexora 2.0 · aprobación definitiva del inventario inicial", () => {
  it("solo habilita confirmación completa con token escrito y aceptación", () => {
    expect(canApproveInitialInventory(base, true, "APROBAR")).toBe(true);
    expect(canApproveInitialInventory(base, false, "APROBAR")).toBe(false);
    expect(canApproveInitialInventory(base, true, "aprobar")).toBe(false);
    expect(canApproveInitialInventory(base, true, "APROBAR EXTRA")).toBe(false);
  });
  it("bloquea firmas parciales, incluso si la UI estuviera marcada ready", () => {
    const missing = { ...base, verified: 2757, pending: 1, ready: true };
    expect(getInitialApprovalBlocker(missing)).toMatch(/pendientes/);
    expect(canApproveInitialInventory(missing, true, "APROBAR")).toBe(false);
  });
  it("bloquea escaneos desactualizados, vacíos y actas duplicadas", () => {
    expect(canApproveInitialInventory({ ...base, stale: 1 }, true, "APROBAR")).toBe(false);
    expect(canApproveInitialInventory({ ...base, total: 0, verified: 0 }, true, "APROBAR")).toBe(false);
    expect(canApproveInitialInventory({ ...base, isApproved: true, approved: 2758 }, true, "APROBAR"))
      .toBe(false);
  });
  it("honra el estado de bloqueo enviado por el servidor", () => {
    expect(canApproveInitialInventory({ ...base, ready: false }, true, "APROBAR")).toBe(false);
  });
  it("interpreta conteos y sello sin inventar valores", () => {
    expect(parseInitialInventoryProgress({
      total: 2758, verified: 0, pending: 2758, stale: 0,
      approved: 0, approvedAt: null, isApproved: false, ready: false,
    })).toEqual({ ...base, verified: 0, pending: 2758, ready: false });
  });
  it("rechaza respuestas defectuosas y números no íntegros", () => {
    expect(() => parseInitialInventoryProgress(null)).toThrow();
    expect(() => parseInitialInventoryProgress({ ...base, total: -1 })).toThrow();
    expect(() => parseInitialInventoryProgress({ ...base, verified: 1.25 })).toThrow();
    expect(() => parseInitialInventoryProgress({ ...base, ready: "yes" })).toThrow();
  });
});
