/**
 * Nexora Multisede · preparación operacional de solo lectura.
 * Fuente: consulta administrativa calculada por PostgreSQL.
 * Los pasos NO representan autorización para activar roles ni ventas.
 */
export const PREPARATION_STEPS = [
  {
    key:"cities",title:"Registrar las ciudades",
    detail:"Define las ciudades donde funciona tu operación.",
    tab:"sites",action:"Configurar ciudades",
  },
  {
    key:"principal",title:"Configurar sede principal",
    detail:"Identifica el origen central de la mercancía.",
    tab:"sites",action:"Configurar principal",
  },
  {
    key:"warehouses",title:"Crear bodegas regionales",
    detail:"Establece los centros de distribución y su jerarquía.",
    tab:"sites",action:"Configurar bodegas",
  },
  {
    key:"stores",title:"Registrar locales comerciales",
    detail:"Cada punto de venta necesita una sede física válida.",
    tab:"sites",action:"Configurar locales",
  },
  {
    key:"staff",title:"Asignar empleados a sus sedes",
    detail:"Vincula físicamente al personal responsable de cada punto.",
    tab:"sites",action:"Vincular personal",
  },
  {
    key:"rolePlans",title:"Preparar los perfiles operativos",
    detail:"Propón Encargado o Vendedor sin conceder aún permisos anteriores.",
    tab:"roles",action:"Preparar perfiles",
  },
  {
    key:"reconciliation",title:"Certificar el inventario inicial",
    detail:"Bodega 6A ya revisada: declaración administrativa sin escaneos ficticios. Para otras sedes, cotejo físico por IMEI.",
    tab:"sites",action:"Abrir acta inicial",
  },
  {
    key:"roleActivation",title:"Validar activación segura de roles",
    detail:"Pendiente de seguridad completa de RLS, caja y acceso por sede.",
    tab:"roles",action:"Ver controles",
  },
] as const;
export type PreparationKey=(typeof PREPARATION_STEPS)[number]["key"];
export interface PreparationStep {key:PreparationKey;ready:boolean;current:number;total?:number}
export interface StorePreparation {
  siteId:string;name:string;assignedStaff:number;
  managerPlanned:boolean;managerEnabled:boolean;
}
export interface LaunchReadiness {
  checkedAt:string;roleActivationAvailable:false;salesAvailable:false;
  cities:number;principals:number;warehouses:number;stores:number;
  activeAssignments:number;plannedRoles:number;plannedManagers:number;enabledManagers:number;
  initialApproved:boolean;legacyEligibleUnits:number;mappedUnits:number;unmappedUnits:number;
  openCashSessions:number;retailSales:number;
  storeDetails:StorePreparation[];steps:PreparationStep[];
}

const obj=(v:unknown):Record<string,unknown>=>{
  if (!v||typeof v!=="object"||Array.isArray(v)) throw new Error("Diagnóstico del servidor inválido.");
  return v as Record<string,unknown>;
};
const count=(v:unknown):number=>{
  if (typeof v!=="number"||!Number.isSafeInteger(v)||v<0)
    throw new Error("Conteo de Nexora inválido.");
  return v;
};
const text=(v:unknown):string=>{
  if(typeof v!=="string"||!v.trim()) throw new Error("Falta una identificación en el diagnóstico.");
  return v;
};
export const parseLaunchReadiness=(raw:unknown):LaunchReadiness=>{
  const r=obj(raw);
  if(r.roleActivationAvailable!==false||r.salesAvailable!==false||
    typeof r.initialApproved!=="boolean"||
    !Array.isArray(r.steps)||!Array.isArray(r.storeDetails))
    throw new Error("Los controles de preparación de Nexora no son verificables.");

  const steps=r.steps.map((value:unknown):PreparationStep=>{
    const s=obj(value);
    const key=PREPARATION_STEPS.find(x=>x.key===s.key)?.key;
    if (!key||typeof s.ready!=="boolean") throw new Error("Paso de preparación desconocido.");
    return {
      key,ready:s.ready,current:count(s.current),
      ...(s.total===undefined?{}:{total:count(s.total)}),
    };
  });
  if(steps.length!==PREPARATION_STEPS.length||
    new Set(steps.map(s=>s.key)).size!==PREPARATION_STEPS.length)
    throw new Error("Falta una validación obligatoria de lanzamiento.");

  return {
    checkedAt:text(r.checkedAt),roleActivationAvailable:false,salesAvailable:false,
    cities:count(r.cities),principals:count(r.principals),
    warehouses:count(r.warehouses),stores:count(r.stores),
    activeAssignments:count(r.activeAssignments),
    plannedRoles:count(r.plannedRoles),plannedManagers:count(r.plannedManagers),
    enabledManagers:count(r.enabledManagers),
    initialApproved:r.initialApproved,
    legacyEligibleUnits:count(r.legacyEligibleUnits),
    mappedUnits:count(r.mappedUnits),unmappedUnits:count(r.unmappedUnits),
    openCashSessions:count(r.openCashSessions),retailSales:count(r.retailSales),
    storeDetails:r.storeDetails.map((value:unknown):StorePreparation=>{
      const s=obj(value);
      if(typeof s.managerPlanned!=="boolean"||typeof s.managerEnabled!=="boolean")
        throw new Error("Permisos de Encargado inválidos.");
      return {
        siteId:text(s.siteId),name:text(s.name),
        assignedStaff:count(s.assignedStaff),
        managerPlanned:s.managerPlanned,managerEnabled:s.managerEnabled,
      };
    }),
    steps,
  };
};

export const getLaunchReadiness=async():Promise<LaunchReadiness>=>{
  const {supabase}=await import("@/integrations/supabase/client");
  const {data,error}=await (supabase as unknown as {
    rpc:(name:string)=>Promise<{data:unknown;error:{message:string}|null}>
  }).rpc("nexora_launch_readiness");
  if(error)throw new Error(error.message);
  return parseLaunchReadiness(data);
};
