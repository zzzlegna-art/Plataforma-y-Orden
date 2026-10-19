import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261019011317_secure_public_signup_defaults.sql", import.meta.url),
  "utf8",
).toLowerCase();

const userManagement = readFileSync(
  new URL("../../supabase/functions/bodega-gestion-usuarios/index.ts", import.meta.url),
  "utf8",
).toLowerCase();

describe("secure public sign-up defaults", () => {
  it("serializes the first-admin bootstrap to avoid two first users becoming admins", () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtext('bodega_first_user_admin'))");
  });

  it("creates later profiles as inactive bodegueros", () => {
    expect(migration).toContain("case when v_hay_perfil then 'bodeguero' else 'admin' end");
    expect(migration).toContain("not v_hay_perfil");
  });

  it("activates accounts created through the admin-managed flow", () => {
    expect(userManagement).toContain(".update({ role: rol, full_name: nombre, email, is_active: true })");
  });

  it("preserves password whitespace instead of silently changing the chosen password", () => {
    expect(userManagement).toContain('typeof body.password === "string" ? body.password : ""');
  });

  it("cleans up a newly created Auth user if assigning its profile fails", () => {
    expect(userManagement).toContain("admin.auth.admin.deleteuser(data.user.id)");
  });
});
