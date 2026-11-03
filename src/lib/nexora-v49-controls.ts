/**
 * Nexora V4.9: reglas de activación local y límites monetarios de gastos.
 * Todas las autorizaciones se vuelven a comprobar en las RPC de Supabase.
 */
export interface NexoraLocalInitialStatus {
  siteId: string;
  siteName: string;
  initialCount: number;
  globalApproved: boolean;
  approved: boolean;
  approvedAt: string | null;
  approvedCount: number | null;
}
export interface NexoraCashLimit {
  siteId: string;
  siteName: string;
  configured: boolean;
  maxPerExpense: number | null;
  maxPerDay: number | null;
  updatedAt: string | null;
}
type Obj = Record<string,unknown>;
const object = (raw: unknown): Obj => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Respuesta inválida de Nexora.");
  return raw as Obj;
};
const nonnegativeInt = (x: unknown): number => {
  if (typeof x !== "number" || !Number.isSafeInteger(x) || x < 0)
    throw new Error("Conteo inválido recibido desde el servidor.");
  return x;
};
const amountOrNull = (x: unknown): number | null => {
  if (x === null) return null;
  if (typeof x !== "number" || !Number.isFinite(x) || x < 0)
    throw new Error("Monto de caja inválido en el servidor.");
  return x;
};
const dateOrNull = (x: unknown): string|null => {
  if (x === null) return null;
  if (typeof x !== "string") throw new Error("Fecha inválida.");
  return x;
};
export const parseLocalInitialStatus = (raw: unknown): NexoraLocalInitialStatus[] => {
  if (!Array.isArray(raw)) throw new Error("No se recibió el listado de locales.");
  return raw.map((item: unknown) => {
    const row = object(item);
    if (typeof row.siteId !== "string" || typeof row.siteName !== "string" ||
      typeof row.globalApproved !== "boolean" || typeof row.approved !== "boolean")
      throw new Error("Estado de inventario local inválido.");
    return {
      siteId: row.siteId, siteName: row.siteName,
      initialCount: nonnegativeInt(row.initialCount),
      globalApproved: row.globalApproved, approved: row.approved,
      approvedAt: dateOrNull(row.approvedAt),
      approvedCount: row.approvedCount === null ? null : nonnegativeInt(row.approvedCount),
    };
  });
};
export const parseCashLimits = (raw: unknown): NexoraCashLimit[] => {
  if (!Array.isArray(raw)) throw new Error("No se recibió el listado de límites.");
  return raw.map((item: unknown) => {
    const row=object(item);
    if (typeof row.siteId !== "string" || typeof row.siteName !== "string" ||
      typeof row.configured !== "boolean") throw new Error("Límites de local inválidos.");
    const perExpense=amountOrNull(row.maxPerExpense);
    const perDay=amountOrNull(row.maxPerDay);
    if (row.configured && (perExpense === null || perDay === null))
      throw new Error("Límite incompleto para un local configurado.");
    return {
      siteId:row.siteId, siteName:row.siteName, configured:row.configured,
      maxPerExpense:perExpense,maxPerDay:perDay,updatedAt:dateOrNull(row.updatedAt),
    };
  });
};
export const validateCashLimits = (perExpense: number, perDay: number): string|null => {
  for(const value of [perExpense,perDay]){
    if (!Number.isFinite(value) || value < 0 || value > 99999999999999.99 ||
      Math.round(value*100)/100 !== value)
      return "Los límites deben ser montos no negativos y tener máximo dos decimales.";
  }
  return null;
};
async function rpc(name:string,params?:Obj):Promise<unknown>{
  const { supabase }=await import("@/integrations/supabase/client");
  const result=await (supabase as unknown as {
    rpc:(method:string,values?:Obj)=>Promise<{data:unknown;error:{message:string}|null}>
  }).rpc(name,params);
  if(result.error) throw new Error(result.error.message);
  return result.data;
}
export const getLocalInitialStatus=async ():Promise<NexoraLocalInitialStatus[]> =>
  parseLocalInitialStatus(await rpc("nexora_local_initial_status"));
export const approveLocalInitial=async(siteId:string,note:string,ack:string):Promise<void>=>{
  if(!siteId || ack !== "APROBAR" || note.trim().length<10 || note.trim().length>500)
    throw new Error("Escribe APROBAR y registra una verificación de 10 a 500 caracteres.");
  object(await rpc("nexora_approve_local_initial",
    {p_site_id:siteId,p_acknowledgment:ack,p_note:note.trim()}));
};
export const getCashLimits=async():Promise<NexoraCashLimit[]> =>
  parseCashLimits(await rpc("nexora_cash_limit_report"));
export const saveCashLimits=async(siteId:string,perExpense:number,perDay:number):Promise<void>=>{
  const error=validateCashLimits(perExpense,perDay);
  if(error) throw new Error(error);
  if(!siteId) throw new Error("Falta seleccionar el local.");
  object(await rpc("nexora_set_cash_limits",
    {p_site_id:siteId,p_per_expense:perExpense,p_per_day:perDay}));
};
