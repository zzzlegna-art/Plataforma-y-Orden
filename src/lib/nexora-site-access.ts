import { isMultisiteRole, type MultisiteRole } from "./nexora-role-policy";

/**
 * Solo para presentar el alcance de un perfil en la interfaz. La autorización
 * efectiva de escritura queda en PostgreSQL (nexora_can_operate_transfer_site).
 * No usar esta función como sustituto de RPC/RLS del servidor.
 */
export interface SiteStaffMembership {
  userId: string;
  siteId: string;
  role: MultisiteRole;
  isActive: boolean;
}
export interface SiteStaffProfile {
  userId: string;
  role: string;
  isActive: boolean;
}
export interface SiteStaffLocation {
  id: string;
  isActive: boolean;
}

export const canOperateTransferAtSite = (
  profile: SiteStaffProfile | null | undefined,
  site: SiteStaffLocation | null | undefined,
  memberships: readonly SiteStaffMembership[],
): boolean => {
  if (!profile?.userId || !profile.isActive || !site?.id || !site.isActive) return false;
  if (!isMultisiteRole(profile.role)) return false;
  if (profile.role === "admin") return true;

  return memberships.some(
    (membership) => membership.userId === profile.userId
      && membership.siteId === site.id
      && membership.isActive
      && membership.role === profile.role,
  );
};
