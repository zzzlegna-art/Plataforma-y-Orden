-- Prueba real de la RPC execute_transfer extraída del código de Nexora.
-- SOLO PostgreSQL temporal de CI; ningún usuario/IMEI/sede aquí es real.
-- Cubre 20 → 15 → 5 → retorno físico parcial y completo, con auditoría.
begin;

create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema nexora_internal;
create function auth.uid() returns uuid language sql stable as $uid$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$uid$;

create table public.bodega_profiles (
  id uuid primary key, role text not null, is_active boolean not null
);
create function public.bodega_is_admin()
returns boolean language sql stable as $admin$
  select exists(select 1 from public.bodega_profiles p
    where p.id=auth.uid() and p.role='admin' and p.is_active)
$admin$;

create table public.nexora_sites (
  id uuid primary key, parent_site_id uuid, is_active boolean not null
);
create table public.nexora_initial_inventory_approvals (
  id uuid primary key
);
create table public.bodega_units (
  id uuid primary key, serial text not null unique,
  status text not null, cost numeric
);
create table public.nexora_initial_unit_sites (
  unit_id uuid primary key references public.bodega_units(id),
  site_id uuid not null references public.nexora_sites(id),
  serial_snapshot text not null,
  cost_snapshot numeric
);
create table public.nexora_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_number bigint generated always as identity unique,
  origin_site_id uuid not null references public.nexora_sites(id),
  destination_site_id uuid not null references public.nexora_sites(id),
  note text, created_by uuid not null references public.bodega_profiles(id),
  status text not null default 'draft',
  dispatched_at timestamptz,received_at timestamptz,closed_at timestamptz
);
create table public.nexora_unit_custody (
  unit_id uuid primary key references public.nexora_initial_unit_sites(unit_id),
  site_id uuid references public.nexora_sites(id),
  custody_status text not null,
  transfer_id uuid references public.nexora_transfers(id),
  updated_at timestamptz not null default now()
);
create table public.nexora_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.nexora_transfers(id),
  unit_id uuid not null references public.nexora_initial_unit_sites(unit_id),
  serial_snapshot text not null, cost_snapshot numeric,
  state text not null default 'prepared',
  received_at timestamptz, returned_at timestamptz,
  unique (transfer_id,unit_id)
);
create unique index nexora_transfer_one_open_line_per_unit
  on public.nexora_transfer_lines(unit_id)
  where state in ('prepared','in_transit','return_pending');
create table public.nexora_transfer_events (
  transfer_id uuid references public.nexora_transfers(id),
  event_type text not null,actor_id uuid not null,
  detail jsonb not null default '{}'::jsonb
);
create table public.nexora_transfer_return_documents (
  transfer_id uuid primary key references public.nexora_transfers(id),
  expected_count integer not null, status text not null default 'pending',
  completed_at timestamptz
);
create table public.bodega_orders (id uuid primary key,status text not null);
create table public.bodega_order_items (
  id uuid primary key,order_id uuid references public.bodega_orders(id)
);
create table public.bodega_order_item_units (
  unit_id uuid references public.bodega_units(id),
  order_item_id uuid references public.bodega_order_items(id)
);

insert into public.bodega_profiles(id,role,is_active) values
 ('00000000-0000-0000-0000-000000000001','admin',true),
 ('00000000-0000-0000-0000-000000000002','bodeguero',true);
insert into public.nexora_sites(id,parent_site_id,is_active) values
 ('00000000-0000-0000-0000-000000000100',null,true),
 ('00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000100',true);
-- Simulación de acta autorizada SOLO en este PostgreSQL temporal.
insert into public.nexora_initial_inventory_approvals(id)
 values('00000000-0000-0000-0000-000000000999');
insert into public.bodega_units(id,serial,status,cost)
select format('00000000-0000-0000-0001-%s',lpad(i::text,12,'0'))::uuid,
 'IMEI-'||lpad(i::text,4,'0'),'en_bodega',200.0
 from generate_series(1,20) i;
insert into public.nexora_initial_unit_sites
 (unit_id,site_id,serial_snapshot,cost_snapshot)
select u.id,'00000000-0000-0000-0000-000000000100'::uuid,
 u.serial,u.cost from public.bodega_units u;

-- Instala el trigger real de observación y la RPC real (extraída del
-- artefacto de migración; no una reproducción manual del algoritmo).
\ir ../../migrations/20261103090000_nexora_transfer_missing_observations.sql
\ir .nexora-execute-transfer.generated.sql

select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',true);

do $test$
declare
  v_origin constant uuid := '00000000-0000-0000-0000-000000000100';
  v_destination constant uuid := '00000000-0000-0000-0000-000000000200';
  v_transfer uuid;
  v_all text[];
  v_accepted text[];
  v_rest text[];
  v_result jsonb;
  v_status text;
