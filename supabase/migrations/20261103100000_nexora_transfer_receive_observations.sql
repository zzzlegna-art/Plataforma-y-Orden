-- Nexora Multisede V4 · recepción parcial con nota escrita por IMEI.
-- REQUIERE la migración 20261103090000_nexora_transfer_missing_observations.sql.
-- BORRADOR, NO APLICADO EN PRODUCCIÓN. Desplegar solo junto con la UI
-- compatible, después de pruebas Supabase aisladas y revisión de respaldo.
--
-- Mantiene intacto nexora_internal.execute_transfer: conserva su lock, control
-- Administrador, custodia, documento de retorno y reversión transaccional.

create table public.nexora_transfer_missing_receipt_notes (
  transfer_line_id uuid primary key
    references public.nexora_transfer_missing_observations(transfer_line_id)
    on delete restrict,
  transfer_id uuid not null references public.nexora_transfers(id) on delete restrict,
  serial_snapshot text not null,
  receiver_observation text not null
    check (length(btrim(receiver_observation)) between 3 and 500),
  recorded_by uuid not null references public.bodega_profiles(id) on delete restrict,
  recorded_at timestamptz not null default now()
);
create index nexora_transfer_missing_notes_by_transfer
  on public.nexora_transfer_missing_receipt_notes(transfer_id,recorded_at);

alter table public.nexora_transfer_missing_receipt_notes
  enable row level security;
create policy nexora_transfer_missing_receipt_notes_admin_read
  on public.nexora_transfer_missing_receipt_notes
  for select to authenticated
  using ((select public.bodega_is_admin()));
revoke all on public.nexora_transfer_missing_receipt_notes
  from public,anon,authenticated;
grant select on public.nexora_transfer_missing_receipt_notes to authenticated;

-- La observación suministrada por el receptor es evidencia permanente;
-- no puede actualizarse ni eliminarse por operaciones normales, incluso
-- si una aplicación administrativa usa accidentalmente credenciales elevadas.
create trigger nexora_transfer_missing_notes_no_rewrite
  before update or delete on public.nexora_transfer_missing_receipt_notes
  for each row execute function nexora_internal.reject_missing_audit_mutation();
create trigger nexora_transfer_missing_notes_no_truncate
  before truncate on public.nexora_transfer_missing_receipt_notes
  for each statement execute function nexora_internal.reject_missing_audit_mutation();

