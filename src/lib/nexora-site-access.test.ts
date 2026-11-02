import { describe, expect, it } from "vitest";
import { canOperateTransferAtSite, type SiteStaffMembership } from "./nexora-site-access";

const activeSite = { id: "bodega-a", isActive: true };
const otherSite = { id: "local-b", isActive: true };
const activeUser = { userId: "user-1", role: "bodeguero", isActive: true };

const member = (patch: Partial<SiteStaffMembership> = {}): SiteStaffMembership => ({
  userId: "user-1", siteId: "bodega-a", role: "bodeguero", isActive: true, ...patch,
});

describe("Acceso por sede: política espejo para la interfaz", () => {
  it("permite que el Administrador activo gestione cualquier sede activa", () => {
    expect(canOperateTransferAtSite({ ...activeUser, role: "admin" }, activeSite, [])).toBe(true);
    expect(canOperateTransferAtSite({ ...activeUser, role: "admin" }, otherSite, [])).toBe(true);
    expect(canOperateTransferAtSite({ ...activeUser, role: "admin" }, { ...otherSite, isActive: false }, [])).toBe(false);
  });

  it.each(["bodeguero", "encargado", "vendedor"])(
    "permite gestionar traslados de la sede asignada al perfil %s", (role) => {
      expect(canOperateTransferAtSite(
        { ...activeUser, role },
        activeSite,
        [member({ role: role as SiteStaffMembership["role"] })],
      )).toBe(true);
    },
  );

  it("impide operaciones en ciudades y sedes no asignadas", () => {
    expect(canOperateTransferAtSite(activeUser, otherSite, [member()])).toBe(false);
  });

  it("rechaza perfiles suspendidos y asignaciones inactivas", () => {
    expect(canOperateTransferAtSite({ ...activeUser, isActive: false }, activeSite, [member()])).toBe(false);
    expect(canOperateTransferAtSite(activeUser, activeSite, [member({ isActive: false })])).toBe(false);
  });

  it("no acepta roles falsificados en la membresía", () => {
    expect(canOperateTransferAtSite(activeUser, activeSite, [member({ role: "admin" })])).toBe(false);
    expect(canOperateTransferAtSite(activeUser, activeSite, [member({ role: "vendedor" })])).toBe(false);
  });

  it("no permite utilizar la membresía de otro usuario", () => {
    expect(canOperateTransferAtSite(activeUser, activeSite, [member({ userId: "user-2" })])).toBe(false);
  });

  it("no da permisos a roles inexistentes o sin inicio de sesión", () => {
    expect(canOperateTransferAtSite({ ...activeUser, role: "finanzas" }, activeSite, [member()])).toBe(false);
    expect(canOperateTransferAtSite(null, activeSite, [member()])).toBe(false);
  });
});