begin
  select array_agg(serial order by serial) into v_all from public.bodega_units;
  if cardinality(v_all)<>20 then
    raise exception 'El fixture no creó 20 IMEI ficticios.';
  end if;
  v_accepted:=v_all[1:15];
  v_rest:=v_all[17:20];

  -- La RPC actual debe permanecer en modo Administrador hasta que RLS
  -- y el plan de roles estén aprobados. Un Bodeguero no puede saltar el bloqueo.
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000002',true);
  begin
    perform nexora_internal.execute_transfer(
      'create',null,v_origin,v_destination,v_all,'Intento prohibido');
    raise exception 'La función actual permitió traslado de Bodeguero.';
  exception when others then
    if sqlerrm not like '%Solo Administrador puede operar traslados multisede%' then
      raise;
    end if;
  end;
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000001',true);
  if exists(select 1 from public.nexora_transfers) then
    raise exception 'El acceso denegado creó un manifiesto ficticio.';
  end if;

  v_result:=nexora_internal.execute_transfer(
    'create',null,v_origin,v_destination,v_all,'CI solo datos ficticios');
  v_transfer:=(v_result->>'transferId')::uuid;
  if v_result->>'status'<>'draft'
    or (select count(*) from public.nexora_transfer_lines
        where transfer_id=v_transfer and state='prepared')<>20 then
    raise exception 'Error al crear el manifiesto con la RPC real.';
  end if;

  v_result:=nexora_internal.execute_transfer(
    'dispatch',v_transfer,null,null,array[]::text[],null);
  if v_result->>'status'<>'in_transit'
    or (select count(*) from public.nexora_unit_custody
        where custody_status='in_transit' and site_id is null)<>20 then
    raise exception 'Despacho: no hay veinte IMEI en tránsito sin sede.';
  end if;

  -- Un serial fuera del manifiesto no debe alterar el envío.
  begin
    perform nexora_internal.execute_transfer(
      'receive',v_transfer,null,null,array['IMEI-AJENO'],null);
    raise exception 'La RPC recibió un IMEI no despachado.';
  exception when others then
    if sqlerrm not like '%La recepción contiene IMEI repetidos%' then
      raise;
    end if;
  end;
  if (select count(*) from public.nexora_transfer_lines
      where state='in_transit')<>20 then
    raise exception 'Un error de recepción cambió custodia.';
  end if;

  v_result:=nexora_internal.execute_transfer(
    'receive',v_transfer,null,null,v_accepted,null);
  if (v_result->>'received')::int<>15
    or (v_result->>'missing')::int<>5
    or v_result->>'status'<>'awaiting_returns' then
    raise exception 'Recepción parcial: la RPC no documentó 15/5.';
  end if;

  if (select count(*) from public.nexora_transfer_lines
      where transfer_id=v_transfer and state='received')<>15
    or (select count(*) from public.nexora_transfer_lines
      where transfer_id=v_transfer and state='return_pending')<>5
    or (select count(*) from public.nexora_unit_custody
      where custody_status='at_site' and site_id=v_destination)<>15
    or (select count(*) from public.nexora_unit_custody
      where custody_status='return_pending' and site_id is null)<>5 then
    raise exception 'Recepción: custodias no corresponden a 15 aceptados y 5 faltantes.';
  end if;

  -- Reintentar recepción no puede generar un incidente duplicado.
  begin
    perform nexora_internal.execute_transfer(
      'receive',v_transfer,null,null,v_accepted,null);
    raise exception 'La RPC admitió dos recepciones del mismo traslado.';
  exception when others then
    if sqlerrm not like '%Esta recepción ya fue procesada%' then
      raise;
    end if;
  end;

  if (select expected_count from public.nexora_transfer_return_documents
      where transfer_id=v_transfer)<>5
    or (select status from public.nexora_transfer_return_documents
      where transfer_id=v_transfer)<>'pending'
    or (select count(*) from public.nexora_transfer_missing_observations
      where transfer_id=v_transfer)<>5
    or (select count(*) from public.nexora_transfer_missing_observations
      where transfer_id=v_transfer
       and serial_snapshot=any(v_accepted))<>0
    or (select count(*) from public.nexora_transfer_missing_observations
      where transfer_id=v_transfer
        and (observation<>'No llegó'
        or reported_by<>'00000000-0000-0000-0000-000000000001'::uuid))<>0 then
    raise exception 'Faltan cinco observaciones inmutables y documento de retorno.';
  end if;

  -- El intento de confirmar retorno ajeno debe rechazarse y conservar la custodia.
  begin
    perform nexora_internal.execute_transfer(
      'return',v_transfer,null,null,array['IMEI-0001'],null);
    raise exception 'Se aceptó como retorno un IMEI que sí llegó.';
  exception when others then
    if sqlerrm not like '%El retorno contiene IMEI ajenos%' then
      raise;
    end if;
  end;

  v_result:=nexora_internal.execute_transfer(
    'return',v_transfer,null,null,array[v_all[16]],null);
  if (v_result->>'remaining')::int<>4
    or (select count(*) from public.nexora_unit_custody
      where site_id=v_origin and custody_status='at_site')<>1
    or (select count(*) from public.nexora_transfer_missing_observations
      where transfer_id=v_transfer)<>5 then
    raise exception 'El primer retorno no puede borrar el historial ni liberar los otros cuatro.';
  end if;

  begin
    perform nexora_internal.execute_transfer(
      'return',v_transfer,null,null,array[v_all[16]],null);
    raise exception 'La RPC admitió dos retornos del mismo IMEI.';
  exception when others then
    if sqlerrm not like '%El retorno contiene IMEI ajenos%' then
      raise;
    end if;
  end;

  v_result:=nexora_internal.execute_transfer(
    'return',v_transfer,null,null,v_rest,null);
  select status into v_status from public.nexora_transfers
    where id=v_transfer;
  if v_status<>'closed'
    or v_result->>'status'<>'closed'
    or (select status from public.nexora_transfer_return_documents
      where transfer_id=v_transfer)<>'completed'
    or (select count(*) from public.nexora_unit_custody
      where custody_status='return_pending')<>0
    or (select count(*) from public.nexora_unit_custody
      where site_id=v_origin and custody_status='at_site')<>5
    or (select count(*) from public.nexora_unit_custody
      where site_id=v_destination and custody_status='at_site')<>15
    or (select count(*) from public.nexora_transfer_missing_observations)<>5 then
    raise exception 'El cierre no conserva las 5 devoluciones verificadas y el historial.';
  end if;
  raise notice 'PASS: RPC real 20 enviados -> 15 recibidos -> 5 No llegó -> 1+4 retornados.';
end;
$test$;

rollback;
