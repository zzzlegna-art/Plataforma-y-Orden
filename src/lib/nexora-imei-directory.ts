import { parseCatalogMedia, type CatalogMedia } from "./nexora-worker-catalog-media";
/**
 * Inventario global por IMEI y sede.
 * Lectura exclusiva desde RPC. No actualiza stock, costos ni ubicación física.
 */
export type CustodyState =
  | "sin_conciliar" | "en_sede" | "en_transito" | "retorno_pendiente" | "vendido";
export type CustodyFilter = CustodyState | "all";

export interface ImeiDirectoryRow extends CatalogMedia {
  unitId: string;
  serial: string;
  productName: string;
  sku: string;
  cost: number | null;
  unitStatus: string;
  custodyState: CustodyState;
  siteId: string | null;
  siteName: string | null;
  cityName: string | null;
  historicalLocation: string | null;
  committedOrder: boolean;
  committedTransfer: boolean;
  commercialCandidate: boolean;
}
export interface DirectorySite {
  id: string;
  name: string;
  city: string;
  siteType: string;
}
export interface DirectorySummary {
  sinConciliar: number;
  enSede: number;
  enTransito: number;
  retornoPendiente: number;
  vendidos: number;
  sinCosto: number;
  total: number;
}
export interface ImeiDirectoryResponse {
  initialApproved: boolean;
  summary: DirectorySummary;
  sites: DirectorySite[];
  items: ImeiDirectoryRow[];
  page: number;
  pageSize: number;
  matched: number;
}

export const CUSTODY_FILTERS: readonly { value: CustodyFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "sin_conciliar", label: "Sin conciliar" },
  { value: "en_sede", label: "En sede" },
  { value: "en_transito", label: "En tránsito" },
  { value: "retorno_pendiente", label: "Retorno pendiente" },
  { value: "vendido", label: "Vendidos" },
];
export const CUSTODY_LABEL: Record<CustodyState,string> = {
  sin_conciliar:"Sin sede verificada",
  en_sede:"En sede",
  en_transito:"En tránsito",
  retorno_pendiente:"Retorno pendiente",
  vendido:"Vendido",
};

/** Un IMEI puede estar físicamente en una sede y comprometido en un pedido. */
export const getImeiCommercialStatus=(unit:Pick<ImeiDirectoryRow,"custodyState"|"committedOrder"|"committedTransfer">):string=>{
  if(unit.custodyState==="en_sede"&&unit.committedOrder)return "Asignado a pedido";
  if(unit.custodyState==="en_sede"&&unit.committedTransfer)return "Comprometido en traslado";
  return CUSTODY_LABEL[unit.custodyState];
};

const asObject=(input:unknown):Record<string,unknown>=>{
  if(!input||typeof input!=="object"||Array.isArray(input))
    throw new Error("El servidor devolvió datos de inventario inválidos.");
  return input as Record<string,unknown>;
};
const numeric=(v:unknown):number=>{
  if(typeof v!=="number"||!Number.isFinite(v)||v<0)
    throw new Error("Cantidad o costo de inventario inválido.");
  return v;
};
const integer=(v:unknown):number=>{
  const num=numeric(v);
  if(!Number.isSafeInteger(num))throw new Error("Conteo de inventario inválido.");
  return num;
};
const string=(v:unknown):string=>{
  if(typeof v!=="string")throw new Error("Faltan datos de identificación del IMEI.");
  return v;
};
const optional=(v:unknown):string|null=>{
  if(v===null)return null;
  return string(v);
};
const bool=(v:unknown):boolean=>{
  if(typeof v!=="boolean")throw new Error("Faltan indicadores de seguridad del inventario.");
  return v;
};
const states=new Set<CustodyState>([
  "sin_conciliar","en_sede","en_transito","retorno_pendiente","vendido",
]);
export const parseImeiDirectory=(data:unknown):ImeiDirectoryResponse=>{
  const r=asObject(data),s=asObject(r.summary);
  if(!Array.isArray(r.items)||!Array.isArray(r.sites))
    throw new Error("Falta la lista paginada de IMEI.");
  return {
    initialApproved:bool(r.initialApproved),
    summary:{
      sinConciliar:integer(s.sinConciliar),enSede:integer(s.enSede),
      enTransito:integer(s.enTransito),retornoPendiente:integer(s.retornoPendiente),
      vendidos:integer(s.vendidos),sinCosto:integer(s.sinCosto),total:integer(s.total),
    },
    page:integer(r.page),pageSize:integer(r.pageSize),matched:integer(r.matched),
    sites:r.sites.map((v:unknown):DirectorySite=>{
      const x=asObject(v);
      return {id:string(x.id),name:string(x.name),city:string(x.city),siteType:string(x.siteType)};
    }),
    items:r.items.map((v:unknown):ImeiDirectoryRow=>{
      const x=asObject(v);
      if(!states.has(x.custodyState as CustodyState))
        throw new Error("Estado de custodia desconocido.");
      const row:ImeiDirectoryRow={
        unitId:string(x.unitId),serial:string(x.serial),
        productName:string(x.productName),sku:string(x.sku),cost:x.cost===null?null:numeric(x.cost),
        unitStatus:string(x.unitStatus),custodyState:x.custodyState as CustodyState,
        siteId:optional(x.siteId),siteName:optional(x.siteName),
        cityName:optional(x.cityName),historicalLocation:optional(x.historicalLocation),
        committedOrder:bool(x.committedOrder),committedTransfer:bool(x.committedTransfer),
        commercialCandidate:bool(x.commercialCandidate),
        ...parseCatalogMedia(x),
      };
      if(row.commercialCandidate && (row.committedOrder || row.committedTransfer))
        throw new Error("Un IMEI comprometido no puede figurar disponible.");
      if(row.custodyState!=="en_sede" && (row.siteId!==null||row.commercialCandidate))
        throw new Error("No se puede atribuir un IMEI no conciliado a una sede comercial.");
      return row;
    }),
  };
};

export const fetchImeiDirectory=async(options:{
  filter?:CustodyFilter; siteId?:string|null; query?:string;page?:number;pageSize?:number;
}={}):Promise<ImeiDirectoryResponse>=>{
  const {supabase}=await import("@/integrations/supabase/client");
  const {data,error}=await (supabase as unknown as {
    rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message:string}|null}>
  }).rpc("nexora_inventory_imei_directory",{
    p_state:options.filter??"all",
    p_site_id:options.siteId??null,
    p_query:options.query??"",
    p_page:options.page??1,
    p_page_size:options.pageSize??25,
  });
  if(error)throw new Error(error.message);
  return parseImeiDirectory(data);
};
