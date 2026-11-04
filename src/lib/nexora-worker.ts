/** Sesión y operación multisede de los trabajadores (SIN descargar el legacy). */
export type WorkerRole = "encargado" | "vendedor";
export interface WorkerSession {
  role: WorkerRole;
  siteId: string;
  siteName: string;
}
export interface WorkerSnapshot extends WorkerSession {
  assignedUnits: number;
  unitsWithRealCost: number;
  cashState: "not_opened" | "open" | "closed";
  businessDate: string;
}
const isObject=(x:unknown):x is Record<string,unknown>=>
  Boolean(x)&&typeof x==="object"&&!Array.isArray(x);
const parseSession=(value:unknown):WorkerSession|null=>{
  if(value===null)return null;
  if(!isObject(value)||!["encargado","vendedor"].includes(String(value.role))||
    typeof value.siteId!=="string"||typeof value.siteName!=="string"||
    !/^[a-f0-9-]{36}$/i.test(value.siteId)||!value.siteName.trim())
    throw new Error("El servidor no confirmó una sede autorizada para la sesión.");
  return {role:value.role as WorkerRole,siteId:value.siteId,siteName:value.siteName};
};
const rpc=async(method:string,args?:Record<string,unknown>):Promise<unknown>=>{
  const {supabase}=await import("@/integrations/supabase/client");
  const response=await (supabase as unknown as {
    rpc:(name:string,params?:Record<string,unknown>)=>Promise<{
      data:unknown;error:{message:string}|null
    }>
  }).rpc(method,args);
  if(response.error)throw new Error(response.error.message);
  return response.data;
};
export const getWorkerSession=async():Promise<WorkerSession|null>=>
  parseSession(await rpc("nexora_worker_session"));
export const getWorkerSnapshot=async():Promise<WorkerSnapshot>=>{
  const raw=await rpc("nexora_worker_site_snapshot");
  const session=parseSession(raw);
  if(!session||!isObject(raw)||
    typeof raw.assignedUnits!=="number"||!Number.isSafeInteger(raw.assignedUnits)||
    raw.assignedUnits<0||
    typeof raw.unitsWithRealCost!=="number"||!Number.isSafeInteger(raw.unitsWithRealCost)||
    raw.unitsWithRealCost<0||raw.unitsWithRealCost>raw.assignedUnits||
    !["not_opened","open","closed"].includes(String(raw.cashState))||
    typeof raw.businessDate!=="string")
    throw new Error("Los datos operativos de la sede son inválidos.");
  return {...session,assignedUnits:raw.assignedUnits,
    unitsWithRealCost:raw.unitsWithRealCost,
    cashState:raw.cashState as WorkerSnapshot["cashState"],
    businessDate:raw.businessDate};
};
export const activatePreparedWorker=async(userId:string,siteId:string):Promise<void>=>{
  if(!userId||!siteId)throw new Error("Selecciona la persona y la sede del local.");
  const response=await rpc("nexora_activate_worker",{p_user_id:userId,p_site_id:siteId});
  if(!isObject(response)||response.activated!==true||response.siteId!==siteId)
    throw new Error("La activación no fue confirmada por el servidor.");
};
export const deactivatePreparedWorker=async(userId:string):Promise<void>=>{
  if(!userId)throw new Error("Selecciona el trabajador.");
  const response=await rpc("nexora_deactivate_worker",{p_user_id:userId});
  if(!isObject(response)||response.activated!==false)
    throw new Error("La desactivación no fue confirmada por el servidor.");
};
