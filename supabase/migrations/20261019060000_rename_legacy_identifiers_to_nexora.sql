-- Nexora: one-time, transactional migration of legacy internal object names.
-- This migration intentionally mentions old bodega_* identifiers only as source names
-- so existing data and references can be preserved while the schema is renamed.
begin;

do $migration$
declare
  r record;
  v_new text;
begin
  -- Rename tables first. PostgreSQL preserves rows, constraints, grants, RLS and FK
  -- relationships when a table is renamed.
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public' and left(tablename, 7) = 'bodega_'
    order by tablename
  loop
    v_new := regexp_replace(r.tablename, '^bodega_', 'nexora_');
    if to_regclass(format('public.%I', v_new)) is not null then
      raise exception 'Nexora migration stopped: both public.% and public.% exist; reconcile them before retrying', r.tablename, v_new;
    end if;
    execute format('alter table public.%I rename to %I', r.tablename, v_new);
  end loop;

  -- Rename legacy functions while preserving their OIDs, grants and trigger bindings.
  for r in
    select p.proname, p.proargtypes,
           pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and left(p.proname, 7) = 'bodega_'
    order by p.proname
  loop
    v_new := regexp_replace(r.proname, '^bodega_', 'nexora_');
    if exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = v_new
        and p.proargtypes = r.proargtypes
    ) then
      raise exception 'Nexora migration stopped: both public.% and public.% exist; reconcile function overloads before retrying', r.proname, v_new;
    end if;
    execute format('alter function public.%I(%s) rename to %I', r.proname, r.identity_args, v_new);
  end loop;

  -- Rename constraints; primary/unique backing indexes follow their constraint names.
  for r in
    select c.conname, t.relname as table_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and left(c.conname, 7) = 'bodega_'
    order by t.relname, c.conname
  loop
    v_new := regexp_replace(r.conname, '^bodega_', 'nexora_');
    if exists (
      select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and t.relname = r.table_name and c.conname = v_new
    ) then
      raise exception 'Nexora migration stopped: duplicate constraint name % on table %', v_new, r.table_name;
    end if;
    execute format('alter table public.%I rename constraint %I to %I', r.table_name, r.conname, v_new);
  end loop;

  -- Rename remaining indexes and sequences whose names still use the old prefix.
  for r in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and left(c.relname, 7) = 'bodega_'
      and c.relkind in ('i', 'S')
    order by c.relkind, c.relname
  loop
    v_new := regexp_replace(r.relname, '^bodega_', 'nexora_');
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_new
    ) then
      raise exception 'Nexora migration stopped: duplicate relation name public.%', v_new;
    end if;
    if r.relkind = 'i' then
      execute format('alter index public.%I rename to %I', r.relname, v_new);
    else
      execute format('alter sequence public.%I rename to %I', r.relname, v_new);
    end if;
  end loop;

  -- Rename custom enum/domain types (table row types are renamed automatically).
  for r in
    select t.typname, t.typtype
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and left(t.typname, 7) = 'bodega_'
      and t.typtype in ('e', 'd')
  loop
    v_new := regexp_replace(r.typname, '^bodega_', 'nexora_');
    if exists (
      select 1 from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = v_new
    ) then
      raise exception 'Nexora migration stopped: duplicate type name public.%', v_new;
    end if;
    execute format('alter type public.%I rename to %I', r.typname, v_new);
  end loop;

  -- Rename views/materialized views, if any.
  for r in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and left(c.relname, 7) = 'bodega_'
      and c.relkind in ('v', 'm')
  loop
    v_new := regexp_replace(r.relname, '^bodega_', 'nexora_');
    if r.relkind = 'v' then
      execute format('alter view public.%I rename to %I', r.relname, v_new);
    else
      execute format('alter materialized view public.%I rename to %I', r.relname, v_new);
    end if;
  end loop;

  -- Rename RLS policies on application/storage tables.
  for r in
    select p.polname, ns.nspname as schema_name, c.relname as table_name
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where left(p.polname, 7) = 'bodega_'
      and ns.nspname in ('public', 'storage')
  loop
    v_new := regexp_replace(r.polname, '^bodega_', 'nexora_');
    if exists (
      select 1 from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = r.schema_name and c.relname = r.table_name and p.polname = v_new
    ) then
      raise exception 'Nexora migration stopped: duplicate policy % on %.%', v_new, r.schema_name, r.table_name;
    end if;
    execute format('alter policy %I on %I.%I rename to %I', r.polname, r.schema_name, r.table_name, v_new);
  end loop;

  -- Rename triggers, including the one with the historical trg_bodega_* prefix.
  for r in
    select t.tgname, ns.nspname as schema_name, c.relname as table_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where not t.tgisinternal
      and ns.nspname in ('public', 'storage')
      and (left(t.tgname, 7) = 'bodega_' or left(t.tgname, 11) = 'trg_bodega_')
  loop
    v_new := case
      when left(r.tgname, 11) = 'trg_bodega_' then regexp_replace(r.tgname, '^trg_bodega_', 'trg_nexora_')
      else regexp_replace(r.tgname, '^bodega_', 'nexora_')
    end;
    if exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace ns on ns.oid = c.relnamespace
      where not t.tgisinternal and ns.nspname = r.schema_name
        and c.relname = r.table_name and t.tgname = v_new
    ) then
      raise exception 'Nexora migration stopped: duplicate trigger % on %.%', v_new, r.schema_name, r.table_name;
    end if;
    execute format('alter trigger %I on %I.%I rename to %I', r.tgname, r.schema_name, r.table_name, v_new);
  end loop;

  -- SQL/PLpgSQL function bodies are stored as source text. Rewrite references after
  -- the object renames so RPCs, RLS helpers and triggers continue using the new names.
  for r in
    select p.oid, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        position('bodega_' in p.prosrc) > 0
        or position('BODEGA_' in p.prosrc) > 0
        or position('bodega.' in p.prosrc) > 0
      )
  loop
    v_new := replace(r.definition, 'bodega_', 'nexora_');
    v_new := replace(v_new, 'BODEGA_', 'NEXORA_');
    v_new := replace(v_new, 'bodega.', 'nexora.');
    execute v_new;
  end loop;

  -- The application requires the version-checked atomic RPC introduced by the
  -- preceding migration. Abort and roll back all renames if the target is incomplete.
  if to_regprocedure('public.nexora_guardar_con_version(jsonb)') is null then
    raise exception 'Nexora migration blocked: public.nexora_guardar_con_version(jsonb) is missing; apply and verify prior migrations first';
  end if;
end;
$migration$;

commit;
