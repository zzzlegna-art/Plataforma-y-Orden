import { describe, expect, it } from "vitest";
import { NEXT_SLOTS, preferredNextSlots, slotFromString, withNextSuffix } from "./next-workspaces";

describe("Nexora · Next 1/2/3 independientes", () => {
  it("solo admite 3 espacios de trabajo", () => {
    expect(NEXT_SLOTS).toEqual([1, 2, 3]);
    expect(slotFromString("4")).toBe(null);
    expect(slotFromString("next-2")).toBe(null);
    expect(slotFromString("2")).toBe(2);
  });

  it("reutiliza el menor slot libre: al cerrar Next 2 se recupera el 2", () => {
    const occupied = [1, 3];
    expect(preferredNextSlots(null, null).find(slot => !occupied.includes(slot))).toBe(2);
  });

  it("conserva Next 3 al recargar y cambia de número si se duplicó una pestaña", () => {
    expect(preferredNextSlots("3", "1")).toEqual([3, 1, 2]);
    expect(preferredNextSlots("2", "2").find(slot => ![2].includes(slot))).toBe(1);
  });

  it("mantiene la ruta y filtros al añadir el indicador final", () => {
    expect(withNextSuffix("/inventario?condicion=nuevo", 2))
      .toBe("/inventario?condicion=nuevo&next=2");
    expect(withNextSuffix("/pedidos/abc?next=1#detalle", 3))
      .toBe("/pedidos/abc?next=3#detalle");
    expect(withNextSuffix("/recepcion", 1)).toBe("/recepcion?next=1");
  });
});
