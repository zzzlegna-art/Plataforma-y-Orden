-- Pruebas transaccionales (solo lectura) de la base privada rol/sede V4.
-- Requiere aplicar primero 20261103080000_nexora_site_role_scope_basis.sql
-- y ejecutarse desde un entorno administrativo seguro.
-- No modifica actas, roles, perfiles, inventario, cajas, ventas ni traslados.
begin;
do $$
declare
  v_admin uuid;
  v_bodeguero uuid;
  v_main uuid;
  v_store uuid;
  v_regional uuid;
  v_other_city_regional uuid;
  v_same_city_regional uuid;
  v_regional_store uuid;
  v_other_store uuid;
  v_own_site uuid;
  v_foreign_site uuid;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='nexora_internal' and p.proname='site_role_scope_basis'
      and p.prosecdef
      and array_to_string(p.proconfig,',') like '%search_path=pg_catalog%'
  ) then
    raise exception 'Falta la funcion privada SECURITY DEFINER con search_path fijo.';
  end if;

  if has_function_privilege('anon',
       'nexora_internal.site_role_scope_basis(uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated',
       'nexora_internal.site_role_scope_basis(uuid,text)', 'EXECUTE')
    or has_function_privilege('anon',
       'nexora_internal.transfer_actor_scope_basis(text,uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated',
       'nexora_internal.transfer_actor_scope_basis(text,uuid,uuid)', 'EXECUTE') then
    raise exception 'Las funciones internas no deben estar expuestas a clientes REST.';
  end if;
  if nexora_internal.transfer_actor_scope_basis('create',null,null)
    or nexora_internal.transfer_actor_scope_basis('inventado',gen_random_uuid(),gen_random_uuid()) then
    raise exception 'Origen, destino y acción deben ser válidos.';
  end if;

  if nexora_internal.site_role_scope_basis(null, 'transfers.manage')
    or nexora_internal.site_role_scope_basis(gen_random_uuid(), 'transfers.manage')
    or nexora_internal.site_role_scope_basis(null, null) then
    raise exception 'Una sede ausente o desconocida debe denegarse.';
  end if;

  select id into v_admin from public.bodega_profiles
   where is_active and role='admin' order by created_at limit 1;
  select id into v_bodeguero from public.bodega_profiles
   where is_active and role='bodeguero' order by created_at limit 1;
  select id into v_main from public.nexora_sites
   where is_active and site_type='principal' order by name limit 1;
  select id into v_store from public.nexora_sites
   where is_active and site_type='local' order by name limit 1;
  select id into v_regional from public.nexora_sites
   where is_active and site_type='bodega' and parent_site_id=v_main
   order by name limit 1;
  select id into v_regional_store from public.nexora_sites
   where is_active and site_type='local' and parent_site_id=v_regional
   order by name limit 1;
  select d.id into v_other_city_regional from public.nexora_sites d
    join public.nexora_sites o on o.id=v_regional
    where d.is_active and d.site_type='bodega'
      and d.id<>o.id and d.city_id<>o.city_id
    order by d.name limit 1;
  select d.id into v_same_city_regional from public.nexora_sites d
    join public.nexora_sites o on o.id=v_regional
    where d.is_active and d.site_type='bodega'
      and d.id<>o.id and d.city_id=o.city_id
    order by d.name limit 1;
  select id into v_other_store from public.nexora_sites
   where is_active and site_type='local' and id<>v_store
   order by name limit 1;

  -- Los JWT se simulan SOLO dentro de esta transaccion y no se guardan.
  if v_admin is not null and v_main is not null then
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    if not nexora_internal.site_role_scope_basis(v_main,'reception.supplier.receive') then
      raise exception 'El Admin debe poder superar el alcance inicial de recepcion principal.';
    end if;
    if nexora_internal.site_role_scope_basis(v_main,'cash.open')
       or nexora_internal.site_role_scope_basis(v_main,'inventario.inventado') then
      raise exception 'No se permite caja en la sede principal ni capacidades desconocidas.';
    end if;
    if nexora_internal.transfer_actor_scope_basis('create',v_main,v_main) then
      raise exception 'El traslado no debe aceptar la misma sede como origen y destino.';
    end if;

    if v_regional is not null then
      if not nexora_internal.transfer_actor_scope_basis('create',v_main,v_regional)
         or nexora_internal.transfer_actor_scope_basis('receive',v_regional,v_main) then
        raise exception 'Se debe permitir principal a bodega dependiente, pero no bodega a principal.';
      end if;
    end if;

    if v_regional is not null and v_other_city_regional is not null and
       not nexora_internal.transfer_actor_scope_basis('create',v_regional,v_other_city_regional) then
      raise exception 'Dos bodegas regionales de distintas ciudades pueden trasladarse mercancía.';
    end if;
    if v_regional is not null and v_same_city_regional is not null and
       nexora_internal.transfer_actor_scope_basis('create',v_regional,v_same_city_regional) then
      raise exception 'La ruta regional a regional solo está aprobada entre ciudades distintas.';
    end if;

    if v_regional is not null and v_regional_store is not null then
      if not nexora_internal.transfer_actor_scope_basis('create',v_regional,v_regional_store)
         or not nexora_internal.transfer_actor_scope_basis('receive',v_regional_store,v_regional)
         or nexora_internal.transfer_actor_scope_basis('create',v_main,v_regional_store) then
        raise exception 'La bodega regional debe abastecer a su local y admitir su retorno; 6A no debe omitir la bodega matriz.';
      end if;
    end if;

    if v_store is not null then
      -- Una devolución local→bodega matriz SÍ es válida en el Plan V4.
      if exists (
        select 1 from public.nexora_sites d
        where d.id=v_store and d.parent_site_id=v_main
      ) then
        if not nexora_internal.transfer_actor_scope_basis('create',v_main,v_store)
           or not nexora_internal.transfer_actor_scope_basis('dispatch',v_main,v_store)
           or not nexora_internal.transfer_actor_scope_basis('receive',v_main,v_store)
           or not nexora_internal.transfer_actor_scope_basis('return',v_main,v_store)
           or not nexora_internal.transfer_actor_scope_basis('cancel',v_main,v_store)
           or not nexora_internal.transfer_actor_scope_basis('create',v_store,v_main) then
          raise exception 'El Administrador debe superar las cinco etapas y la devolucion local a origen.';
        end if;
      end if;
      if v_other_store is not null and
        (nexora_internal.transfer_actor_scope_basis('create',v_store,v_other_store)
         or nexora_internal.transfer_actor_scope_basis('create',v_other_store,v_store)) then
        raise exception 'El Plan Maestro prohíbe siempre traslados de local a local.';
      end if;
      if not nexora_internal.site_role_scope_basis(v_store,'cash.open')
         or nexora_internal.site_role_scope_basis(v_store,'cash.close')
         or nexora_internal.site_role_scope_basis(v_store,'reception.supplier.receive') then
        raise exception 'Reglas de caja y recepcion Admin/local incorrectas.';
      end if;
    end if;
  end if;

  if v_bodeguero is not null then
    perform set_config('request.jwt.claim.sub', v_bodeguero::text, true);
    select ss.site_id into v_own_site from public.nexora_staff_sites ss
    join public.nexora_sites s on s.id=ss.site_id
    where ss.user_id=v_bodeguero and ss.is_active and s.is_active
    order by s.name limit 1;
    if v_own_site is not null then
      if not nexora_internal.site_role_scope_basis(v_own_site,'transfers.manage')
         or nexora_internal.site_role_scope_basis(v_own_site,'cash.open') then
        raise exception 'El Bodeguero tiene un alcance incorrecto.';
      end if;
      select s.id into v_foreign_site from public.nexora_sites s
       where s.is_active and s.id<>v_own_site
         and not exists(select 1 from public.nexora_staff_sites ss
                        where ss.user_id=v_bodeguero and ss.site_id=s.id and ss.is_active)
       order by s.name limit 1;
      if v_foreign_site is not null and
         nexora_internal.site_role_scope_basis(v_foreign_site,'transfers.manage') then
        raise exception 'Se detecto acceso a una sede ajena.';
      end if;
      if v_foreign_site is not null and exists (
        select 1 from public.nexora_sites d where d.id=v_foreign_site
          and d.parent_site_id=v_own_site
      ) then
        if nexora_internal.transfer_actor_scope_basis('receive',v_own_site,v_foreign_site)
           or not nexora_internal.transfer_actor_scope_basis('dispatch',v_own_site,v_foreign_site) then
          raise exception 'El Bodeguero no debe recibir en la sede ajena aunque pueda despachar desde la propia.';
        end if;
      end if;
    end if;
  end if;
end;
$$;
rollback;
