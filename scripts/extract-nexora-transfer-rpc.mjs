// CI-only extractor: executes the SAME transfer RPC as the shipping migration.
// Never contacts Supabase or any external service.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("supabase/migrations/20261104185000_nexora_roles_inventory_transfer_permissions.sql");
const target = resolve("supabase/tests/rls/.nexora-execute-transfer.generated.sql");
const sql = readFileSync(source,"utf8");
const marker = "CREATE OR REPLACE FUNCTION nexora_internal.execute_transfer(";
const start = sql.indexOf(marker);
const close = "\n$function$;";
const end = sql.indexOf(close, start);
if (start < 0 || end < 0 || sql.indexOf(marker,start+marker.length)!==-1)
  throw new Error("No se identificó de manera única el ejecutor real de traslados.");
const functionSql = sql.slice(start,end+close.length);
if (!functionSql.includes("perform pg_advisory_xact_lock(78192346)") ||
    !functionSql.includes("p_action = 'receive'") ||
    !functionSql.includes("p_action = 'return'") ||
    !functionSql.includes("public.nexora_transfer_return_documents"))
  throw new Error("El ejecutor cambió: actualizar el fixture antes de ejecutar la prueba.");
writeFileSync(target,"-- Función extraída del código fuente; no modificar manualmente.\n"+functionSql+"\n");
