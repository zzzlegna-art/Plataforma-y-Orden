#!/usr/bin/env bash
# Nexora: evita que dos gastos simultaneos sobrepasen el limite diario.
# Corre SOLO en PostgreSQL temporal con datos inventados por las fixtures.
set -euo pipefail

psql -X -v ON_ERROR_STOP=1 <<'SQL'
insert into public.nexora_staff_sites(user_id,site_id)
values ('11111111-1111-4111-8111-111111111111',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
set role authenticated;
select public.nexora_set_cash_limits(
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',400,500);
select public.nexora_cash_operation(
 'open','cccccccc-cccc-4ccc-8ccc-cccccccccccc',1000,null);
SQL

cat > /tmp/nexora-v49-first.sql <<'SQL'
set role authenticated;
select set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
begin;
select public.nexora_cash_operation(
 'expense','cccccccc-cccc-4ccc-8ccc-cccccccccccc',300,
 'Primer gasto concurrente');
select pg_sleep(3);
commit;
SQL

cat > /tmp/nexora-v49-second.sql <<'SQL'
set role authenticated;
select set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
select public.nexora_cash_operation(
 'expense','cccccccc-cccc-4ccc-8ccc-cccccccccccc',300,
 'Segundo gasto concurrente');
SQL

psql -X -v ON_ERROR_STOP=1 -f /tmp/nexora-v49-first.sql > /tmp/nexora-v49-first.log 2>&1 &
first_pid=$!
sleep 1

if psql -X -v ON_ERROR_STOP=1 -f /tmp/nexora-v49-second.sql > /tmp/nexora-v49-second.log 2>&1; then
  cat /tmp/nexora-v49-second.log
  echo "ERROR: se aceptaron ambos gastos concurrentes y se excedió el límite" >&2
  wait "$first_pid"
  exit 1
fi
wait "$first_pid"

if ! grep -qi 'limite diario' /tmp/nexora-v49-second.log; then
  cat /tmp/nexora-v49-second.log
  echo "ERROR: el segundo gasto falló por motivo distinto al límite diario" >&2
  exit 1
fi

count="$(psql -X -At -v ON_ERROR_STOP=1 -c "
 select count(*)::text || ':' || coalesce(sum(e.amount),0)::text
 from public.nexora_cash_expenses e
 join public.nexora_cash_sessions cs on cs.id=e.session_id
 where cs.site_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';")"
if [[ "$count" != "1:300.00" && "$count" != "1:300" ]]; then
  echo "ERROR: esperaba un solo gasto de 300 COP; resultado: $count" >&2
  exit 1
fi

echo "OK: doble gasto concurrente rechazado; solo una transacción de 300 autorizada"
