/** Conteos de IMEI por referencia y sede, sin inventar ubicaciones ni unidades no serializadas. */
export interface ReferenceSiteCount {
  siteId:string|null; siteName:string;cityName:string|null;
  total:number;physicallyVerified:number;available:number;
  unverified:number;inTransit:number;pendingReturn:number;sold:number;
}
export interface ReferenceStockRow extends Omit<ReferenceSiteCount,"siteId"|"siteName"|"cityName"> {
  productId:string;name:string;sku:string;sites:ReferenceSiteCount[];
}
export interface ReferenceStockResult {
  initialApproved:boolean;scope:"serialized_imei_only";
  page:number;pageSize:number;matched:number;items:ReferenceStockRow[];
}

const asRecord=(raw:unknown):Record<string,unknown>=>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)) throw new Error("El resumen de referencias no es válido.");
  return raw as Record<string,unknown>;
};
const asText=(value:unknown):string=>{
  if(typeof value!=="string")throw new Error("Falta una identificación de referencia.");
  return value;
};
const asInt=(value:unknown):number=>{
  if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0)
    throw new Error("El servidor devolvió conteos de referencias inválidos.");
  return value;
};
const asNullableText=(value:unknown):string|null=>
  value===null?null:asText(value);
const values=["total","physicallyVerified","available","unverified","inTransit","pendingReturn","sold"] as const;
type CountKey=(typeof values)[number];
const parseCounts=(obj:Record<string,unknown>)=>{
  const counters={} as Record<CountKey,number>;
  for(const name of values)counters[name]=asInt(obj[name]);
  if(counters.available>counters.physicallyVerified||
     counters.physicallyVerified+counters.unverified+counters.inTransit+
       counters.pendingReturn+counters.sold!==counters.total)
    throw new Error("Las existencias por referencia son inconsistentes.");
  return counters;
};
export const parseReferenceStock=(data:unknown):ReferenceStockResult=>{
  const input=asRecord(data);
  if(input.scope!=="serialized_imei_only"||typeof input.initialApproved!=="boolean"||
     !Array.isArray(input.items))
    throw new Error("La consulta no garantiza existencias serializadas verificadas.");
  const items=input.items.map((raw:unknown):ReferenceStockRow=>{
    const row=asRecord(raw);
    if(!Array.isArray(row.sites))throw new Error("Falta el detalle por sede.");
    const sites=row.sites.map((record:unknown):ReferenceSiteCount=>{
      const site=asRecord(record);
      const siteId=asNullableText(site.siteId);
      const counts=parseCounts(site);
      if(siteId===null&&(counts.available!==0||counts.physicallyVerified!==0))
        throw new Error("Una sede no verificada no puede tener stock disponible.");
      return {...counts,siteId,siteName:asText(site.siteName),cityName:asNullableText(site.cityName)};
    });
    const counts=parseCounts(row);
    for(const key of values){
      if(sites.reduce((sum,site)=>sum+site[key],0)!==counts[key])
        throw new Error("Los subtotales por sede no coinciden con la referencia.");
    }
    return {...counts,productId:asText(row.productId),name:asText(row.name),
      sku:asText(row.sku),sites};
  });
  const page=asInt(input.page),pageSize=asInt(input.pageSize),matched=asInt(input.matched);
  if(page===0||pageSize===0||pageSize>50||items.length>pageSize||items.length>matched)
    throw new Error("Paginación de inventario inválida.");
  return {initialApproved:input.initialApproved,scope:"serialized_imei_only",
    page,pageSize,matched,items};
};

export const fetchReferenceStock=async(options:{query?:string;page?:number;pageSize?:number}={})
:Promise<ReferenceStockResult>=>{
  const {supabase}=await import("@/integrations/supabase/client");
  const {data,error}=await (supabase as unknown as {
    rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message:string}|null}>
  }).rpc("nexora_inventory_reference_summary",{
    p_query:options.query??"",p_page:options.page??1,p_page_size:options.pageSize??20,
  });
  if(error)throw new Error(error.message);
  return parseReferenceStock(data);
};
