/** Hitos multisede comprobados por IMEI; no reemplaza el historial legacy. */
export const MULTISITE_EVENT_TYPES = [
  "initial_approved","transfer_prepared","transfer_dispatched",
  "transfer_received","transfer_return_pending","transfer_returned",
  "transfer_cancelled","retail_sale",
] as const;
export type MultisiteEventType = (typeof MULTISITE_EVENT_TYPES)[number];

export interface MultisiteImeiEvent {
  eventId:string;
  eventType:MultisiteEventType;
  eventAt:string;
  description:string;
  originSite:string|null;
  destinationSite:string|null;
  reference:string|null;
  unitState:string;
}
export interface MultisiteImeiTimeline {
  scope:"multisite_confirmed_only";
  unitId:string;
  serial:string;
  total:number;
  page:number;
  pageSize:number;
  items:MultisiteImeiEvent[];
}

const record=(input:unknown):Record<string,unknown>=>{
  if(!input||typeof input!=="object"||Array.isArray(input))
    throw new Error("Hoja de vida: respuesta del servidor inválida.");
  return input as Record<string,unknown>;
};
const string=(input:unknown)=>{
  if(typeof input!=="string"||input.length===0||input.length>600)
    throw new Error("Hoja de vida: falta un dato de evento.");
  return input;
};
const optional=(input:unknown)=>input===null?null:string(input);
const integer=(input:unknown)=>{
  if(typeof input!=="number"||!Number.isSafeInteger(input)||input<0)
    throw new Error("Hoja de vida: paginación inválida.");
  return input;
};
const date=(input:unknown)=>{
  const value=string(input);
  if(Number.isNaN(Date.parse(value)))throw new Error("Hoja de vida: fecha inválida.");
  return value;
};
const eventTypes=new Set<string>(MULTISITE_EVENT_TYPES);
export const parseMultisiteImeiTimeline=(
  input:unknown,expectedUnitId:string,
):MultisiteImeiTimeline=>{
  const response=record(input);
  if(response.scope!=="multisite_confirmed_only"||response.unitId!==expectedUnitId
    ||!Array.isArray(response.items))
    throw new Error("La hoja de vida del IMEI no corresponde a la unidad solicitada.");
  const total=integer(response.total);
  const page=integer(response.page);
  const pageSize=integer(response.pageSize);
  if(page===0||pageSize===0||pageSize>50||response.items.length>pageSize
    ||response.items.length>total)
    throw new Error("Hoja de vida: conteos inconsistentes.");
  const ids=new Set<string>();
  const items=response.items.map((raw:unknown):MultisiteImeiEvent=>{
    const item=record(raw);
    const eventId=string(item.eventId);
    const eventType=string(item.eventType);
    if(!eventTypes.has(eventType)||ids.has(eventId))
      throw new Error("Hoja de vida: evento duplicado o desconocido.");
    ids.add(eventId);
    return {
      eventId,eventType:eventType as MultisiteEventType,
      eventAt:date(item.eventAt),
      description:string(item.description),
      originSite:optional(item.originSite),
      destinationSite:optional(item.destinationSite),
      reference:optional(item.reference),
      unitState:string(item.unitState),
    };
  });
  if(items.some((item,index)=>index>0&&
    Date.parse(items[index-1].eventAt)<Date.parse(item.eventAt)))
    throw new Error("Hoja de vida: eventos fuera de orden.");
  return {scope:"multisite_confirmed_only",unitId:expectedUnitId,
    serial:string(response.serial),total,page,pageSize,items};
};

export const fetchMultisiteImeiTimeline=async (
  unitId:string,page=1,
):Promise<MultisiteImeiTimeline>=>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(unitId))
    throw new Error("Identificador de equipo inválido.");
  if(!Number.isInteger(page)||page<1||page>10000)
    throw new Error("Página solicitada inválida.");
  const {supabase}=await import("@/integrations/supabase/client");
  const {data,error}=await (supabase as unknown as {
    rpc:(name:string,args:Record<string,unknown>)=>Promise<{
      data:unknown;error:{message:string}|null;
    }>;
  }).rpc("nexora_unit_multisite_timeline",{
    p_unit_id:unitId,p_page:page,p_page_size:25,
  });
  if(error)throw new Error(error.message);
  return parseMultisiteImeiTimeline(data,unitId);
};
