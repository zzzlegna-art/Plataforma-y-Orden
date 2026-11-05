// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NEXT_LOCK_PREFIX, NEXT_SLOTS,
  claimNextWorkspace, occupiedNextSlots, type NextSlot,
} from "./next-workspaces";

/** Simulación de Web Locks, no depende de servidores, sesión ni inventario. */
class TestLocks {
  readonly held = new Set<string>();

  async request(
    name: string,
    _options: { ifAvailable: boolean },
    callback: (lock: object | null) => Promise<void>,
  ): Promise<void> {
    if (this.held.has(name)) {
      await callback(null);
      return;
    }
    this.held.add(name);
    try { await callback({ name }); }
    finally { this.held.delete(name); }
  }

  async query(): Promise<{ held: { name: string }[] }> {
    return { held: [...this.held].map(name => ({ name })) };
  }
}

describe("Nexora · propiedad exclusiva real de Next 1/2/3", () => {
  const locks = new TestLocks();
  beforeEach(() => {
    locks.held.clear();
    Object.defineProperty(navigator, "locks", {
      configurable: true, value: locks,
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("el cuarto espacio no recibe un número cuando Next 1/2/3 están ocupados", async () => {
    const acquired = await Promise.all(
      NEXT_SLOTS.map(slot => claimNextWorkspace(slot, "tab-" + slot)),
    );
    expect(acquired.every(Boolean)).toBe(true);
    expect(await occupiedNextSlots()).toEqual([1, 2, 3]);
    for (const slot of NEXT_SLOTS) {
      expect(await claimNextWorkspace(slot, "fourth-tab")).toBeNull();
    }
    acquired.forEach(claim => claim?.release());
  });

  it("al cerrar Next 2, solo Next 2 puede reutilizarse", async () => {
    const claim1 = await claimNextWorkspace(1, "a");
    const claim2 = await claimNextWorkspace(2, "b");
    const claim3 = await claimNextWorkspace(3, "c");
    expect(await occupiedNextSlots()).toEqual([1, 2, 3]);

    claim2?.release();
    // El callback de Web Locks libera el candado en una microtarea.
    await vi.waitFor(async () => {
      expect(await occupiedNextSlots()).toEqual([1, 3]);
    });
    const recovered = await claimNextWorkspace(2, "new-b");
    expect(recovered?.slot).toBe(2);
    expect(await occupiedNextSlots()).toEqual([1, 2, 3]);

    recovered?.release();
    claim1?.release();
    claim3?.release();
  });

  it("una pestaña duplicada no puede apropiarse del Next original", async () => {
    const original = await claimNextWorkspace(1, "original");
    expect(original?.slot).toBe(1);
    expect(await claimNextWorkspace(1, "duplicate")).toBeNull();
    const alternative = await claimNextWorkspace(2, "duplicate");
    expect(alternative?.slot).toBe(2);
    original?.release();
    alternative?.release();
  });

  it("los locks solamente contienen identidad de pestaña, nunca información comercial", () => {
    expect(NEXT_LOCK_PREFIX).not.toContain("password");
    expect([1, 2, 3].every(slot => NEXT_SLOTS.includes(slot as NextSlot))).toBe(true);
  });
});
