import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Preflight estatico de migraciones multisede.
 * NO sustituye ejecutar PostgreSQL y probar RLS con usuarios reales en staging.
 */
const readSql = (name: string) =>
  readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

const migrations = [
  "20261101040000_nexora_multisite_catalog.sql",
  "20261101140000_nexora_transfer_documents_staging.sql",
  "20261101180000_nexora_transfer_atomic_staging.sql",
] as const;

describe("preflight de migraciones multisede (sin ejecutar sobre inventario)", () => {
  it.each(migrations)("tiene los cuerpos PL/pgSQL delimitados correctamente: %s", (name) => {
    const sql = readSql(name);
    expect(sql.includes("as $\n")).toBe(false);
    expect(sql.includes("end; $;")).toBe(false);
    const delimiterCount = sql.split("$$").length - 1;
    expect(delimiterCount).toBeGreaterThan(0);
    expect(delimiterCount % 2).toBe(0);
  });

  it("no asigna por suposiciones las ubicaciones de los IMEI antiguos", () => {
    const sql = readSql(migrations[0]);
    expect(sql).toContain("add column site_id uuid");
    expect(sql).not.toMatch(/update\s+public\.bodega_units\s+set\s+site_id\s*=/i);
    expect(sql).toContain("nexora_guard_legacy_site_assignment");
    expect(sql).toContain("nexora_block_unmigrated_roles");
  });

  it("impide escrituras directas y duplicación de IMEI en traslados abiertos", () => {
    const sql = readSql(migrations[1]);
    expect(sql).toContain("nexora_transfer_single_open_unit_idx");
    expect(sql).toContain("nexora_transfer_only_one_return_idx");
    expect(sql).toContain("nexora_transfer_events_block_changes");
    expect(sql).toContain("nexora_validate_transfer_route_trigger");
    expect(sql).toContain("nexora_prevent_open_transfer_restock_trigger");
    for (const table of ["nexora_transfers", "nexora_transfer_units", "nexora_transfer_events"]) {
      expect(sql).toContain(`grant select on public.${table} to authenticated;`);
      expect(sql).not.toContain(`grant insert on public.${table} to authenticated;`);
    }
  });

  it("protege cada RPC con autorizacion efectiva del servidor y revocacion anonima", () => {
    const sql = readSql(migrations[2]);
    for (const method of [
      "nexora_dispatch_transfer", "nexora_receive_transfer", "nexora_verify_origin_return",
    ]) {
      expect(sql).toContain(`create function public.${method}(`);
      expect(sql).toContain(`revoke all on function public.${method}(`);
    }
    expect(sql).toMatch(/auth\.uid\(\)/i);
    expect(sql).toMatch(/bodega_is_admin\(\)/i);
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("receipt_decisions");
    expect(sql).toContain("status='en_transito'");
    expect(sql).toContain("retorno_faltantes");
  });
});
