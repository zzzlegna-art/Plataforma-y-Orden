-- NEXORA Multisede 2.0
-- Comprobaciones de staging, SOLO LECTURA (después de aplicar las dos migraciones).
-- La ejecución de este archivo no crea, mueve ni elimina inventario.
--
-- Debe ejecutarse con una cuenta administrativa de PostgreSQL EN STAGING.
-- NO sustituye las pruebas de usuario con sesión autenticada, RLS y RPC.

begin transaction read only;

do $$
declare
  v_table text;
  v_trigger text;
begin
  foreach v_table in array array[
    'nexora_cities',
    'nexora_sites',
    'nexora_site_memberships',
    'nexora_transfers',
    'nexora_transfer_units',
    'nexora_transfer_events'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'Falta tabla multisede: %', v_table;
    end if;

    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table and c.relrowsecurity
    ) then
      raise exception 'RLS deshabilitada en %', v_table;
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bodega_units'
      and column_name = 'site_id' and is_nullable = 'YES'
  ) then
    raise exception 'El IMEI legacy debe conservar site_id opcional hasta conciliación.';
  end if;

  foreach v_table in array array[
    'nexora_transfers','nexora_transfer_units','nexora_transfer_events'
  ] loop
    if has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
      or has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
      or has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
    then
      raise exception '% no debe permitir escritura directa del cliente.', v_table;
    end if;
    if not has_table_privilege('authenticated', 'public.' || v_table, 'SELECT') then
      raise exception '% debe permitir consulta sujeta a RLS.', v_table;
    end if;
  end loop;

  foreach v_trigger in array array[
    'nexora_guard_legacy_site_assignment_trigger',
    'nexora_block_unmigrated_roles_trigger',
    'nexora_validate_transfer_route_trigger',
    'nexora_transfer_events_block_changes'
  ] loop
    if not exists (
      select 1 from pg_trigger
      where tgname = v_trigger and not tgisinternal
    ) then
      raise exception 'Falta protección de servidor: %', v_trigger;
    end if;
  end loop;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'nexora_transfer_units'
      and indexname = 'nexora_transfer_single_open_unit_idx'
  ) then
    raise exception 'Falta exclusión de IMEI entre traslados abiertos.';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'nexora_transfers'
      and indexname = 'nexora_transfer_only_one_return_idx'
  ) then
    raise exception 'Falta exclusión de devoluciones duplicadas.';
  end if;

  raise notice 'Controles estructurales multisede correctos: revisar RLS por sesión y pruebas operacionales.';
end $$;

rollback;
