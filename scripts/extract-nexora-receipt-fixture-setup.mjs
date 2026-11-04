// CI-only: reuse the schema/seed of the original real-RPC 20→15→5 fixture.
// No Supabase calls, secrets, files from production, or persistent DB writes.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const source=resolve("supabase/tests/rls/nexora_transfer_full_flow_ci_fixture.sql");
const target=resolve("supabase/tests/rls/.nexora-receipt-notes-setup.generated.sql");
const sql=readFileSync(source,"utf8");
const anchor="select set_config('request.jwt.claim.sub',";
const cut=sql.indexOf(anchor);
if(cut<1000 || sql.indexOf(anchor,cut+anchor.length)<0 ||
  !sql.slice(0,cut).includes("begin;") ||
  !sql.slice(0,cut).includes("\\ir .nexora-execute-transfer.generated.sql") ||
  sql.slice(0,cut).includes("rollback;")) {
  throw new Error("El fixture base cambió: revisar la extracción antes de probar notas.");
}
writeFileSync(target,
  "-- Preparación derivada de fixture real, transacción aún abierta.\n"+
  sql.slice(0,cut)+
  "\\ir ../../migrations/20261104182517_nexora_transfer_receive_observations.sql\n"
);
