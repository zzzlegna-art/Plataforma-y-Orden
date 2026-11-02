/** Apertura excepcional 6A: firma administrativa NO equivale a escaneo. */
export const WAREHOUSE_6A_CONFIRMATION="CERTIFICO BODEGA 6A";
export const WAREHOUSE_6A_DECLARATION =
  "Confirmo bajo mi responsabilidad administrativa que las unidades elegibles registradas representan las existencias físicas actuales de Bodega 6A; he revisado los registros y acepto que el sistema las incorpore por declaración, sin escaneo individual.";
export interface Warehouse6APreflight {
  scope:"warehouse_6a_declaration_preflight";
  siteId:string|null;siteName:string|null;
  eligible:number;soldHistorical:number;otherHistorical:number;
  withoutValidCost:number;activeImeiScans:number;mappedUnits:number;
  priorApprovals:number;custodyRows:number;inFlightTransferLines:number;
  inventoryFingerprint:string;canCertify:boolean;snapshotAt:string;
  physicalPresenceIndependentlyVerified:false;
}
export interface Warehouse6ACertification {
  scope:"warehouse_6a_admin_declaration";approvalId:string;
  approvedCount:number;historicalSold:number;siteId:string;
  withoutValidCost:number;method:"admin_declaration_6a";
  individualImeiScans:0;approvedAt:string;inventoryFingerprint:string;
  salesEnabled:false;costsValidated:false;
}
const obj=(x:unknown):Record<string,unknown>=>{
  if(!x||typeof x!=="object"||Array.isArray(x))
    throw new Error("Supabase no devolvió un acta válida.");
  return x as Record<string,unknown>;
};
const count=(x:unknown):number=>{
  if(typeof x!=="number"||!Number.isSafeInteger(x)||x<0)
    throw new Error("Un conteo de la certificación es inválido.");
  return x;
};
const uuid=(x:unknown):string=>{
  if(typeof x!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x))
    throw new Error("Identificador de acta o sede inválido.");
  return x;
};
const fingerprint=(x:unknown):string=>{
  if(typeof x!=="string"||!/^[0-9a-f]{32}$/.test(x))
    throw new Error("La huella de inventario es inválida.");
  return x;
};
const date=(x:unknown):string=>{
  if(typeof x!=="string"||!x||Number.isNaN(Date.parse(x)))
    throw new Error("Fecha de acta inválida.");
  return x;
};
export const parseWarehouse6APreflight=(raw:unknown):Warehouse6APreflight=>{
  const x=obj(raw);
  if(x.scope!=="warehouse_6a_declaration_preflight"||
     typeof x.canCertify!=="boolean"||x.physicalPresenceIndependentlyVerified!==false)
    throw new Error("No es una prevalidación de Bodega 6A.");
  const ready=x.canCertify;
  const siteId=x.siteId===null?null:uuid(x.siteId);
  const siteName=x.siteName===null?null:x.siteName==="Bodega 6A"?"Bodega 6A":null;
  if(x.siteName!==null&&siteName===null)
    throw new Error("La sede no es Bodega 6A.");
  const report:Warehouse6APreflight={
    scope:"warehouse_6a_declaration_preflight",
    siteId,siteName,
    eligible:count(x.eligible),soldHistorical:count(x.soldHistorical),
    otherHistorical:count(x.otherHistorical),withoutValidCost:count(x.withoutValidCost),
    activeImeiScans:count(x.activeImeiScans),mappedUnits:count(x.mappedUnits),
    priorApprovals:count(x.priorApprovals),custodyRows:count(x.custodyRows),
    inFlightTransferLines:count(x.inFlightTransferLines),
    inventoryFingerprint:fingerprint(x.inventoryFingerprint),
    canCertify:ready,snapshotAt:date(x.snapshotAt),
    physicalPresenceIndependentlyVerified:false,
  };
  if(report.withoutValidCost>report.eligible||
    (ready&&(!siteId||!siteName||report.eligible===0||
    report.otherHistorical!==0||report.activeImeiScans!==0||
    report.mappedUnits!==0||report.priorApprovals!==0||
    report.custodyRows!==0||report.inFlightTransferLines!==0)))
    throw new Error("La prevalidación presenta inconsistencias de inventario.");
  return report;
};
export const canCertifyWarehouse6A=(p:Warehouse6APreflight|null,
  confirmedRecords:boolean,confirmedLocation:boolean,
  supportNote:string,typed:string):boolean=>Boolean(
  p?.canCertify&&p.siteId&&confirmedRecords&&confirmedLocation&&
  supportNote.trim().length>=30&&supportNote.trim().length<=1000&&
  typed.trim()===WAREHOUSE_6A_CONFIRMATION);
export const parseWarehouse6ACertification=(raw:unknown,
  previous:Warehouse6APreflight):Warehouse6ACertification=>{
  const x=obj(raw);
  if(x.scope!=="warehouse_6a_admin_declaration"||
    x.method!=="admin_declaration_6a"||
    x.individualImeiScans!==0||x.salesEnabled!==false||
    x.costsValidated!==false)
    throw new Error("La confirmación no acredita la declaración excepcional.");
  const result:Warehouse6ACertification={
    scope:"warehouse_6a_admin_declaration",approvalId:uuid(x.approvalId),
    approvedCount:count(x.approvedCount),historicalSold:count(x.historicalSold),
    siteId:uuid(x.siteId),withoutValidCost:count(x.withoutValidCost),
    method:"admin_declaration_6a",individualImeiScans:0,
    approvedAt:date(x.approvedAt),
    inventoryFingerprint:fingerprint(x.inventoryFingerprint),
    salesEnabled:false,costsValidated:false,
  };
  if(result.approvedCount!==previous.eligible||
    result.historicalSold!==previous.soldHistorical||
    result.withoutValidCost!==previous.withoutValidCost||
    result.siteId!==previous.siteId||
    result.inventoryFingerprint!==previous.inventoryFingerprint)
    throw new Error("El resultado firmado no coincide con el corte revisado.");
  return result;
};
type RpcResult={data:unknown;error:{message:string}|null};
const rpc=async(name:string,params?:Record<string,unknown>):Promise<RpcResult>=>{
  const {supabase}=await import("@/integrations/supabase/client");
  return (supabase as unknown as {
    rpc:(name:string,params?:Record<string,unknown>)=>Promise<RpcResult>;
  }).rpc(name,params);
};
export const fetchWarehouse6APreflight=async():Promise<Warehouse6APreflight>=>{
  const {data,error}=await rpc("nexora_warehouse_6a_opening_preflight");
  if(error)throw new Error(error.message);
  return parseWarehouse6APreflight(data);
};
export const certifyWarehouse6A=async(p:Warehouse6APreflight,
  note:string,confirmation:string):Promise<Warehouse6ACertification>=>{
  if(!p.canCertify||!p.siteId||confirmation.trim()!==WAREHOUSE_6A_CONFIRMATION||
    note.trim().length<30||note.trim().length>1000)
    throw new Error("No están completos los requisitos de la declaración.");
  const {data,error}=await rpc("nexora_certify_warehouse_6a_opening",{
    p_site_id:p.siteId,p_expected_eligible:p.eligible,
    p_expected_sold:p.soldHistorical,
    p_inventory_fingerprint:p.inventoryFingerprint,
    p_support_note:note.trim(),p_confirmation:confirmation.trim(),
  });
  if(error)throw new Error(error.message);
  return parseWarehouse6ACertification(data,p);
};
