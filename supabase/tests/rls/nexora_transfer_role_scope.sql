-- Nexora V4: prueba transaccional de rutas, alcance y lectura multisede.
-- Requiere PR #141 + 20261103090000_nexora_transfer_role_scope_and_routes.sql.
-- No crea usuarios, traslados, movimientos, ventas, actas ni cambios de inventario.
begin;
do $$
declare
  v_principal uuid;
  v_regional uuid;
  v_local_direct uuid;
  v_local_regional uuid;
  v_policy_count integer;
  v_constraint text;
  v_exec boolean;
begin
  if to_regprocedure('nexora_internal.site_role_scope_basis(uuid,text)') is null
     or to_regprocedure('nexora_internal.is_allowed_transfer_route(uuid,uuid)') is null
     or to_regprocedure('nexora_internal.is_current_active_multisite_staff()') is null then
    raise exception 'Faltan funciones de alcance V4; aplica las migraciones #141 y #142 en el entorno de prueba.';
  end if;

  if has_function_privilege('anon',
       'nexora_internal.site_role_scope_basis(uuid,text)','EXECUTE')
     or has_function_privilege('authenticated',
       'nexora_internal.site_role_scope_basis(uuid,text)','EXECUTE') then
    raise exception 'La función de autorización por sede no debe ser invocable directamente por clientes.';
  end if;
  if has_function_privilege('authenticated',
       'nexora_internal.is_current_active_multisite_staff()','EXECUTE') is not true then
    raise exception 'El helper de lectura RLS debe ser ejecutable por authenticated.';
  end if;
  if to_regprocedure('public.nexora_transfer_readiness()') is null
     or has_function_privilege('authenticated','public.nexora_transfer_readiness()','EXECUTE') is not true
     or has_function_privilege('anon','public.nexora_transfer_readiness()','EXECUTE') then
    raise exception 'La lectura mínima de readiness debe estar disponible solo a personal autenticado.';
  end if;

  select id into v_principal from public.nexora_sites
    where site_type='principal' and is_active order by name limit 1;
  select id into v_regional from public.nexora_sites
    where site_type='bodega' and is_active and parent_site_id=v_principal
    order by name limit 1;
  select id into v_local_direct from public.nexora_sites
    where site_type='local' and is_active and parent_site_id=v_principal
    order by name limit 1;
  select id into v_local_regional from public.nexora_sites
    where site_type='local' and is_active and parent_site_id=v_regional
    order by name limit 1;

  if v_principal is not null and v_regional is not null
     and not nexora_internal.is_allowed_transfer_route(v_principal,v_regional) then
    raise exception 'Debe permitirse principal hacia bodega regional dependiente.';
  end if;
  if v_principal is not null and v_local_direct is not null
     and not nexora_internal.is_allowed_transfer_route(v_principal,v_local_direct) then
    raise exception 'Debe permitirse abastecimiento directo del principal a su local dependiente.';
  end if;
  if v_regional is not null and v_local_regional is not null
     and not nexora_internal.is_allowed_transfer_route(v_regional,v_local_regional) then
    raise exception 'Debe permitirse bodega regional hacia su local dependiente.';
  end if;
  if v_local_regional is not null and v_regional is not null
     and not nexora_internal.is_allowed_transfer_route(v_local_regional,v_regional) then
    raise exception 'Debe permitirse retorno del local a su bodega de origen.';
  end if;
  if v_local_direct is not null and v_local_regional is not null
     and nexora_internal.is_allowed_transfer_route(v_local_direct,v_local_regional) then
    raise exception 'Está prohibido trasladar directamente de un local a otro local.';
  end if;
  if nexora_internal.is_allowed_transfer_route(null,null)
     or nexora_internal.is_allowed_transfer_route(gen_random_uuid(),gen_random_uuid()) then
    raise exception 'Una ruta nula o inexistente debe denegarse.';
  end if;

  select count(*) into v_policy_count from pg_policies
   where schemaname='public' and (
     (tablename='nexora_transfers' and policyname='nexora_transfers_read_admin'
       and coalesce(qual,'') ilike '%nexora_staff_sites%')
     or (tablename='nexora_transfer_lines' and policyname='nexora_transfer_lines_read_admin'
       and coalesce(qual,'') ilike '%nexora_transfers%')
     or (tablename='nexora_unit_custody' and policyname='nexora_custody_read_admin'
       and coalesce(qual,'') ilike '%nexora_staff_sites%')
     or (tablename='nexora_staff_sites' and policyname='nexora_staff_sites_read'
       and coalesce(qual,'') ilike '%is_current_active_multisite_staff%')
   );
  if v_policy_count<>4 then
    raise exception 'Las cuatro políticas de lectura por sede no están instaladas correctamente.';
  end if;

  select pg_get_constraintdef(oid) into v_constraint
    from pg_constraint
   where conrelid='public.nexora_transfer_events'::regclass
     and conname='nexora_transfer_events_event_type_check';
  if v_constraint is null or v_constraint not ilike '%edited%' then
    raise exception 'El historial de traslados debe admitir el evento edited.';
  end if;

  if to_regprocedure('public.nexora_transfer_action(text,uuid,uuid,uuid,text[],text,jsonb)') is null
     or to_regprocedure('nexora_internal.execute_transfer(text,uuid,uuid,uuid,text[],text,jsonb)') is null
     or to_regprocedure('public.nexora_transfer_action(text,uuid,uuid,uuid,text[],text)') is not null then
    raise exception 'La RPC debe exigir la firma nueva con detalle de faltantes y retirar la firma antigua.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='nexora_transfer_lines'
      and column_name='missing_note'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='nexora_transfer_lines'
      and column_name='missing_reported_by'
  ) then
    raise exception 'Cada línea de traslado debe poder conservar la observación y el autor del faltante.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.nexora_transfer_lines'::regclass
      and conname='nexora_transfer_missing_note_shape'
      and pg_get_constraintdef(oid) ilike '%missing_reported_at%'
  ) then
    raise exception 'La observación del faltante debe conservar autor y fecha de registro.';
  end if;

  select pg_get_functiondef('nexora_internal.execute_transfer(text,uuid,uuid,uuid,text[],text,jsonb)'::regprocedure)
    ilike '%site_role_scope_basis%' into v_exec;
  if not coalesce(v_exec,false) then
    raise exception 'El motor transaccional no consulta el alcance por sede.';
  end if;
end
$$;
rollback;
