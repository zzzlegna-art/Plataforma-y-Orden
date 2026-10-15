import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../supabase/migrations/00000000000013_audit_history_rls.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("audit and history RLS migration contract", () => {
  it("attributes audit inserts to the signed-in staff member", () => {
    expect(sql).toMatch(/create policy bodega_audit_logs_insert[\s\S]*?with check \(public\.bodega_is_staff\(\) and user_id = \(select auth\.uid\(\)\)\)/);
  });
  it("overrides spoofed audit identity with the signed-in JWT", () => {
    expect(sql).toContain("new.user_id := auth.uid()");
    expect(sql).toContain("new.user_email := auth.jwt() ->> ''email''");
    expect(sql).toContain("before insert on public.bodega_audit_logs");
  });
  it("blocks cascading deletion of warranty events", () => {
    expect(sql).toContain("raise exception ''bodega_historial_garantia_inmutable''");
    expect(sql).toContain("before delete on public.bodega_warranty_events");
  });
  it("keeps warranty events append-only and attributed", () => {
    expect(sql).toMatch(/create policy bodega_warranty_events_read[\s\S]*?for select to authenticated/);
    expect(sql).toMatch(/create policy bodega_warranty_events_insert[\s\S]*?created_by = \(select auth\.uid\(\)\)/);
    expect(sql).toMatch(/revoke update, delete on public\.bodega_warranty_events from authenticated/);
    expect(sql).not.toMatch(/create policy bodega_warranty_events_all/);
  });
  it("removes write access to existing audit and stock movement history", () => {
    expect(sql).toMatch(/revoke update, delete on public\.bodega_audit_logs from authenticated/);
    expect(sql).toMatch(/revoke update, delete on public\.bodega_movements from authenticated/);
  });
  it("runs in one transaction", () => {
    expect(sql.trim()).toMatch(/^--[\s\S]*?begin;/);
    expect(sql.trim()).toMatch(/commit;$/);
  });
});
