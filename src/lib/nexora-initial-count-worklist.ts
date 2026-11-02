/** Planilla única de cotejo físico: datos reales de Supabase, sin atribuir stock a una sede. */
import { safeCsvCell } from "./nexora-imei-unified-csv";

export type PhysicalCountState="pendiente"|"cotejado"|"revisar";
export interface InitialCountWorklistRow {
  unitId:string;serial:string;productName:string;sku:string;
  legacyStatus:string;condition:string;historicalLocation:string|null;
  cost:number|null;reconciliationState:PhysicalCountState;
  observedSiteId:string|null;observedSiteName:string|null;
  observedCityName:string|null;observedAt:string|null;
}
export interface InitialCountWorklist {
  scope:"initial_physical_inventory_worklist";
  snapshotAt:string;eligible:number;excludedHistorical:number;
  pending:number;verified:number;stale:number;withoutValidCost:number;
  rows:InitialCountWorklistRow[];
}
const knownStates=new Set<PhysicalCountState>(["pendiente","cotejado","revisar"]);
const eligibleStatuses=new Set(["en_bodega","en_local","en_transito","en_reparacion","defectuoso"]);
const obj=(value:unknown):Record<string,unknown>=>{
  if(value===null||typeof value!=="object"||Array.isArray(value))
    throw new Error("La planilla de inventario no tiene un formato válido.");
  return value as Record<string,unknown>;
};
const str=(value:unknown,max=500):string=>{
  if(typeof value!=="string"||!value.trim()||value.length>max)
    throw new Error("Falta un identificador del inventario.");
  return value;
};
const nullable=(value:unknown):string|null=>value===null?null:str(value);
const count=(value:unknown):number=>{
  if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0)
    throw new Error("Un conteo del inventario es inválido.");
  return value;
};
const cost=(value:unknown):number|null=>{
  if(value===null)return null;
  if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>1e15)
    throw new Error("El costo histórico de un equipo es inválido.");
  return value;
};

export const parseInitialCountWorklist=(raw:unknown):InitialCountWorklist=>{
  const r=obj(raw);
  if(r.scope!=="initial_physical_inventory_worklist"||!Array.isArray(r.rows)
     ||typeof r.snapshotAt!=="string"||Number.isNaN(Date.parse(r.snapshotAt)))
    throw new Error("La planilla no corresponde al inventario inicial.");
  const eligible=count(r.eligible),excludedHistorical=count(r.excludedHistorical);
  const pending=count(r.pending),verified=count(r.verified),stale=count(r.stale);
  const withoutValidCost=count(r.withoutValidCost);
  if(eligible>5000||r.rows.length!==eligible||pending+verified+stale!==eligible
    ||withoutValidCost>eligible)
    throw new Error("La planilla está incompleta o tiene conteos inconsistentes.");
  const ids=new Set<string>(),serials=new Set<string>();
  const rows=r.rows.map((value:unknown):InitialCountWorklistRow=>{
    const x=obj(value),unitId=str(x.unitId),serial=str(x.serial);
    const normalized=serial.trim().toLocaleLowerCase();
    if(ids.has(unitId)||serials.has(normalized))
      throw new Error("Hay identificadores o seriales duplicados en la planilla.");
    ids.add(unitId);serials.add(normalized);
    if(!knownStates.has(x.reconciliationState as PhysicalCountState)
      ||!eligibleStatuses.has(x.legacyStatus as string))
      throw new Error("La planilla incluye estados de unidad no elegibles.");
    const state=x.reconciliationState as PhysicalCountState;
    const siteId=nullable(x.observedSiteId);
    const siteName=nullable(x.observedSiteName);
    const city=nullable(x.observedCityName);
    const observedAt=nullable(x.observedAt);
    if((state==="pendiente"&&
        (siteId!==null||siteName!==null||city!==null||observedAt!==null))||
       (state!=="pendiente"&&
        (siteId===null||siteName===null||city===null||observedAt===null)))
      throw new Error("Una observación de sede no coincide con su estado de cotejo.");
    if(observedAt!==null&&Number.isNaN(Date.parse(observedAt)))
      throw new Error("Una observación tiene fecha inválida.");
    return {
      unitId,serial,productName:str(x.productName),sku:str(x.sku),
      legacyStatus:x.legacyStatus as string,condition:str(x.condition),
      historicalLocation:nullable(x.historicalLocation),cost:cost(x.cost),
      reconciliationState:state,
      observedSiteId:siteId,observedSiteName:siteName,
      observedCityName:city,observedAt,
    };
  });
  if(rows.filter(x=>x.reconciliationState==="pendiente").length!==pending
    ||rows.filter(x=>x.reconciliationState==="cotejado").length!==verified
    ||rows.filter(x=>x.reconciliationState==="revisar").length!==stale
    ||rows.filter(x=>x.cost===null||x.cost<=0).length!==withoutValidCost)
    throw new Error("Las cifras del cotejo no coinciden con los equipos recibidos.");
  return {scope:"initial_physical_inventory_worklist",snapshotAt:r.snapshotAt,
    eligible,excludedHistorical,pending,verified,stale,withoutValidCost,rows};
};

export const fetchInitialCountWorklist=async():Promise<InitialCountWorklist>=>{
  const {supabase}=await import("@/integrations/supabase/client");
  const {data,error}=await (supabase as unknown as {
    rpc:(name:string)=>Promise<{data:unknown;error:{message:string}|null}>;
  }).rpc("nexora_initial_inventory_worklist");
  if(error)throw new Error(error.message);
  return parseInitialCountWorklist(data);
};

/** CSV UTF-8 para inspección humana; sin asignación automática ni fórmulas de Excel. */
export const buildInitialCountWorklistCsv=(list:InitialCountWorklist):string=>{
  // Validación adicional: nunca convertir datos incompletos en una planilla.
  const data=parseInitialCountWorklist(list);
  const header=[
    ["Nexora Multisede 2.0 · PLANILLA PREPARATORIA DE CONTEO FÍSICO"],
    ["Corte UTC",data.snapshotAt],
    ["Aptos para cotejo",String(data.eligible),"Pendientes",String(data.pending)],
    ["Cotejados (sin aprobar)",String(data.verified),"Observaciones por revisar",String(data.stale)],
    ["Registros históricos excluidos",String(data.excludedHistorical),
      "Sin costo individual válido",String(data.withoutValidCost)],
    ["ADVERTENCIA","La ubicación histórica NO prueba la sede física. Un cotejo NO representa stock aprobado."],
    [],
    ["IMEI / Serial (texto)","SKU","Referencia","Estado histórico","Condición",
      "Ubicación histórica NO verificada","Costo individual COP",
      "Estado del cotejo","Sede observada NO aprobada","Ciudad observada",
      "Fecha de cotejo","Sede real encontrada (llenar manualmente)",
      "Contado físicamente (Sí/No)","Observaciones de inspección"],
  ];
  const lines=header.map(row=>row.map(safeCsvCell).join(";"));
  for(const row of data.rows){
    const values=[
      "'"+row.serial,row.sku,row.productName,row.legacyStatus,row.condition,
      row.historicalLocation??"",row.cost===null?"":row.cost.toFixed(2),
      row.reconciliationState,row.observedSiteName??"",row.observedCityName??"",
      row.observedAt??"","","","",
    ];
    lines.push(values.map(safeCsvCell).join(";"));
  }
  return "\uFEFF"+lines.join("\r\n")+"\r\n";
};
