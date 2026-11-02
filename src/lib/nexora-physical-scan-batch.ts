/** Cotejo físico por lotes, una transacción por hasta 50 IMEI. */
import { canObserveLegacyStatus } from "./nexora-imei-reconciliation";

export const MAX_PHYSICAL_SCANS_PER_BATCH=50;
export interface BatchObservation {
  observationId:string;unitId:string;siteId:string;
  serial:string;status:string;checkedAt:string;
}
export interface PhysicalBatchReceipt {
  scope:"physical_scan_batch";siteId:string;
  registered:number;inventoryApproved:false;items:BatchObservation[];
}
/** Los IMEI deben provenir de lecturas realizadas en la sede seleccionada. */
export const parsePhysicalScanBatch=(raw:string):string[]=>{
  if(raw.length>160*MAX_PHYSICAL_SCANS_PER_BATCH+MAX_PHYSICAL_SCANS_PER_BATCH*3)
    throw new Error("El lote contiene demasiados caracteres.");
  const serials=raw.split(/[\r\n,;\t]+/).map(x=>x.trim()).filter(Boolean);
  if(serials.length<1||serials.length>MAX_PHYSICAL_SCANS_PER_BATCH)
    throw new Error("Escanea entre 1 y 50 IMEI por lote.");
  if(serials.some(s=>s.length>160))
    throw new Error("Uno de los IMEI supera 160 caracteres.");
  const seen=new Set<string>();
  for(const serial of serials){
    const key=serial.toLocaleLowerCase();
    if(seen.has(key))
      throw new Error("El lote tiene IMEI repetidos. Revisa las lecturas.");
    seen.add(key);
  }
  return serials;
};
const obj=(value:unknown):Record<string,unknown>=>{
  if(!value||typeof value!=="object"||Array.isArray(value))
    throw new Error("Confirmación de lote inválida.");
  return value as Record<string,unknown>;
};
const str=(value:unknown)=>{
  if(typeof value!=="string"||!value.trim()||value.length>160)
    throw new Error("Un IMEI confirmado está incompleto.");
  return value;
};
export const parsePhysicalBatchReceipt=(
  raw:unknown,siteId:string,scanned:readonly string[],
):PhysicalBatchReceipt=>{
  const r=obj(raw);
  if(r.scope!=="physical_scan_batch"||r.inventoryApproved!==false||
    r.siteId!==siteId||!Array.isArray(r.items)||
    r.registered!==scanned.length||r.items.length!==scanned.length)
    throw new Error("El servidor no confirmó el lote íntegro.");
  const expected=new Set(scanned.map(s=>s.toLocaleLowerCase()));
  const seen=new Set<string>();
  const items=r.items.map((item:unknown):BatchObservation=>{
    const v=obj(item),serial=str(v.serial),key=serial.toLocaleLowerCase();
    if(!expected.has(key)||seen.has(key)||v.siteId!==siteId||
      !canObserveLegacyStatus(String(v.status))||
      typeof v.checkedAt!=="string"||Number.isNaN(Date.parse(v.checkedAt)))
      throw new Error("El servidor devolvió un cotejo ajeno o duplicado.");
    seen.add(key);
    return {
      observationId:str(v.observationId),unitId:str(v.unitId),
      siteId,serial,status:str(v.status),checkedAt:v.checkedAt,
    };
  });
  return {
    scope:"physical_scan_batch",siteId,registered:items.length,
    inventoryApproved:false,items,
  };
};

export const registerPhysicalScanBatch=async(
  siteId:string,scanned:readonly string[],notes:string,
):Promise<PhysicalBatchReceipt>=>{
  if(!siteId||scanned.length<1)
    throw new Error("Selecciona una sede y escanea los IMEI.");
  if(notes.length>500)throw new Error("Las notas superan 500 caracteres.");
  const serials=parsePhysicalScanBatch(scanned.join("\n"));
  const {supabase}=await import("@/integrations/supabase/client");
  const {data,error}=await (supabase as unknown as {
    rpc:(name:string,args:Record<string,unknown>)=>Promise<{
      data:unknown;error:{message:string}|null;
    }>;
  }).rpc("nexora_register_physical_scan_batch",{
    p_site_id:siteId,p_serials:serials,p_notes:notes.trim()||null,
  });
  if(error)throw new Error(error.message);
  return parsePhysicalBatchReceipt(data,siteId,serials);
};