create function public.nexora_transfer_receive_with_notes(
  p_transfer_id uuid,
  p_received_serials text[],
  p_missing_marks jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_received text[];
  v_total integer;
  v_valid integer;
  v_missing integer;
  v_mark jsonb;
  v_line_id uuid;
  v_line_serial text;
  v_note text;
  v_seen uuid[] := array[]::uuid[];
  v_result jsonb;
  v_inserted integer;
begin
  -- La guardia no confía en actor, rol, sede o IMEI enviado por el navegador.
  -- Es intencional conservar el bloqueo Admin-only del ejecutor actual.
  if v_actor is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede operar traslados multisede.';
  end if;
  if p_transfer_id is null or p_missing_marks is null
     or jsonb_typeof(p_missing_marks)<>'array'
     or jsonb_array_length(p_missing_marks)>100 then
    raise exception 'La recepción requiere un manifiesto y una lista de observaciones válidos.';
  end if;

  -- El ejecutor real utiliza este mismo mutex para todos los traslados,
  -- incluido el flujo legacy de pedidos. En PostgreSQL este RPC completo
  -- se ejecuta como una sola transacción de base de datos.
  perform pg_advisory_xact_lock(78192346);
  select t.status into v_status from public.nexora_transfers t
    where t.id=p_transfer_id for update;
  if v_status is distinct from 'in_transit' then
    raise exception 'Solo se pueden recibir traslados en tránsito.';
  end if;

  select coalesce(array_agg(lower(btrim(x.serial))),array[]::text[])
    into v_received
    from unnest(coalesce(p_received_serials,array[]::text[])) as x(serial);
  if cardinality(v_received)>100
    or exists(select 1 from unnest(v_received) as x(serial)
      where x.serial is null or x.serial='' or length(x.serial)>160)
    or (select count(distinct x.serial)
       from unnest(v_received) as x(serial))<>cardinality(v_received) then
    raise exception 'La lista de IMEI recibidos contiene valores vacíos, repetidos o inválidos.';
  end if;

  select count(*) into v_total from public.nexora_transfer_lines l
    where l.transfer_id=p_transfer_id and l.state='in_transit';
  select count(*) into v_valid from public.nexora_transfer_lines l
    where l.transfer_id=p_transfer_id and l.state='in_transit'
      and lower(btrim(l.serial_snapshot))=any(v_received);
  if v_total<1 or v_total>100 or v_valid<>cardinality(v_received) then
    raise exception 'La recepción no coincide con los IMEI en tránsito del manifiesto.';
  end if;
  v_missing:=v_total-v_valid;
  if jsonb_array_length(p_missing_marks)<>v_missing then
    raise exception 'Debe marcar y observar individualmente cada IMEI faltante.';
  end if;

  -- Validar ANTES de mover una sola unidad. Se usa ID de línea + serial:
  -- el número de IMEI por sí solo no autoriza otro traslado.
  for v_mark in select x.value from jsonb_array_elements(p_missing_marks) as x(value)
  loop
    if jsonb_typeof(v_mark)<>'object'
      or v_mark->'markedNotArrived' is distinct from 'true'::jsonb
      or jsonb_typeof(v_mark->'observation')<>'string' then
      raise exception 'Falta la casilla No llegó o la observación individual.';
    end if;
    v_note:=btrim(v_mark->>'observation');
    if length(v_note)<3 or length(v_note)>500 then
      raise exception 'Cada IMEI faltante requiere una nota de 3 a 500 caracteres.';
    end if;

    v_line_id:=null;
    v_line_serial:=null;
    select l.id,l.serial_snapshot into v_line_id,v_line_serial
      from public.nexora_transfer_lines l
      where l.transfer_id=p_transfer_id and l.state='in_transit'
        and l.id::text=v_mark->>'lineId'
        and lower(btrim(l.serial_snapshot))<>all(v_received);
    if v_line_id is null
      or lower(btrim(coalesce(v_mark->>'serial','')))
        <>lower(btrim(v_line_serial)) then
      raise exception 'La observación pertenece a un IMEI ajeno o recibido.';
    end if;
    if v_line_id=any(v_seen) then
      raise exception 'Un IMEI faltante fue marcado más de una vez.';
    end if;
    v_seen:=array_append(v_seen,v_line_id);
  end loop;

  if cardinality(v_seen)<>v_missing then
    raise exception 'Faltan observaciones individuales de la recepción.';
  end if;

  -- Activa el trigger del PR #144, crea documento de retorno y registra
  -- custodia recibida/pendiente con la RPC ORIGINAL. Si la inserción de notas
  -- falla, PostgreSQL revierte también ese movimiento y sus incidentes.
  v_result:=nexora_internal.execute_transfer(
    'receive',p_transfer_id,null,null,coalesce(p_received_serials,array[]::text[]),null
  );
  if (v_result->>'missing')::integer<>v_missing then
    raise exception 'La recepción cambió durante el cotejo; no se guardó.';
  end if;

  insert into public.nexora_transfer_missing_receipt_notes
    (transfer_line_id,transfer_id,serial_snapshot,receiver_observation,recorded_by)
  select a.transfer_line_id,a.transfer_id,a.serial_snapshot,
    btrim(mark.value->>'observation'),v_actor
  from public.nexora_transfer_missing_observations a
  join lateral jsonb_array_elements(p_missing_marks) as mark(value)
    on mark.value->>'lineId'=a.transfer_line_id::text
  where a.transfer_id=p_transfer_id and a.reported_by=v_actor;
  get diagnostics v_inserted=row_count;
  if v_inserted<>v_missing then
    raise exception 'No fue posible registrar todas las notas; se revierte el traslado.';
  end if;

  return v_result || jsonb_build_object('observationsRecorded',v_inserted);
end;
$$;

revoke all on function public.nexora_transfer_receive_with_notes(uuid,text[],jsonb)
  from public,anon,authenticated;
grant execute on function public.nexora_transfer_receive_with_notes(uuid,text[],jsonb)
  to authenticated;

-- No permitir que un cliente eluda la marcación individual a través de
-- la RPC anterior. CREATE/DISPATCH/RETURN/CANCEL conservan su contrato.
-- La UI nueva debe llamar al RPC de arriba y no al wrapper anterior.
create or replace function public.nexora_transfer_action(
  p_action text,
  p_transfer_id uuid default null,
  p_origin uuid default null,
  p_destination uuid default null,
  p_serials text[] default array[]::text[],
  p_note text default null
)
returns jsonb
language plpgsql security invoker
set search_path = pg_catalog,public
as $$
begin
  if p_action='receive' then
    raise exception 'Esta recepción requiere las notas individuales por IMEI y la RPC correspondiente.';
  end if;
  return nexora_internal.execute_transfer(
    p_action,p_transfer_id,p_origin,p_destination,p_serials,p_note
  );
end;
$$;

comment on table public.nexora_transfer_missing_receipt_notes is
  'Observación escrita y confirmación explícita del receptor para cada IMEI que no llegó. Historial inmutable, vinculado a la observación automática del PR #144.';
comment on function public.nexora_transfer_receive_with_notes(uuid,text[],jsonb) is
  'Única entrada API de recepción con IMEI faltantes y notas individuales; valida todo, ejecuta custodia y guarda evidencia en la misma transacción. Admin-only hasta aprobación de permisos RLS por sede.';
