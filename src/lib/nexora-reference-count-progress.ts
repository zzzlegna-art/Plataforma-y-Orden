/**
 * Nexora 2.0 · Avance real de conciliación POR REFERENCIA.
 * Derivado solo del corte administrativo de IMEI. No infiere faltantes físicos:
 * "pendiente" significa no cotejado; "revisar" significa evidencia desactualizada.
 */
import {
  parseInitialCountWorklist,
  type InitialCountWorklist,
  type InitialCountWorklistRow,
} from "./nexora-initial-count-worklist";
import { safeCsvCell } from "./nexora-imei-unified-csv";

export interface ReferenceCountProgress {
  sku:string;productName:string;eligible:number;pending:number;
  verified:number;stale:number;withoutValidCost:number;
}
export interface ReferenceProgressReport {
  snapshotAt:string;eligible:number;pending:number;verified:number;stale:number;
  withoutValidCost:number;excludedHistorical:number;
  references:ReferenceCountProgress[];
  staleUnits:InitialCountWorklistRow[];
}

export const summarizeInitialCountByReference=(raw:InitialCountWorklist):ReferenceProgressReport=>{
  const data=parseInitialCountWorklist(raw);
  const byReference=new Map<string,ReferenceCountProgress>();
  const staleUnits:InitialCountWorklistRow[]=[];
  for(const row of data.rows){
    const key=JSON.stringify([row.sku,row.productName]);
    let ref=byReference.get(key);
    if(!ref){
      ref={sku:row.sku,productName:row.productName,eligible:0,
        pending:0,verified:0,stale:0,withoutValidCost:0};
      byReference.set(key,ref);
    }
    ref.eligible++;
    if(row.reconciliationState==="pendiente")ref.pending++;
    if(row.reconciliationState==="cotejado")ref.verified++;
    if(row.reconciliationState==="revisar"){
      ref.stale++;staleUnits.push(row);
    }
    if(row.cost===null||row.cost<=0)ref.withoutValidCost++;
  }
  const references=[...byReference.values()].sort((a,b)=>
    b.stale-a.stale||b.pending-a.pending||
    b.eligible-a.eligible||a.productName.localeCompare(b.productName,"es")||
    a.sku.localeCompare(b.sku,"es"));
  if(references.reduce((n,row)=>n+row.eligible,0)!==data.eligible||
     references.reduce((n,row)=>n+row.pending,0)!==data.pending||
     references.reduce((n,row)=>n+row.verified,0)!==data.verified||
     references.reduce((n,row)=>n+row.stale,0)!==data.stale||
     references.reduce((n,row)=>n+row.withoutValidCost,0)!==data.withoutValidCost||
     staleUnits.length!==data.stale)
    throw new Error("El resumen por referencia no coincide con los IMEI comprobados.");
  return {
    snapshotAt:data.snapshotAt,eligible:data.eligible,pending:data.pending,
    verified:data.verified,stale:data.stale,withoutValidCost:data.withoutValidCost,
    excludedHistorical:data.excludedHistorical,references,staleUnits,
  };
};

/** Archivos completos con encabezados explícitos; no crean ajustes ni atribucciones físicas. */
export const buildInitialCountReferenceCsv=(raw:InitialCountWorklist):string=>{
  const report=summarizeInitialCountByReference(raw);
  const rows:string[][]=[
    ["Nexora Multisede · Avance provisional de conteo por referencia"],
    ["Corte",report.snapshotAt],
    ["Unidades pendientes de cotejo",String(report.pending)],
    ["Cotejos provisionales válidos",String(report.verified)],
    ["Cotejos desactualizados por revisar",String(report.stale)],
    ["Unidades sin costo individual válido",String(report.withoutValidCost)],
    ["Históricos no elegibles (NO contar)",String(report.excludedHistorical)],
    ["AVISO","Pendiente NO significa faltante físico. Cotejo NO significa stock aprobado."],
    [],
    ["SKU","Referencia","Elegibles","Pendientes","Cotejados provisionales",
      "Por revisar","Sin costo individual válido","Porcentaje cotejado (0-100)"],
    ...report.references.map(row=>[
      row.sku,row.productName,String(row.eligible),String(row.pending),
      String(row.verified),String(row.stale),String(row.withoutValidCost),
      String(row.eligible>0?Math.round(row.verified/row.eligible*100):0),
    ]),
  ];
  if(report.staleUnits.length){
    rows.push([],["IMEI de observaciones desactualizadas · revisar en Conciliación IMEI"],
      ["Serial (texto)","Referencia","SKU","Estado histórico actual",
       "Sede observada NO aprobada","Fecha de observación"]);
    for(const row of report.staleUnits){
      rows.push([
        "'"+row.serial,row.productName,row.sku,row.legacyStatus,
        row.observedSiteName??"",row.observedAt??"",
      ]);
    }
  }
  return "\uFEFF"+rows.map(row=>row.map(safeCsvCell).join(";")).join("\r\n")+"\r\n";
};
