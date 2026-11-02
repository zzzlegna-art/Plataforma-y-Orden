import {describe,expect,it} from "vitest";
import {
  WAREHOUSE_6A_CONFIRMATION,canCertifyWarehouse6A,
  parseWarehouse6ACertification,parseWarehouse6APreflight,
} from "./nexora-warehouse-6a-opening";
const site="cf03b83a-a23f-4bd2-a778-2c071fa9df2e";
const fp="f".repeat(32);
const base=()=>({
  scope:"warehouse_6a_declaration_preflight",siteId:site,siteName:"Bodega 6A",
  eligible:2758,soldHistorical:395,otherHistorical:0,withoutValidCost:2758,
  activeImeiScans:0,mappedUnits:0,priorApprovals:0,custodyRows:0,
  inFlightTransferLines:0,inventoryFingerprint:fp,canCertify:true,
  snapshotAt:"2026-11-02T17:00:00-05:00",
  physicalPresenceIndependentlyVerified:false,
});
describe("Nexora · apertura excepcional y verificable Bodega 6A",()=>{
  it("reconoce origen histórico, no convierte vendidos en existencias ni escaneos",()=>{
    const p=parseWarehouse6APreflight(base());
    expect(p.eligible).toBe(2758);
    expect(p.soldHistorical).toBe(395);
    expect(p.withoutValidCost).toBe(2758);
    expect(p.activeImeiScans).toBe(0);
    expect(p.physicalPresenceIndependentlyVerified).toBe(false);
  });
  it("no permite firmar sin dos aceptaciones, nota y frase exacta",()=>{
    const p=parseWarehouse6APreflight(base());
    const note="Revisé las recepciones y los registros almacenados de forma controlada.";
    expect(canCertifyWarehouse6A(p,true,true,note,WAREHOUSE_6A_CONFIRMATION)).toBe(true);
    expect(canCertifyWarehouse6A(p,true,false,note,WAREHOUSE_6A_CONFIRMATION)).toBe(false);
    expect(canCertifyWarehouse6A(p,false,true,note,WAREHOUSE_6A_CONFIRMATION)).toBe(false);
    expect(canCertifyWarehouse6A(p,true,true,"No tengo soporte",WAREHOUSE_6A_CONFIRMATION)).toBe(false);
    expect(canCertifyWarehouse6A(p,true,true,note,"APROBAR")).toBe(false);
    expect(canCertifyWarehouse6A(null,true,true,note,WAREHOUSE_6A_CONFIRMATION)).toBe(false);
  });
  it("bloquea cortes inconsistentes y estados no elegibles",()=>{
    expect(()=>parseWarehouse6APreflight({...base(),siteName:"iPhone America"})).toThrow();
    expect(()=>parseWarehouse6APreflight({...base(),inventoryFingerprint:"123"})).toThrow();
    expect(()=>parseWarehouse6APreflight({...base(),withoutValidCost:3000})).toThrow();
    expect(()=>parseWarehouse6APreflight({...base(),activeImeiScans:1})).toThrow();
    expect(()=>parseWarehouse6APreflight({...base(),mappedUnits:1})).toThrow();
    expect(()=>parseWarehouse6APreflight({...base(),priorApprovals:1})).toThrow();
    expect(()=>parseWarehouse6APreflight({...base(),physicalPresenceIndependentlyVerified:true})).toThrow();
  });
  it("admite prevalidación bloqueada sin mentir sobre su disponibilidad",()=>{
    const p=parseWarehouse6APreflight({...base(),canCertify:false,activeImeiScans:1});
    expect(p.canCertify).toBe(false);
    expect(canCertifyWarehouse6A(p,true,true,"Notas administrativas suficientemente detalladas",WAREHOUSE_6A_CONFIRMATION)).toBe(false);
  });
  it("confirma acta firmada sin pretender que se escanearon unidades",()=>{
    const p=parseWarehouse6APreflight(base());
    const result=parseWarehouse6ACertification({
      scope:"warehouse_6a_admin_declaration",
      approvalId:"c1f3baab-0fb4-4f1a-a150-69ed9ff61d61",
      approvedCount:2758,historicalSold:395,siteId:site,
      withoutValidCost:2758,method:"admin_declaration_6a",
      individualImeiScans:0,approvedAt:"2026-11-02T18:00:00-05:00",
      inventoryFingerprint:fp,salesEnabled:false,costsValidated:false,
    },p);
    expect(result.approvedCount).toBe(2758);
    expect(result.individualImeiScans).toBe(0);
    expect(result.salesEnabled).toBe(false);
    expect(()=>parseWarehouse6ACertification({...result,individualImeiScans:2758},p)).toThrow();
    expect(()=>parseWarehouse6ACertification({...result,approvedCount:2759},p)).toThrow();
    expect(()=>parseWarehouse6ACertification({...result,salesEnabled:true},p)).toThrow();
  });
});
