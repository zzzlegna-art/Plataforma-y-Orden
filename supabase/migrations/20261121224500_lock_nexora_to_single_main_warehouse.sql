-- NEXORA opera únicamente desde Bodega 6A.
-- Se verifica que exista exactamente una sede principal activa y una ciudad
-- de referencia antes de bloquear nuevas ciudades y sedes desde la API.

do $$
begin
  if (select count(*) from public.nexora_sites) <> 1
     or not exists (
       select 1 from public.nexora_sites
       where id='cf03b83a-a23f-4bd2-a778-2c071fa9df2e'
         and name='Bodega 6A'
         and site_type='principal'
         and parent_site_id is null
         and is_active
     ) then
    raise exception 'La estructura de sedes no coincide con una única Bodega 6A activa; se cancela el bloqueo.';
  end if;

  if (select count(*) from public.nexora_cities) <> 1 then
    raise exception 'El catálogo de ciudades no contiene un único registro; se cancela el bloqueo.';
  end if;
end
$$;

alter table public.nexora_sites
  drop constraint if exists nexora_sites_site_type_check,
  drop constraint if exists nexora_sites_parent_shape;

alter table public.nexora_sites
  add constraint nexora_sites_only_main_warehouse
    check (site_type='principal' and parent_site_id is null);

drop policy if exists nexora_sites_insert on public.nexora_sites;
drop policy if exists nexora_sites_update on public.nexora_sites;
revoke insert, update on table public.nexora_sites from authenticated;

drop policy if exists nexora_cities_insert on public.nexora_cities;
drop policy if exists nexora_cities_update on public.nexora_cities;
revoke insert, update on table public.nexora_cities from authenticated;
