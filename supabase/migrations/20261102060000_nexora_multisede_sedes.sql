-- Nexora Multisede 2.0 · Fundacion de ciudades y sedes.
-- No toca existencias, recepciones, pedidos ni estados de IMEI anteriores.
-- El enlace de inventario por sede se realizará en otra fase, tras conciliación física.
create table if not exists public.nexora_cities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  region text,
  created_at timestamptz not null default now()
);
create unique index if not exists nexora_cities_name_unique
  on public.nexora_cities (lower(btrim(name)));

create table if not exists public.nexora_sites (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.nexora_cities(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 140),
  site_type text not null check (site_type in ('principal', 'bodega', 'local')),
  parent_site_id uuid references public.nexora_sites(id) on delete restrict,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nexora_sites_parent_shape check (
    (site_type = 'principal' and parent_site_id is null)
    or (site_type in ('bodega', 'local') and parent_site_id is not null)
  ),
  constraint nexora_sites_not_self_parent check (id is distinct from parent_site_id)
);
create unique index if not exists nexora_sites_one_principal
  on public.nexora_sites ((site_type)) where site_type = 'principal';
create unique index if not exists nexora_sites_city_name
  on public.nexora_sites (city_id, lower(btrim(name)));
create index if not exists nexora_sites_parent_idx
  on public.nexora_sites (parent_site_id);
create index if not exists nexora_sites_city_idx
  on public.nexora_sites (city_id);

-- La bodega regional depende de la principal; el local depende de su bodega
-- de ciudad o de la principal cuando comparte ciudad con ella.
-- No admitir cambios de jerarquía después de la creación evita romper rutas e historial.
create or replace function public.nexora_validate_site_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_kind text;
  parent_city uuid;
  parent_active boolean;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.city_id is distinct from old.city_id
       or new.site_type is distinct from old.site_type
       or new.parent_site_id is distinct from old.parent_site_id
       or new.created_at is distinct from old.created_at then
      raise exception 'La estructura de una sede no puede cambiar después de crearla.';
    end if;
    if old.is_active and not new.is_active and exists (
      select 1 from public.nexora_sites s
      where s.parent_site_id = old.id and s.is_active
    ) then
      raise exception 'Desactiva primero los puntos dependientes.';
    end if;
  end if;

  if new.site_type = 'principal' then
    if new.parent_site_id is not null then
      raise exception 'La sede principal no puede tener origen.';
    end if;
  else
    select s.site_type, s.city_id, s.is_active
      into parent_kind, parent_city, parent_active
      from public.nexora_sites s
     where s.id = new.parent_site_id;
    if not found or not parent_active then
      raise exception 'Selecciona una sede de origen activa.';
    end if;
    if new.site_type = 'bodega' and parent_kind <> 'principal' then
      raise exception 'Una bodega regional debe depender de la sede principal.';
    end if;
    if new.site_type = 'local' and
       (parent_kind not in ('principal', 'bodega') or parent_city <> new.city_id) then
      raise exception 'El local debe depender de una bodega de su misma ciudad.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.nexora_validate_site_hierarchy() from public, anon, authenticated;
drop trigger if exists nexora_validate_site_hierarchy_trigger on public.nexora_sites;
create trigger nexora_validate_site_hierarchy_trigger
before insert or update on public.nexora_sites
for each row execute function public.nexora_validate_site_hierarchy();

alter table public.nexora_cities enable row level security;
alter table public.nexora_sites enable row level security;

create policy nexora_cities_read on public.nexora_cities
  for select to authenticated using ((select public.bodega_is_staff()));
create policy nexora_cities_insert on public.nexora_cities
  for insert to authenticated with check ((select public.bodega_is_admin()));
create policy nexora_cities_update on public.nexora_cities
  for update to authenticated
  using ((select public.bodega_is_admin()))
  with check ((select public.bodega_is_admin()));

create policy nexora_sites_read on public.nexora_sites
  for select to authenticated using ((select public.bodega_is_staff()));
create policy nexora_sites_insert on public.nexora_sites
  for insert to authenticated with check ((select public.bodega_is_admin()));
create policy nexora_sites_update on public.nexora_sites
  for update to authenticated
  using ((select public.bodega_is_admin()))
  with check ((select public.bodega_is_admin()));

grant select, insert, update on public.nexora_cities to authenticated;
grant select, insert, update on public.nexora_sites to authenticated;
revoke all on public.nexora_cities, public.nexora_sites from anon;
revoke delete on public.nexora_cities, public.nexora_sites from authenticated;

comment on table public.nexora_cities is
  'Ciudades configurables de Nexora Multisede 2.0; sin afectar inventario legacy.';
comment on table public.nexora_sites is
  'Puntos físicos configurables; todavía no asignan stock ni alteran estados de IMEI.';
