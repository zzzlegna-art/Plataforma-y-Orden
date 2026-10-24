#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERROR: define SUPABASE_DB_URL en el entorno; no la pegues en el repositorio ni en el chat." >&2
  exit 2
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "ERROR: instala la Supabase CLI antes de ejecutar este script." >&2
  exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: instala Docker; supabase db dump lo necesita para ejecutar pg_dump." >&2
  exit 2
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker está instalado, pero no está iniciado o no está accesible." >&2
  exit 2
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_root="${BACKUP_ROOT:-backups/supabase}"
out="${backup_root%/}/$stamp"

if [[ -e "$out" ]]; then
  echo "ERROR: la carpeta de backup ya existe: $out" >&2
  exit 2
fi

mkdir -p "$out"
chmod 700 "$out"
trap 'rc=$?; if (( rc != 0 )); then echo "ERROR: backup incompleto; revisa y no uses la carpeta: '"$out"'" >&2; fi' EXIT

echo "Exportando roles de PostgreSQL..."
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$out/roles.sql" --role-only

echo "Exportando esquema..."
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$out/schema.sql"

echo "Exportando datos..."
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$out/data.sql" --use-copy --data-only

for file in "$out/roles.sql" "$out/schema.sql" "$out/data.sql"; do
  if [[ ! -s "$file" ]]; then
    echo "ERROR: el archivo esperado no existe o está vacío: $file" >&2
    exit 1
  fi
done

{
  printf 'created_utc=%s\n' "$stamp"
  printf 'project_ref=%s\n' "${SUPABASE_PROJECT_REF:-not_set}"
  printf 'supabase_cli=%s\n' "$(supabase --version 2>/dev/null | head -n 1)"
  printf 'scope=roles, schema, and data from schemas included by Supabase CLI db dump\n'
  printf 'excluded=managed Auth and Storage schemas, Storage object files, Edge Function secrets\n'
} > "$out/MANIFEST.txt"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$out" && sha256sum roles.sql schema.sql data.sql > SHA256SUMS)
elif command -v shasum >/dev/null 2>&1; then
  (cd "$out" && shasum -a 256 roles.sql schema.sql data.sql > SHA256SUMS)
else
  echo "ERROR: se necesita sha256sum o shasum para validar los archivos exportados." >&2
  exit 2
fi

chmod 600 "$out"/*
echo "Backup SQL terminado: $out"
echo "IMPORTANTE: contiene datos sensibles. Cifra la copia antes de subirla fuera del equipo."
echo "Los objetos de Storage y los datos gestionados de Auth no están incluidos; respáldalos por separado."
