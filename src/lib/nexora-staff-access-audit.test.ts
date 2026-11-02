import { describe, expect, it } from "vitest";
import { parseStaffSiteAudit } from "./nexora-staff-access-audit";
const staff={
  userId:"u1",fullName:"Empleado",email:"empleado@example.com",
  legacyRole:"bodeguero",plannedRole:"vendedor",
  staffActive:true,roleEnabled:false,
  siteId:null,siteName:null,siteType:null,
  siteActive:false,assignmentActive:false,
  canReadWarehouseLegacy:true,canOperateStore:false,
  canOperateCash:false,canSellRetail:false,reason:"SITE_NOT_ASSIGNED",
};
describe("auditoría de acceso operativo",()=>{
  it("distingue roles preparados de permisos comerciales activos",()=>{
    const result=parseStaffSiteAudit({
      checkedAt:"2026-11-02T10:00:00Z",operationalRoleActivationSupported:false,staff:[staff],
    });
    expect(result.staff[0].plannedRole).toBe("vendedor");
    expect(result.staff[0].canSellRetail).toBe(false);
  });
  it("falla cerrado ante activación falsa o respuesta parcial",()=>{
    expect(()=>parseStaffSiteAudit({checkedAt:"now",operationalRoleActivationSupported:true,staff:[]})).toThrow();
    expect(()=>parseStaffSiteAudit({checkedAt:"now",operationalRoleActivationSupported:false,staff:[{...staff,canSellRetail:null}]})).toThrow();
  });
  it("rechaza razones desconocidas",()=>{
    expect(()=>parseStaffSiteAudit({checkedAt:"now",operationalRoleActivationSupported:false,staff:[{...staff,reason:"GRANT_ALL"}]})).toThrow();
  });
});
