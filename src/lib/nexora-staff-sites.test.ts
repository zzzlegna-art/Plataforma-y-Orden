import { describe, expect, it } from "vitest";
import { canAssignStaffToSite, type StaffMember, type StaffSiteAssignment } from "./nexora-staff-sites";
import type { NexoraSite } from "./nexora-sites";

const people: StaffMember[] = [
  { id: "u1", name: "Empleado A", email: "empleado@example.com", role: "bodeguero", isActive: true },
  { id: "u2", name: "Empleado B", email: "inactivo@example.com", role: "bodeguero", isActive: false },
];
const sites: NexoraSite[] = [
  { id: "s1", name: "Bodega central", cityId: "c1", siteType: "principal", parentSiteId: null, address: null, isActive: true },
  { id: "s2", name: "Local", cityId: "c1", siteType: "local", parentSiteId: "s1", address: null, isActive: false },
];
const relation: StaffSiteAssignment = {
  id: "r1", userId: "u1", siteId: "s1", isActive: true, createdAt: "2026-11-02",
};

describe("Asignaciones Nexora Multisede 2.0", () => {
  it("permite a un empleado activo vincularse a una sede activa", () => {
    expect(canAssignStaffToSite("u1", "s1", people, sites, [])).toBeNull();
  });
  it("rechaza perfiles inactivos, desconocidos y puntos inactivos", () => {
    expect(canAssignStaffToSite("u2", "s1", people, sites, [])).toMatch(/activo/);
    expect(canAssignStaffToSite("u3", "s1", people, sites, [])).toMatch(/activo/);
    expect(canAssignStaffToSite("u1", "s2", people, sites, [])).toMatch(/sede activa/);
    expect(canAssignStaffToSite("u1", "s3", people, sites, [])).toMatch(/sede activa/);
  });
  it("no duplica vínculos existentes: los desactivados se reactivan", () => {
    expect(canAssignStaffToSite("u1", "s1", people, sites, [relation])).toMatch(/ya tiene/);
    expect(canAssignStaffToSite("u1", "s1", people, sites, [{ ...relation, isActive: false }]))
      .toMatch(/reactívalo/);
  });
  it("no concede permisos ni modifica inventario en el validador", () => {
    const input = [relation];
    const copy = structuredClone(input);
    expect(canAssignStaffToSite("u1", "s1", people, sites, input)).not.toBeNull();
    expect(input).toEqual(copy);
  });
});
