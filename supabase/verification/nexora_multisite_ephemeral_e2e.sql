-- E2E SQL sobre PostgreSQL temporal de CI. Todos los IMEI son ficticios.
-- Se ejecuta DESPUES de las tres migraciones. Nunca en Supabase real.
insert into public.nexora_cities(id,code,name,created_by) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001','CIUDAD_A','Ciudad ficticia A','11111111-1111-4111-8111-111111111111'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002','CIUDAD_B','Ciudad ficticia B','11111111-1111-4111-8111-111111111111');

insert into public.nexora_sites(id,city_id,code,name,kind,parent_warehouse_id,created_by) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
  'SEDE_PRINCIPAL','Bodega central ficticia','principal',null,'11111111-1111-4111-8111-111111111111'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002',
  'BODEGA_B','Bodega regional ficticia','bodega',null,'11111111-1111-4111-8111-111111111111'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0003','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002',
  'LOCAL_B','Local ficticio','local','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002',
  '11111111-1111-4111-8111-111111111111');

insert into public.nexora_site_memberships(site_id,user_id,role,created_by)
 values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002',
 '22222222-2222-4222-8222-222222222222','bodeguero',
 '11111111-1111-4111-8111-111111111111');

insert into public.bodega_units(id,serial,status,site_id,cost)
 select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
        '35' || lpad(n::text,13,'0'), 'en_bodega',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002',100
 from generate_series(1,20) n;

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

do $$
declare
  v_batch uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_region uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002';
  v_local uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0003';
  v_return uuid;
  v_result jsonb;
  v_decisions jsonb;
  v_reviews jsonb;
  v_uid uuid;
  v_count integer;
  v_guarded boolean;
begin
  if not public.nexora_can_operate_transfer_site(v_region)
    or not public.nexora_can_operate_transfer_site(v_local) then
    raise exception 'El admin activo debe operar ambas sedes activas.';
  end if;

  select public.nexora_dispatch_transfer(v_batch,v_region,v_local,
    array(select id from public.bodega_units order by serial))
  into v_result;
  if v_result->>'status'<>'en_transito'
    or (v_result->>'dispatchedCount')::int<>20 then
    raise exception 'No se despacharon 20 IMEI: %',v_result;
  end if;
  if (select count(*) from public.bodega_units where status='en_transito')<>20 then
    raise exception 'Despacho no descontó 20 unidades del disponible.';
  end if;

  -- Intentos legacy desde pedido, garantía y modificación de costos deben fallar.
  select id into v_uid from public.bodega_units where serial='35'||lpad('20',13,'0');
  v_guarded := false;
  begin
    update public.bodega_units set cost=1 where id=v_uid;
  exception when others then
    v_guarded := true;
  end;
  if not v_guarded then raise exception 'Se alteró costo de IMEI en tránsito.'; end if;

  v_guarded := false;
  begin
    insert into public.bodega_order_item_units(order_item_id,unit_id)
    values('33333333-3333-4333-8333-333333333335',v_uid);
  exception when others then
    v_guarded := true;
  end;
  if not v_guarded then raise exception 'Pedido asignó IMEI en tránsito.'; end if;

  v_guarded := false;
  begin
    insert into public.bodega_warranties(unit_id,status) values(v_uid,'recibido');
  exception when others then
    v_guarded := true;
  end;
  if not v_guarded then raise exception 'Garantía asignó IMEI en tránsito.'; end if;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'unit_id',id,
    'decision',case when right(serial,13)::int<=15 then 'recibido' else 'no_llego' end,
    'observation',case when right(serial,13)::int<=15 then '' else 'No llegó físicamente' end
  )) into v_decisions from public.bodega_units;

  select public.nexora_receive_transfer(v_batch,v_decisions) into v_result;
  if v_result->>'status'<>'recepcion_parcial'
    or (v_result->>'receivedCount')::int<>15
    or (v_result->>'missingCount')::int<>5 then
    raise exception 'Recepción parcial incorrecta: %',v_result;
  end if;
  v_return:=(v_result->>'returnId')::uuid;

  if (select count(*) from public.bodega_units
       where site_id=v_local and status='en_local')<>15 then
    raise exception 'Destino no recibió exactamente 15 unidades.';
  end if;
  if (select count(*) from public.bodega_units
       where site_id=v_region and status='en_transito')<>5 then
    raise exception 'Faltantes se reincorporaron indebidamente al disponible.';
  end if;

  -- Reintento idéntico: debe devolver la misma devolución sin duplicarla.
  select public.nexora_receive_transfer(v_batch,v_decisions) into v_result;
  if v_result->>'idempotent'<>'true'
    or (v_result->>'returnId')::uuid<>v_return then
    raise exception 'Reintento duplicó la devolución.';
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'unit_id',u.id,
    'present',right(u.serial,13)::int<=18,
    'observation',case when right(u.serial,13)::int<=18
      then '' else 'No encontrado en la bodega' end
  )) into v_reviews
  from public.bodega_units u join public.nexora_transfer_units t
    on t.unit_id=u.id and t.transfer_id=v_return;

  select public.nexora_verify_origin_return(v_return,v_reviews) into v_result;
  if v_result->>'status'<>'incidencia'
    or (v_result->>'verifiedCount')::int<>3
    or (v_result->>'incidentCount')::int<>2 then
    raise exception 'Devolución física incorrecta: %',v_result;
  end if;

  if (select count(*) from public.bodega_units
      where site_id=v_region and status='en_bodega')<>3 then
    raise exception 'Solo tres unidades debían regresar a la bodega.';
  end if;

  select public.nexora_resolve_origin_incident(v_return,v_uid,
    'IMEI 20 encontrado durante un segundo conteo') into v_result;
  if (v_result->>'remainingIncidents')::int<>1 then
    raise exception 'La recuperación tardía no conservó una incidencia: %',v_result;
  end if;
  select public.nexora_resolve_origin_incident(v_return,v_uid,
    'IMEI 20 encontrado durante un segundo conteo') into v_result;
  if v_result->>'idempotent'<>'true' then
    raise exception 'Reintento de recuperación no es idempotente.';
  end if;
  if (select count(*) from public.bodega_units
      where site_id=v_region and status='en_bodega')<>4 then
    raise exception 'Recuperación duplicó o perdió un IMEI.';
  end if;
  if (select count(*) from public.nexora_transfer_events
      where event_type='incidencia_resuelta' and unit_id=v_uid)<>1 then
    raise exception 'No hay evento inmutable de recuperación único.';
  end if;
  if (select count(*) from public.nexora_transfer_units
      where is_open and transfer_id=v_return)<>1 then
    raise exception 'No quedó exactamente una incidencia abierta.';
  end if;

  raise notice 'E2E PASÓ: 20 enviados, 15 recibidos, 5 retorno, 3 encontrados, 2 incidencias y 1 recuperación posterior.';
end; $$;

-- Los cuatro perfiles se preparan por sede, pero el piloto RPC todavía
-- se restringe a Administrador hasta el cambio completo del backend legacy.
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
  if not public.nexora_can_operate_transfer_site(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002') then
    raise exception 'El bodeguero activo no puede consultar su sede asignada.';
  end if;
  if public.nexora_can_operate_transfer_site(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0003') then
    raise exception 'Bodeguero autorizado incorrectamente en local ajeno.';
  end if;
end; $$;
set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
do $$
begin
  if public.nexora_can_operate_transfer_site(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002') then
    raise exception 'Un empleado inactivo obtuvo permiso.';
  end if;
end; $$;
reset role;
