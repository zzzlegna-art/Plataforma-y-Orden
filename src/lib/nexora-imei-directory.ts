import { parseCatalogMedia, type CatalogMedia } from "./nexora-worker-catalog-media";

/** Consulta de solo lectura de seriales y trazabilidad operativa de Bodega 6A. */
export type CustodyState =
  | "sin_conciliar" | "en_sede" | "en_transito" | "retorno_pendiente" | "vendido";
export type CustodyFilter = CustodyState | "all";

export interface ImeiDirectoryRow extends CatalogMedia {
  unitId: string;
  serial: string;
  productName: string;
  sku: string;
  unitStatus: string;
  custodyState: CustodyState;
  historicalLocation: string | null;
  committedOrder: boolean;
}
export interface DirectorySummary {
  sinConciliar: number;
  enSede: number;
  enTransito: number;
  retornoPendiente: number;
  vendidos: number;
  total: number;
}
export interface ImeiDirectoryResponse {
  initialApproved: boolean;
  summary: DirectorySummary;
  items: ImeiDirectoryRow[];
  page: number;
  pageSize: number;
  matched: number;
}

export const CUSTODY_FILTERS: readonly { value: CustodyFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "sin_conciliar", label: "Sin conciliar" },
  { value: "en_sede", label: "En Bodega 6A" },
  { value: "en_transito", label: "En tránsito" },
  { value: "retorno_pendiente", label: "Retorno pendiente" },
  { value: "vendido", label: "Salidas históricas" },
];
export const CUSTODY_LABEL: Record<CustodyState,string> = {
  sin_conciliar:"Pendiente de conciliación",
  en_sede:"En Bodega 6A",
  en_transito:"En tránsito",
  retorno_pendiente:"Retorno pendiente",
  vendido:"Salida histórica",
};

const asObject=(input:unknown):Record<string,unknown>=>{
  if(!input||typeof input!=="object"||Array.isArray(input))
    throw new Error("El servidor devolvió datos de inventario inválidos.");
  return input as Record<string,unknown>;
};
const numeric=(v:unknown):number=>{
  if(typeof v!=="number"||!Number.isFinite(v)||v<0)
    throw new Error("Cantidad de inventario inválida.");
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
  if(!Array.isArray(r.items))
    throw new Error("Falta la lista paginada de IMEI.");
  return {
    initialApproved:bool(r.initialApproved),
    summary:{
      sinConciliar:integer(s.sinConciliar),enSede:integer(s.enSede),
      enTransito:integer(s.enTransito),retornoPendiente:integer(s.retornoPendiente),
      vendidos:integer(s.vendidos),total:integer(s.total),
    },
    page:integer(r.page),pageSize:integer(r.pageSize),matched:integer(r.matched),
    items:r.items.map((v:unknown):ImeiDirectoryRow=>{
      const x=asObject(v);
      if(!states.has(x.custodyState as CustodyState))
        throw new Error("Estado de custodia desconocido.");
      return {
        unitId:string(x.unitId),serial:string(x.serial),
        productName:string(x.productName),sku:string(x.sku),
        unitStatus:string(x.unitStatus),custodyState:x.custodyState as CustodyState,
        historicalLocation:optional(x.historicalLocation),
        committedOrder:bool(x.committedOrder),
        ...parseCatalogMedia(x),
      };
    }),
  };
};

export const fetchImeiDirectory=async(options:{
  filter?:CustodyFilter; query?:string;page?:number;pageSize?:number;
}={}):Promise<ImeiDirectoryResponse>=>{
  const {supabase}=await import("@/integrations/supabase/client");
  const {data,error}=await (supabase as unknown as {
    rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message:string}|null}>
  }).rpc("nexora_inventory_imei_directory",{
    p_state:options.filter??"all",
    p_site_id:null,
    p_query:options.query??"",
    p_page:options.page??1,
    p_page_size:options.pageSize??25,
  });
  if(error)throw new Error(error.message);
  return parseImeiDirectory(data);
};
