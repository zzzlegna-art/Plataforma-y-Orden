-- Nexora final RLS/privilege audit.
-- Run against the target Supabase project after applying all migrations.
-- Legacy tables with RLS enabled and no policy intentionally deny API access;
-- only operational bodega_* tables are required to have explicit policies.
begin;

do $$
declare
  v_bad text;
begin
  select string_agg(format('%I', tablename), ', ' order by tablename)
    into v_bad
    from pg_tables
   where schemaname = 'public'
     and not rowsecurity;
  if v_bad is not null then
    raise exception 'Security failure: public tables without RLS: %', v_bad;
  end if;

  select string_agg(format('%I', t.tablename), ', ' order by t.tablename)
    into v_bad
    from pg_tables t
   where t.schemaname = 'public'
     and t.tablename like 'bodega_%'
     and (
       not t.rowsecurity
       or not exists (
         select 1 from pg_policies p
          where p.schemaname = t.schemaname
            and p.tablename = t.tablename
       )
     );
  if v_bad is not null then
    raise exception 'Security failure: operational tables missing RLS/policies: %', v_bad;
  end if;

  if exists (
    select 1
      from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee = 'anon'
  ) then
    raise exception 'Security failure: anon has direct privileges on public tables';
  end if;

  if exists (
    select 1
      from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee in ('anon', 'authenticated')
       and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
  ) then
    raise exception 'Security failure: API roles retain unnecessary table-level privileges';
  end if;

  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'S'
       and (
         has_sequence_privilege('anon', c.oid, 'USAGE')
         or has_sequence_privilege('anon', c.oid, 'SELECT')
         or has_sequence_privilege('anon', c.oid, 'UPDATE')
         or has_sequence_privilege('authenticated', c.oid, 'UPDATE')
       )
  ) then
    raise exception 'Security failure: sequence privileges exceed the intended minimum';
  end if;

  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'Security failure: anon can execute a public-schema function';
  end if;

  if has_table_privilege('authenticated', 'public.bodega_audit_logs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.bodega_audit_logs', 'DELETE')
     or has_table_privilege('authenticated', 'public.bodega_warranty_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.bodega_warranty_events', 'DELETE')
     or has_table_privilege('authenticated', 'public.bodega_movements', 'UPDATE')
     or has_table_privilege('authenticated', 'public.bodega_movements', 'DELETE') then
    raise exception 'Security failure: append-only audit, warranty, or stock history is mutable';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('bodega_audit_logs', 'bodega_warranty_events', 'bodega_movements')
       and cmd in ('UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'Security failure: mutable policy found on append-only history';
  end if;

  if not exists (
    select 1 from storage.buckets
     where id = 'warranty-documents'
       and public = false
  ) then
    raise exception 'Security failure: warranty-documents bucket must remain private';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'bodega_warranty_docs_storage_read'
       and cmd = 'SELECT'
       and qual ilike '%warranty-documents%'
       and qual ilike '%bodega_is_staff%'
  ) then
    raise exception 'Security failure: warranty documents must be restricted to active staff';
  end if;

  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'bodega_uso_almacenamiento'
       and p.prosecdef
       and coalesce(array_to_string(p.proconfig, ','), '') ilike '%search_path=public%'
  ) then
    raise exception 'Security failure: storage usage SECURITY DEFINER function needs a fixed search_path';
  end if;
end
$$;

rollback;
