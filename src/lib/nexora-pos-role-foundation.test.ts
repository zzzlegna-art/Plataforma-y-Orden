import { describe, expect, it } from "vitest";
import { validateRolePlan } from "./nexora-role-plans";
import { parsePosPreflight, validatePosPreflight } from "./nexora-pos-preflight";
import type { StaffMember } from "./nexora-staff-sites";

const staff: StaffMember = {
  id: "user-1", name: "Auxiliar", email: "aux@example.org",
  role: "bodeguero", isActive: true,
};

describe("Nexora Multisede · preparación de roles sin activar privilegios", () => {
  it("admite planificar los tres roles operativos", () => {
    for (const role of ["bodeguero", "encargado", "vendedor"]) {
      expect(validateRolePlan(staff,role)).toBeNull();
    }
  });
  it("no permite reasignar administradores ni personal inactivo", () => {
    expect(validateRolePlan({ ...staff, role: "admin" }, "vendedor")).toMatch(/Administrador/);
    expect(validateRolePlan({ ...staff, isActive: false }, "encargado")).toMatch(/activa/);
  });
  it("rechaza roles desconocidos o elevados por el navegador", () => {
    expect(validateRolePlan(staff,"admin")).toMatch(/permitido/);
    expect(validateRolePlan(staff,"superusuario")).toMatch(/permitido/);
  });
});

describe("Nexora Multisede · preflight POS no transaccional", () => {
  it("requiere local, serial y precio positivo", () => {
    expect(validatePosPreflight("","IMEI-1",100)).toMatch(/local/);
    expect(validatePosPreflight("site-1","  ",100)).toMatch(/IMEI/);
    expect(validatePosPreflight("site-1","IMEI-1",0)).toMatch(/positivo/);
    expect(validatePosPreflight("site-1","IMEI-1",NaN)).toMatch(/positivo/);
    expect(validatePosPreflight("site-1","IMEI-1",150)).toBeNull();
  });
  it("nunca permite venta incluso cuando los chequeos comerciales pasan", () => {
    const data = parsePosPreflight({
      eligibleForFuturePos: true, saleEnabled: false,
      reason: "CHECKS_PASSED_POS_NOT_ENABLED",
      siteName: "Local Centro",serial:"000000123456789",status:"en_local",
      unitCost:500000,proposedPrice:500001,
    });
    expect(data.eligibleForFuturePos).toBe(true);
    expect(data.saleEnabled).toBe(false);
    expect(data.serial).toBe("000000123456789");
  });
  it("si un cliente manipula la respuesta para habilitar ventas, falla cerrado", () => {
    expect(() => parsePosPreflight({
      eligibleForFuturePos:true, saleEnabled:true, reason:"OK",
      serial:"123",proposedPrice:200,
    })).toThrow();
    expect(() => parsePosPreflight(null)).toThrow();
    expect(() => parsePosPreflight({saleEnabled:false})).toThrow();
  });
  it("reconoce un IMEI comprometido o precio por debajo del costo", () => {
    const base = {
      eligibleForFuturePos:false,saleEnabled:false,
      siteName:"Local 1",serial:"001",status:"en_local",unitCost:500000,proposedPrice:400000,
    };
    expect(parsePosPreflight({...base,reason:"IMEI_COMMITTED"}).eligibleForFuturePos).toBe(false);
    expect(parsePosPreflight({...base,reason:"PRICE_NOT_ABOVE_COST"}).saleEnabled).toBe(false);
  });
});
