/** Diagnóstico sin escrituras para obtener facturas reales de los IMEI sin costo. */
import { safeCsvCell } from "./nexora-imei-unified-csv";
export interface CostEvidenceReceipt {
  receptionId:string|null;receptionCode:string;
  receiptReference:string|null;receiptStatus:string|null;
  receivedAt:string|null;supplierName:string|null;
  eligible:number;withoutCost:number;withCost:number;referencesCount:number;
}
export interface CostEvidenceReport {
  scope:"cost_recovery_evidence_only";snapshotAt:string;
  eligible:number;withoutCost:number;withCost:number;receipts:number;
  items:CostEvidenceReceipt[];
}
const obj=(raw:unknown):Record<string,unknown>=>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
    throw new Error("El diagnóstico de costos es inválido.");
  return raw as Record<string,unknown>;
};
const text=(raw:unknown):string=>{
  if(typeof raw!=="string"||!raw.trim()||raw.length>500)
    throw new Error("Faltan datos identificativos en el reporte de costos.");
  return raw;
};
const optional=(raw:unknown):string|null=>raw===null?null:text(raw);
const num=(raw:unknown):number=>{
  if(typeof raw!=="number"||!Number.isSafeInteger(raw)||raw<0)
    throw new Error("Conteo de costos inválido.");
  return raw;
};
export const parseCostEvidenceReport=(raw:unknown):CostEvidenceReport=>{
  const r=obj(raw);
  if(r.scope!=="cost_recovery_evidence_only"||!Array.isArray(r.items)
     ||typeof r.snapshotAt!=="string"||Number.isNaN(Date.parse(r.snapshotAt)))
    throw new Error("El reporte de costos no corresponde al inventario inicial.");
  const eligible=num(r.eligible),withoutCost=num(r.withoutCost);
  const withCost=num(r.withCost),receipts=num(r.receipts);
  if(withoutCost+withCost!==eligible||r.items.length!==receipts)
    throw new Error("El resumen no coincide con las recepciones.");
  const seen=new Set<string>();
  const items=r.items.map((value:unknown):CostEvidenceReceipt=>{
    const x=obj(value),id=optional(x.receptionId),code=text(x.receptionCode);
    if(id===null&&code!=="SIN RECEPCIÓN"||seen.has(id??"SIN RECEPCIÓN"))
      throw new Error("Referencia de recepción inválida o duplicada.");
    seen.add(id??"SIN RECEPCIÓN");
    const total=num(x.eligible),missing=num(x.withoutCost);
    const valid=num(x.withCost),references=num(x.referencesCount);
    if(missing+valid!==total||references>total||total===0)
      throw new Error("Una recepción tiene conteos inconsistentes.");
    const date=optional(x.receivedAt);
    if(date!==null&&Number.isNaN(Date.parse(date)))
      throw new Error("Fecha de recepción inválida.");
    return {
      receptionId:id,receptionCode:code,
      receiptReference:optional(x.receiptReference),
      receiptStatus:optional(x.receiptStatus),
      receivedAt:date,supplierName:optional(x.supplierName),
      eligible:total,withoutCost:missing,withCost:valid,referencesCount:references,
    };
  });
  if(items.reduce((n,x)=>n+x.eligible,0)!==eligible
     ||items.reduce((n,x)=>n+x.withoutCost,0)!==withoutCost
     ||items.reduce((n,x)=>n+x.withCost,0)!==withCost)
    throw new Error("Las recepciones no cubren la totalidad del inventario.");
  for(let i=1;i<items.length;i++){
    if(items[i-1].withoutCost<items[i].withoutCost)
      throw new Error("La lista de prioridades está fuera de orden.");
  }
  return {scope:"cost_recovery_evidence_only",snapshotAt:r.snapshotAt,
    eligible,withoutCost,withCost,receipts,items};
};
export const fetchCostEvidenceReport=async():Promise<CostEvidenceReport>=>{
  const {supabase}=await import("@/integrations/supabase/client");
  const {data,error}=await (supabase as unknown as {
    rpc:(fn:string)=>Promise<{data:unknown;error:{message:string}|null}>;
  }).rpc("nexora_cost_evidence_by_reception");
  if(error)throw new Error(error.message);
  return parseCostEvidenceReport(data);
};
/** Formato copiable en Excel/LibreOffice sin fórmulas de texto. */
export const buildCostEvidenceCsv=(input:CostEvidenceReport):string=>{
  const report=parseCostEvidenceReport(input);
  const lines=[
    ["Nexora Multisede · Documentación pendiente de costos"],
    ["Corte de datos",report.snapshotAt],
    ["Unidades físicas elegibles",String(report.eligible),
      "Sin costo real individual",String(report.withoutCost)],
    ["Recepciones por revisar",String(report.receipts)],
    ["ADVERTENCIA","La recepción es una pista para localizar facturas, NO una prueba de costo individual."],
    ["ADVERTENCIA","No imputar costos por promedio, precio de catálogo ni suposición. Requiere soporte real por IMEI."],
    [],
    ["Recepción","Estado de recepción","Fecha","Proveedor","Referencia documental",
      "Equipos elegibles","Sin costo individual","Con costo válido","Referencias distintas",
      "Número de factura real (llenar manualmente)","Soporte encontrado (Sí/No)","Observaciones"],
  ];
  for(const row of report.items){
    lines.push([
      row.receptionCode,row.receiptStatus??"",row.receivedAt??"",
      row.supplierName??"",row.receiptReference??"",
      String(row.eligible),String(row.withoutCost),String(row.withCost),
      String(row.referencesCount),"","","",
    ]);
  }
  return "\uFEFF"+lines.map(row=>row.map(safeCsvCell).join(";")).join("\r\n")+"\r\n";
};
