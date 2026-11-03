import { describe, expect, it } from "vitest";
import { parseStaffSiteAudit, summarizeStoreRoleReadiness } from "./nexora-staff-access-audit";
import type { NexoraSite } from "./nexora-sites";
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

const site=(id:string,name:string,siteType:NexoraSite["siteType"]="local",isActive=true):NexoraSite=>({
  id,name,siteType,isActive,cityId:"bq",parentSiteId:null,address:null,
});
const audit=(rows:unknown[])=>parseStaffSiteAudit({
  checkedAt:"2026-11-02T10:00:00Z",operationalRoleActivationSupported:false,staff:rows,
});
describe("preparación de roles por local sin activación",()=>{
  it("incluye todos los locales activos incluso sin personal asignado",()=>{
    const stores=summarizeStoreRoleReadiness([
      site("6a","Bodega 6A","principal"),
      site("ip","iPhone America"),
      site("cali","Local Cali"),
      site("old","Local cerrado","local",false),
    ],audit([staff]));
    expect(stores.map(s=>s.siteName)).toEqual(["iPhone America","Local Cali"]);
    expect(stores.every(s=>s.assignedStaff===0)).toBe(true);
    expect(stores[0].blockers).toContain("No hay personal operativo activo vinculado a este local.");
    expect(stores[0].blockers).toContain("Falta preparar al menos un Encargado para la caja.");
  });
  it("agrupa vendedores y encargados solamente cuando su vínculo y cuenta están activos",()=>{
    const manager={...staff,userId:"manager",plannedRole:"encargado",siteId:"ip",siteName:"iPhone America",
      siteType:"local",siteActive:true,assignmentActive:true};
    const seller={...manager,userId:"seller",plannedRole:"vendedor"};
    const inactive={...manager,userId:"disabled",staffActive:false};
    const result=summarizeStoreRoleReadiness([site("ip","iPhone America")],
      audit([manager,manager,seller,inactive]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({assignedStaff:2,plannedManagers:1,plannedSellers:1});
    expect(result[0].blockers).toEqual(["Activación de roles pendiente de controles RLS y pruebas por sede."]);
  });
  it("no acepta activaciones ni permisos comerciales ficticios",()=>{
    for(const field of ["roleEnabled","canOperateStore","canOperateCash","canSellRetail"] as const){
      expect(()=>audit([{...staff,[field]:true}])).toThrow();
    }
  });
});
