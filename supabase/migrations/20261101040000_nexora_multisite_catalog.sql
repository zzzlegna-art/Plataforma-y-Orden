-- NEXORA 2.0 · Fase 1: catálogo de ciudades, sedes y asignación futura de personal.
-- Migración ADITIVA. No se aplica automáticamente a producción en esta entrega.
-- Sin datos precargados ni reasignación implícita de los IMEI históricos.
-- Aplicar en staging, verificar respaldo y ejecutar pruebas antes de producción.

create table public.nexora_cities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$'),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  department text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.bodega_profiles(id) on delete restrict
);

create unique index nexora_cities_name_department_idx
  on public.nexora_cities (lower(btrim(name)), lower(btrim(coalesce(department, ''))));

create table public.nexora_sites (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.nexora_cities(id) on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,23}$'),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  kind text not null check (kind in ('principal', 'bodega', 'local')),
  parent_warehouse_id uuid references public.nexora_sites(id) on delete restrict,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.bodega_profiles(id) on delete restrict,
  constraint nexora_sites_parent_by_kind check (
    (kind = 'local' and parent_warehouse_id is not null) or
    (kind <> 'local' and parent_warehouse_id is null)
  ),
  constraint nexora_sites_no_self_parent check (id is distinct from parent_warehouse_id)
);

-- Una sola sede principal para toda la empresa, sin prohibir futuras ciudades.
create unique index nexora_only_one_principal on public.nexora_sites (kind)
  where kind = 'principal';
create index nexora_sites_city_id_idx on public.nexora_sites(city_id);
create index nexora_sites_parent_idx on public.nexora_sites(parent_warehouse_id);

-- Cada local se asocia a una bodega (o sede principal) de su MISMA ciudad.
-- También impide alterar una bodega de modo que se rompa una relación existente.
create function public.nexora_validate_site_parent()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_parent_city uuid;
declare v_parent_kind text;
begin
  if new.kind = 'local' then
    select city_id, kind into v_parent_city, v_parent_kind
    from public.nexora_sites where id = new.parent_warehouse_id;
    if v_parent_city is null
      or v_parent_city <> new.city_id
      or v_parent_kind not in ('principal','bodega') then
      raise exception 'El local debe pertenecer a una bodega de su misma ciudad.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if exists (
      select 1 from public.nexora_sites child
      where child.parent_warehouse_id = new.id
        and (new.kind not in ('principal','bodega') or child.city_id <> new.city_id)
    ) then
      raise exception 'No puede cambiarse la ciudad o tipo de una bodega que abastece locales.';
    end if;
  end if;
  return new;
end; $$;

create trigger nexora_validate_site_parent_trigger
  before insert or update of city_id, kind, parent_warehouse_id
  on public.nexora_sites for each row
  execute function public.nexora_validate_site_parent();

-- La asignación por sede no sustituye por ahora los perfiles legacy.
-- NO usar nexora_site_memberships como única fuente de autorización hasta
-- migrar los cuatro roles y revisar los RPC/Edge Functions del sistema actual.
create table public.nexora_site_memberships (
  site_id uuid not null references public.nexora_sites(id) on delete restrict,
  user_id uuid not null references public.bodega_profiles(id) on delete cascade,
  role text not null check (role in ('admin','bodeguero','encargado','vendedor')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.bodega_profiles(id) on delete restrict,
  primary key (site_id,user_id)
);
create index nexora_site_memberships_user_idx on public.nexora_site_memberships(user_id);

-- Enlace preparado: campo nullable para NO atribuir falsamente el inventario
-- actual a una sede. Se completará por conciliación física controlada.
alter table public.bodega_units
  add column site_id uuid references public.nexora_sites(id) on delete restrict;
create index bodega_units_site_id_idx on public.bodega_units(site_id);

-- Permisos mínimos: personal activo consulta catálogo; SOLO admin lo cambia.
alter table public.nexora_cities enable row level security;
alter table public.nexora_sites enable row level security;
alter table public.nexora_site_memberships enable row level security;

grant select, insert, update on public.nexora_cities to authenticated;
grant select, insert, update on public.nexora_sites to authenticated;
grant select, insert, update on public.nexora_site_memberships to authenticated;

create policy nexora_cities_read on public.nexora_cities for select to authenticated
  using ((select public.bodega_is_staff()));
create policy nexora_cities_insert on public.nexora_cities for insert to authenticated
  with check ((select public.bodega_is_admin()) and created_by = (select auth.uid()));
create policy nexora_cities_update on public.nexora_cities for update to authenticated
  using ((select public.bodega_is_admin()))
  with check ((select public.bodega_is_admin()));

create policy nexora_sites_read on public.nexora_sites for select to authenticated
  using ((select public.bodega_is_staff()));
create policy nexora_sites_insert on public.nexora_sites for insert to authenticated
  with check ((select public.bodega_is_admin()) and created_by = (select auth.uid()));
create policy nexora_sites_update on public.nexora_sites for update to authenticated
  using ((select public.bodega_is_admin()))
  with check ((select public.bodega_is_admin()));

create policy nexora_memberships_read on public.nexora_site_memberships for select to authenticated
  using ((select public.bodega_is_admin()) or (user_id = (select auth.uid()) and (select public.bodega_is_staff())));
create policy nexora_memberships_insert on public.nexora_site_memberships for insert to authenticated
  with check ((select public.bodega_is_admin()) and created_by = (select auth.uid()));
create policy nexora_memberships_update on public.nexora_site_memberships for update to authenticated
  using ((select public.bodega_is_admin()))
  with check ((select public.bodega_is_admin()));

comment on table public.nexora_sites is 'Catálogo multisede; inventario legacy pendiente de asignación física por IMEI.';
comment on column public.bodega_units.site_id is 'Sede verificada; NULL significa que aún no fue conciliada.';
