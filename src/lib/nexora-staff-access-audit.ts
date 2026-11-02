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
export const getStaffSiteAudit=async():Promise<StaffSiteAudit>=>{
  const {supabase}=await import("@/integrations/supabase/client");
  const {data,error}=await (supabase as unknown as {
    rpc:(method:string)=>Promise<{data:unknown;error:{message:string}|null}>
  }).rpc("nexora_staff_access_audit");
  if(error)throw Error(error.message);
  return parseStaffSiteAudit(data);
};
