import { describe, expect, it } from "vitest";

import { can, canManageCatalogs, type Permission } from "./permissions";

const permisosOperativos: Permission[] = [
  "dashboard.view",
  "inventory.view",
  "inventory.manage",
  "receptions.manage",
  "orders.manage",
  "customers.manage",
  "warranties.manage",
];

describe("permisos por rol", () => {
  it("permite al administrador operar y gestionar usuarios y auditoría", () => {
    [...permisosOperativos, "users.manage", "audit.view"].forEach((permission) => {
      expect(can("admin", permission)).toBe(true);
    });
    expect(canManageCatalogs("admin")).toBe(true);
  });

  it("limita al trabajador a la operación diaria", () => {
    permisosOperativos.forEach((permission) => {
      expect(can("bodeguero", permission)).toBe(true);
    });
    expect(can("bodeguero", "users.manage")).toBe(false);
    expect(can("bodeguero", "audit.view")).toBe(false);
    expect(canManageCatalogs("bodeguero")).toBe(false);
  });

  it("a Encargado y Vendedor sólo concede el portal de su sede", () => {
    for (const role of ["encargado", "vendedor"] as const) {
      expect(can(role,"workspace.view")).toBe(true);
      for (const permission of [...permisosOperativos,"users.manage","audit.view"] as Permission[]) {
        expect(can(role,permission)).toBe(false);
      }
      expect(canManageCatalogs(role)).toBe(false);
    }
    expect(can("admin","workspace.view")).toBe(false);
    expect(can("bodeguero","workspace.view")).toBe(false);
  });

  it("deniega permisos si no hay un rol autenticado", () => {
    [...permisosOperativos, "users.manage", "audit.view"].forEach((permission) => {
      expect(can(undefined, permission)).toBe(false);
    });
    expect(canManageCatalogs(undefined)).toBe(false);
  });
});
