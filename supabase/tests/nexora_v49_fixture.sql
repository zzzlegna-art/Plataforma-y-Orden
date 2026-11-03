-- Solo CI: estructura mínima para probar las migraciones V4.9 sobre Postgres 17.
-- No hay conexión a la instancia Supabase real ni datos de clientes.
create role anon;
create role authenticated;
create schema auth;
create schema nexora_internal;
grant usage on schema nexora_internal to authenticated;

create function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create function public.bodega_is_admin()
returns boolean language sql stable
as $$ select current_setting('test.admin', true) = 'true' $$;

create table public.bodega_profiles (
  id uuid primary key
);
create table public.nexora_sites (
  id uuid primary key,
  name text not null,
  site_type text not null,
  is_active boolean not null default true
);
create table public.nexora_initial_inventory_approvals (
  id uuid primary key
);
create table public.nexora_initial_unit_sites (
  unit_id uuid primary key,
  site_id uuid not null references public.nexora_sites(id)
);
create table public.nexora_cash_sessions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.nexora_sites(id)
);
create table public.nexora_cash_expenses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.nexora_cash_sessions(id),
  amount numeric(16,2) not null check (amount > 0)
);
create table public.nexora_retail_sales (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.nexora_sites(id)
);
