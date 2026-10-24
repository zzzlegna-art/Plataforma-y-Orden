import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261024231500_nexora_least_privilege_defaults.sql", import.meta.url),
  "utf8",
).toLowerCase();
const normalizedMigration = migration.replace(/\s+/g, " ").trim();
const liveAudit = readFileSync(
  new URL("../../supabase/tests/rls/rls_role_isolation_tests.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("Nexora final least-privilege migration contract", () => {
  it("removes anonymous access to current public tables, sequences and RPC functions", () => {
    expect(normalizedMigration).toContain("revoke all privileges on all tables in schema public from anon");
    expect(normalizedMigration).toContain("revoke all privileges on all sequences in schema public from anon");
    expect(normalizedMigration).toContain("revoke execute on all functions in schema public from public, anon");
  });

  it("removes table privileges that RLS cannot constrain without removing normal CRUD", () => {
    expect(normalizedMigration).toContain(
      "revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated",
    );
    expect(normalizedMigration).not.toMatch(
      /revoke\s+(?:all|select|insert|update|delete)\s+on\s+all\s+tables\s+in\s+schema\s+public\s+from\s+authenticated/,
    );
  });

  it("hardens defaults for the verified application object owner", () => {
    expect(normalizedMigration).toContain(
      "alter default privileges for role postgres in schema public revoke all on tables from anon",
    );
    expect(normalizedMigration).toContain(
      "alter default privileges for role postgres in schema public revoke all on sequences from anon",
    );
    expect(normalizedMigration).toContain(
      "alter default privileges for role postgres in schema public revoke execute on functions from public, anon",
    );
    expect(normalizedMigration).toContain("all 18 application functions and all 51 public relations are owned by postgres");
  });

  it("preserves authenticated RPC access but protects the Auth bootstrap trigger", () => {
    expect(normalizedMigration).toContain("grant execute on all functions in schema public to authenticated, service_role");
    expect(normalizedMigration).toContain(
      "revoke execute on function public.bodega_handle_new_user() from authenticated",
    );
  });

  it("documents the managed-role limitation instead of claiming its defaults were changed", () => {
    expect(normalizedMigration).toContain("managed supabase_admin role is not a member");
    expect(normalizedMigration).toContain("provider-owned objects are outside");
  });

  it("includes live assertions for operational RLS, least privilege and private warranty files", () => {
    expect(liveAudit).toContain("operational tables missing rls/policies");
    expect(liveAudit).toContain("api roles retain unnecessary table-level privileges");
    expect(liveAudit).toContain("anon can execute a public-schema function");
    expect(liveAudit).toContain("warranty-documents bucket must remain private");
    expect(liveAudit).toContain("append-only audit, warranty, or stock history is mutable");
  });

  it("keeps the migration transactional", () => {
    expect(migration.trim()).toMatch(/^--[\s\S]*?begin;/);
    expect(migration.trim()).toMatch(/commit;$/);
  });
});
