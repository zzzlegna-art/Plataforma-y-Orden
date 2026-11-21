import { can } from "./permissions";
import { describe, expect, it } from "vitest";
import {
  MULTISITE_CAPABILITIES, MULTISITE_ROLES, canMultisite, isMultisiteRole,
} from "./nexora-role-policy";

describe("Matriz de roles del flujo operativo NEXORA", () => {
  it("solo presenta los cuatro perfiles admitidos", () => {
    expect(MULTISITE_ROLES).toEqual(["admin", "bodeguero", "encargado", "vendedor"]);
    expect(new Set(MULTISITE_CAPABILITIES.map(({ key }) => key)).size)
      .toBe(MULTISITE_CAPABILITIES.length);
    expect(isMultisiteRole("encargado")).toBe(true);
    expect(isMultisiteRole("personal_financiero")).toBe(false);
    expect(canMultisite(undefined, "inventory.view")).toBe(false);
    expect(canMultisite("inventado", "inventory.view")).toBe(false);
  });

  it("muestra únicamente capacidades del flujo operativo vigente", () => {
    const keys = MULTISITE_CAPABILITIES.map(({ key }) => key);
    expect(keys).toEqual([
      "workspace.view", "dashboard.view", "receptions.manage", "inventory.view",
      "inventory.manage", "orders.manage", "customers.manage", "warranties.manage",
      "users.manage", "audit.view",
    ]);
    const categories = new Set(MULTISITE_CAPABILITIES.map(({ category }) => category));
    expect(categories).toEqual(new Set([
      "Inicio", "Bodega", "Inventario", "Pedidos", "Garantías", "Administración",
    ]));
  });

  it("refleja las autorizaciones reales del sistema", () => {
    for (const role of MULTISITE_ROLES) {
      for (const capability of MULTISITE_CAPABILITIES) {
        expect(canMultisite(role, capability.key)).toBe(can(role, capability.key));
      }
    }
  });

  it("no concede capacidades a roles desconocidos", () => {
    expect(canMultisite("otro", "orders.manage")).toBe(false);
  });
});
