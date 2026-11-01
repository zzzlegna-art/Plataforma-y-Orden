import { describe, expect, it } from "vitest";
import {
  MULTISITE_CAPABILITIES, MULTISITE_ROLES, canMultisite, isMultisiteRole,
  type MultisiteCapability, type MultisiteRole,
} from "./nexora-role-policy";

describe("Nexora Multisede 2.0 · cuatro roles aprobados", () => {
  it("solo tiene Administrador, Bodeguero, Encargado y Vendedor", () => {
    expect(MULTISITE_ROLES).toEqual(["admin", "bodeguero", "encargado", "vendedor"]);
    expect(new Set(MULTISITE_CAPABILITIES.map(({ key }) => key)).size)
      .toBe(MULTISITE_CAPABILITIES.length);
    expect(isMultisiteRole("encargado")).toBe(true);
    expect(isMultisiteRole("personal_financiero")).toBe(false);
    expect(canMultisite(undefined, "inventory.view")).toBe(false);
    expect(canMultisite("inventado", "inventory.view")).toBe(false);
  });

  const todos = MULTISITE_ROLES;
  it.each(["inventory.view", "inventory.imei.cost.view", "transfers.manage", "transfers.cancel", "transfers.edit.before_dispatch"] as MultisiteCapability[])(
    "los cuatro roles pueden: %s",
    (permission) => {
      todos.forEach((role) => expect(canMultisite(role, permission)).toBe(true));
    },
  );

  const exclusivo = (permission: MultisiteCapability, expected: readonly MultisiteRole[]) => {
    for (const role of MULTISITE_ROLES) {
      expect(canMultisite(role, permission), `${permission} / ${role}`).toBe(expected.includes(role));
    }
  };

  it("garantías y corrección de IMEI solo para Administrador o Bodeguero", () => {
    exclusivo("warranties.manage", ["admin", "bodeguero"]);
    exclusivo("inventory.imei.correct", ["admin", "bodeguero"]);
    exclusivo("reception.substitution.approve", ["admin", "bodeguero"]);
    exclusivo("reception.supplier.receive", ["admin", "bodeguero"]);
  });

  it("respetar apertura y cierre de caja, reapertura y gastos de Encargado", () => {
    exclusivo("cash.open", ["admin", "encargado"]);
    exclusivo("cash.close", ["encargado"]);
    exclusivo("cash.reopen", ["admin"]);
    exclusivo("cash.expense.record", ["encargado"]);
  });

  it("reportes únicamente Administrador o Encargado", () => {
    exclusivo("reports.view", ["admin", "encargado"]);
  });

  it("costos visibles a todos, pero ajustes y autorización solo Administrador", () => {
    exclusivo("inventory.references.manage", ["admin"]);
    exclusivo("inventory.adjust.authorize", ["admin"]);
    exclusivo("reception.invoice.edit", ["admin"]);
    exclusivo("reception.cost.approve", ["admin"]);
    exclusivo("reception.extra.approve", ["admin"]);
    exclusivo("reception.shortage.close", ["admin"]);
    exclusivo("reception.supplier.credit.manage", ["admin"]);
    exclusivo("finance.transfer.manage", ["admin"]);
    exclusivo("sales.cancel", ["admin"]);
    exclusivo("sales.refund.authorize", ["admin"]);
  });
});
