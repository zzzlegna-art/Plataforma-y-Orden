-- CI: clon minimal de dependencias preexistentes, sin datos ni credenciales reales.
-- Basado en las columnas, constraints y perfil de roles leídos de Supabase.
-- La migración original de caja se ejecuta después de esta fixture.
create role anon;
create role authenticated;
create schema auth;
create schema nexora_internal;
grant usage on schema auth,nexora_internal to authenticated;
create table auth.users(id uuid primary key, raw_app_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;

create table public.bodega_profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text,
  role text not null default 'bodeguero' check(role in ('admin','bodeguero')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Misma regla de privilegios de producción: rol ADMIN activo ligado al auth.uid.
create function public.bodega_is_admin() returns boolean
language sql stable security definer set search_path=public
as $$
 select exists(select 1 from public.bodega_profiles p
   where p.id=auth.uid() and p.is_active and p.role='admin');
$$;

create table public.nexora_cities (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 region text,
 created_at timestamptz not null default now()
);
create table public.nexora_sites(
 id uuid primary key default gen_random_uuid(),
 city_id uuid not null references public.nexora_cities(id),
 name text not null check (char_length(btrim(name)) between 2 and 140),
 site_type text not null check(site_type in ('principal','bodega','local')),
 parent_site_id uuid references public.nexora_sites(id) on delete restrict,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint nexora_sites_not_self_parent check(id is distinct from parent_site_id),
 constraint nexora_sites_parent_shape check(
   (site_type='principal' and parent_site_id is null)
   or (site_type in ('bodega','local') and parent_site_id is not null))
);
create table public.bodega_units (id uuid primary key, status text not null default 'en_bodega', cost numeric);
create table public.nexora_initial_inventory_approvals (
 id uuid primary key default gen_random_uuid(),
 only_one boolean not null default true check (only_one),
 approved_by uuid not null references public.bodega_profiles(id),
 approved_at timestamptz not null default now(),
 unit_count integer not null check(unit_count>0),
 constraint nexora_initial_inventory_singleton unique(only_one)
);
create table public.nexora_initial_unit_sites (
 unit_id uuid primary key references public.bodega_units(id),
 site_id uuid not null references public.nexora_sites(id),
 approval_id uuid not null references public.nexora_initial_inventory_approvals(id),
 serial_snapshot text not null,
 status_snapshot text not null,
 cost_snapshot numeric,
 approved_at timestamptz not null default now()
);
create table public.nexora_staff_sites (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.bodega_profiles(id),
 site_id uuid not null references public.nexora_sites(id),
 is_active boolean not null default true
);
create table public.nexora_staff_role_plans (
 user_id uuid primary key references public.bodega_profiles(id),
 planned_role text not null,
 operationally_enabled boolean not null default false
);

-- Lecturas de sedes en paneles; la autorización final se decide en las RPC.
grant select on public.nexora_sites,public.nexora_staff_sites,
 public.nexora_staff_role_plans,public.bodega_profiles,
 public.nexora_initial_inventory_approvals to authenticated;
