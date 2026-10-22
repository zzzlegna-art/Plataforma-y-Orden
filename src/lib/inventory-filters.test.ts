import { describe, expect, it } from "vitest";

import {
  clearInventoryFilters,
  getInventoryFilters,
  updateInventoryFilter,
} from "./inventory-filters";

describe("filtros del inventario en la URL", () => {
  it("recupera la búsqueda y todos los filtros guardados", () => {
    const params = new URLSearchParams(
      "q=iphone%2015&tipo=celular&marca=brand-1&bajo=1&inactivos=1&condicion=seminuevo",
    );

    expect(getInventoryFilters(params)).toEqual({
      search: "iphone 15",
      tipo: "celular",
      brandId: "brand-1",
      lowOnly: true,
      includeInactive: true,
      condicion: "seminuevo",
    });
  });

  it("ignora valores inválidos para la condición y los indicadores booleanos", () => {
    const filters = getInventoryFilters(
      new URLSearchParams("condicion=desconocida&bajo=true&inactivos=0"),
    );

    expect(filters.condicion).toBe("");
    expect(filters.lowOnly).toBe(false);
    expect(filters.includeInactive).toBe(false);
  });

  it("actualiza un filtro sin borrar los demás y elimina valores vacíos", () => {
    const initial = new URLSearchParams("q=iphone&marca=brand-1&bajo=1");
    const updated = updateInventoryFilter(initial, "q", "  ");

    expect(updated.get("q")).toBeNull();
    expect(updated.get("marca")).toBe("brand-1");
    expect(updated.get("bajo")).toBe("1");
  });

  it("limpia solo los filtros del inventario y conserva parámetros ajenos", () => {
    const cleared = clearInventoryFilters(
      new URLSearchParams("tab=historial&q=iphone&marca=brand-1&condicion=nuevo"),
    );

    expect(cleared.toString()).toBe("tab=historial");
  });
});
