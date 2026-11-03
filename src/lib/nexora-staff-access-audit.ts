export interface StaffSiteAuditRow {
  userId:string;fullName:string;email:string;legacyRole:string;
  plannedRole:string|null;staffActive:boolean;roleEnabled:boolean;
  siteId:string|null;siteName:string|null;siteType:string|null;
  siteActive:boolean;assignmentActive:boolean;
  canReadWarehouseLegacy:boolean;canOperateStore:boolean;
  canOperateCash:boolean;canSellRetail:boolean;reason:string;
}
export interface StaffSiteAudit {
  checkedAt:string;operationalRoleActivationSupported:false;
  staff:StaffSiteAuditRow[];
}
export const ACCESS_REASONS:Record<string,string>={
  STAFF_INACTIVE:"Usuario inactivo",
  ADMIN_GLOBAL:"Administrador global (sin sede asignada)",
  ROLE_NOT_PLANNED:"Perfil operativo sin preparar",
  SITE_NOT_ASSIGNED:"Sede sin asignar o inactiva",
  ROLE_NOT_ENABLED:"Perfil planificado, todavía sin activar",
  NOT_A_STORE:"El perfil comercial necesita un local",
  ROLE_READY:"Perfil y sede operativamente habilitados",
  NOT_AUTHORIZED:"Operación no autorizada",
};
const object=(v:unknown):Record<string,unknown>=>{
  if(!v||typeof v!=="object"||Array.isArray(v))throw Error("Auditoría inválida.");
  return v as Record<string,unknown>;
};
const requiredString=(v:unknown):string=>{
  if(typeof v!=="string"||!v.trim())throw Error("Identificación de personal inválida.");
  return v;
};
const bool=(v:unknown):boolean=>{
  if(typeof v!=="boolean")throw Error("Un permiso carece de validación.");
  return v;
};
const optional=(v:unknown):string|null=>{
  if(v===null)return null;
  return requiredString(v);
};
export const parseStaffSiteAudit=(input:unknown):StaffSiteAudit=>{
  const d=object(input);
  if(d.operationalRoleActivationSupported!==false||!Array.isArray(d.staff))
    throw Error("El servidor no confirmó los bloqueos de roles.");
  return {
    checkedAt:requiredString(d.checkedAt),operationalRoleActivationSupported:false,
    staff:d.staff.map((v:unknown):StaffSiteAuditRow=>{
      const r=object(v);
      if(!ACCESS_REASONS[String(r.reason)])
        throw Error("Causa de acceso desconocida.");
      if(r.roleEnabled===true||r.canOperateStore===true||
        r.canOperateCash===true||r.canSellRetail===true)
        throw Error("La auditoría indica un permiso comercial activo cuando la activación global sigue bloqueada.");
      return {
        userId:requiredString(r.userId),fullName:requiredString(r.fullName),
        email:requiredString(r.email),legacyRole:requiredString(r.legacyRole),
        plannedRole:optional(r.plannedRole),
        staffActive:bool(r.staffActive),roleEnabled:bool(r.roleEnabled),
        siteId:optional(r.siteId),siteName:optional(r.siteName),
        siteType:optional(r.siteType),siteActive:bool(r.siteActive),
        assignmentActive:bool(r.assignmentActive),
        canReadWarehouseLegacy:bool(r.canReadWarehouseLegacy),
        canOperateStore:bool(r.canOperateStore),
        canOperateCash:bool(r.canOperateCash),
        canSellRetail:bool(r.canSellRetail),reason:requiredString(r.reason),
      };
    }),
  };
};
/**
 * Diagnóstico preparatorio por local. No concede permisos ni sustituye a RLS/RPC.
 * Incluye locales sin empleados para evitar que desaparezcan los pendientes.
 */
export interface StoreRoleReadiness {
  siteId:string;siteName:string;assignedStaff:number;
  plannedManagers:number;plannedSellers:number;
  blockers:readonly string[];
}
export const summarizeStoreRoleReadiness=(
  sites:readonly import("./nexora-sites").NexoraSite[],
  audit:StaffSiteAudit,
):StoreRoleReadiness[]=>{
  if(audit.operationalRoleActivationSupported!==false)
    throw new Error("No está verificada la protección global de perfiles.");
  // El contrato actual de Supabase bloquea TODOS los accesos comerciales.
  // Rechazar una respuesta contradictoria antes de mostrarla como preparación.
  if(audit.staff.some(row=>row.roleEnabled||row.canOperateStore||
    row.canOperateCash||row.canSellRetail))
    throw new Error("La auditoría informa permisos comerciales incompatibles con el bloqueo global.");
  return sites.filter(site=>site.siteType==="local"&&site.isActive).map(site=>{
    const assigned=new Map(audit.staff.filter(row=>row.siteId===site.id&&
      row.staffActive&&row.assignmentActive&&row.siteActive&&
      row.legacyRole!=="admin").map(row=>[row.userId,row]));
    const staff=[...assigned.values()];
    const managers=staff.filter(row=>row.plannedRole==="encargado").length;
    const sellers=staff.filter(row=>row.plannedRole==="vendedor").length;
    const blockers:string[]=[];
    if(staff.length===0)blockers.push("No hay personal operativo activo vinculado a este local.");
    if(managers===0)blockers.push("Falta preparar al menos un Encargado para la caja.");
    blockers.push("Activación de roles pendiente de controles RLS y pruebas por sede.");
    return {
      siteId:site.id,siteName:site.name,assignedStaff:staff.length,
      plannedManagers:managers,plannedSellers:sellers,blockers,
    };
  });
};

export const getStaffSiteAudit=async():Promise<StaffSiteAudit>=>{
  const {supabase}=await import("@/integrations/supabase/client");
  const {data,error}=await (supabase as unknown as {
    rpc:(method:string)=>Promise<{data:unknown;error:{message:string}|null}>
  }).rpc("nexora_staff_access_audit");
  if(error)throw Error(error.message);
  return parseStaffSiteAudit(data);
};
