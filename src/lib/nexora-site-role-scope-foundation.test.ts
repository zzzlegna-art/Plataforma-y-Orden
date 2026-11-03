import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MULTISITE_CAPABILITIES } from "./nexora-role-policy";

const migration=readFileSync(
  new URL("../../supabase/migrations/20261103080000_nexora_site_role_scope_basis.sql", import.meta.url),
  "utf8",
);

/** Las dos consultas globales requieren su propia política de lectura RLS. */
const globalReadOnly=new Set([
  "inventory.view", "inventory.imei.cost.view",
]);

describe("Nexora V4 · fundamento privado de alcance por rol y sede",()=>{
  it("contempla todas las capacidades que requieren alcance operativo",()=>{
    for(const capability of MULTISITE_CAPABILITIES){
      if(globalReadOnly.has(capability.key))continue;
      expect(migration,capability.key).toContain(`'${capability.key}'`);
    }
  });
  it("no expone SECURITY DEFINER a usuarios API ni activa roles",()=>{
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(/search_path\s*=\s*pg_catalog/i);
    expect(migration).toMatch(/revoke all on function nexora_internal\.site_role_scope_basis\(uuid,text\)/i);
    expect(migration).toMatch(/from public,anon,authenticated/i);
    expect(migration).not.toMatch(/grant\s+execute\s+on\s+function/i);
    expect(migration).not.toMatch(/alter\s+table\s+public\.nexora_staff_role_plans/i);
    expect(migration).not.toMatch(/drop\s+constraint/i);
  });
  it("separa despacho y recepción por sede, sin ejecución pública",()=>{
    expect(migration).toContain("create or replace function nexora_internal.transfer_actor_scope_basis(");
    expect(migration).toMatch(/revoke all on function nexora_internal\.transfer_actor_scope_basis\(text,uuid,uuid\)/);
    expect(migration).toContain("when p_action='receive' then p_destination");
    expect(migration).toContain("else p_origin");
    expect(migration).toContain("p_action not in ('create','dispatch','receive','return','cancel')");
    expect(migration).toContain("d.parent_site_id=o.id");
    expect(migration).not.toMatch(/create or replace function nexora_internal\.execute_transfer/i);
  });
  it("aplica sede activa, vinculación vigente y denegación para capacidad desconocida",()=>{
    expect(migration).toMatch(/s\.id=p_site_id and s\.is_active/);
    expect(migration).toMatch(/ss\.user_id=v_actor and ss\.site_id=p_site_id and ss\.is_active/);
    expect(migration).toMatch(/p_capability not in/);
    expect(migration).toMatch(/return false/);
    expect(migration).toContain("v_role_enabled and v_planned_role in ('encargado','vendedor')");
  });
});
