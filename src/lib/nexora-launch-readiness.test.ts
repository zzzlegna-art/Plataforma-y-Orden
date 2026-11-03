import { describe, expect, it } from "vitest";
import { parseLaunchReadiness, PREPARATION_STEPS } from "./nexora-launch-readiness";

const status=()=>({
  checkedAt:"2026-11-02T12:00:00Z",roleActivationAvailable:false,
  salesAvailable:false,cities:0,principals:0,warehouses:0,stores:0,
  activeAssignments:0,plannedRoles:0,plannedManagers:0,enabledManagers:0,
  initialApproved:false,legacyEligibleUnits:2758,mappedUnits:0,
  unmappedUnits:2758,openCashSessions:0,retailSales:0,
  storeDetails:[],
  steps:PREPARATION_STEPS.map(s=>({
    key:s.key,ready:false,current:0,
    ...(s.key==="reconciliation"?{total:2758}:{}),
  })),
});

describe("Nexora · lanzamiento multisede sin privilegios heredados",()=>{
  it("mantiene caja, venta y roles inactivos mientras hay 2758 IMEI pendientes",()=>{
    const r=parseLaunchReadiness(status());
    expect(r.unmappedUnits).toBe(2758);
    expect(r.initialApproved).toBe(false);
    expect(r.roleActivationAvailable).toBe(false);
    expect(r.salesAvailable).toBe(false);
    expect(r.steps).toHaveLength(8);
    expect(r.steps.every(s=>!s.ready)).toBe(true);
  });
  it("permite identificar la declaración administrativa de 6A sin fingir un conteo",()=>{
    const step=PREPARATION_STEPS.find(s=>s.key==="reconciliation");
    expect(step?.title).toMatch(/Certificar/);
    expect(step?.detail).toMatch(/Bodega 6A/);
    expect(step?.detail).toMatch(/sin escaneos ficticios/);
    const state=parseLaunchReadiness(status());
    expect(state.initialApproved).toBe(false);
    expect(state.steps.find(s=>s.key==="reconciliation")?.ready).toBe(false);
  });
  it("presenta locales con encargados planificados sin confundirlo con activación",()=>{
    const input=status();
    return expect(parseLaunchReadiness({
      ...input,stores:1,
      storeDetails:[{
        siteId:"site-123",name:"Local Centro",assignedStaff:2,
        managerPlanned:true,managerEnabled:false,
      }],
    }).storeDetails[0]).toEqual({
      siteId:"site-123",name:"Local Centro",assignedStaff:2,
      managerPlanned:true,managerEnabled:false,
    });
  });
  it("rechaza un supuesto lanzamiento con ventas habilitadas",()=>{
    expect(()=>parseLaunchReadiness({...status(),salesAvailable:true})).toThrow();
    expect(()=>parseLaunchReadiness({...status(),roleActivationAvailable:true})).toThrow();
  });
  it("rechaza pasos omitidos o duplicados que ocultarían un bloqueo",()=>{
    const input=status();
    expect(()=>parseLaunchReadiness({...input,steps:input.steps.slice(1)})).toThrow();
    expect(()=>parseLaunchReadiness({...input,steps:[...input.steps.slice(1),input.steps[1]]})).toThrow();
  });
  it("no convierte conteos corruptos o negativos en progreso ficticio",()=>{
    expect(()=>parseLaunchReadiness({...status(),unmappedUnits:-1})).toThrow();
    expect(()=>parseLaunchReadiness({...status(),legacyEligibleUnits:"2758"})).toThrow();
    expect(()=>parseLaunchReadiness({...status(),steps:[...status().steps.slice(0,7),
      {key:"roleActivation",ready:false,current:Number.NaN}]})).toThrow();
  });
});
