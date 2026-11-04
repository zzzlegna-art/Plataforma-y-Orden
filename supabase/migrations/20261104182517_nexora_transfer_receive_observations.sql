-- Nexora Multisede V4 · recepción parcial con nota escrita por IMEI.
-- REQUIERE la migración 20261104182506_nexora_transfer_missing_observations.sql.
-- BORRADOR, NO APLICADO EN PRODUCCIÓN. Desplegar solo junto con la UI
-- compatible, después de pruebas Supabase aisladas y revisión de respaldo.
--
-- Conserva intacto el motor vigente: sus permisos por sede, bloqueo,
-- custodia, documento de retorno y reversión transaccional.


-- Lectura de manifiestos y evidencias del Bodeguero únicamente en sus sedes
-- activas. Encargado/Vendedor conservan la política worker por local activo.
create policy nexora_transfers_bodeguero_site_read
  on public.nexora_transfers for select to authenticated
  using (
    (select public.bodega_is_staff()) and exists (
      select 1 from public.nexora_staff_sites assigned
      join public.nexora_sites site on site.id=assigned.site_id
      where assigned.user_id=(select auth.uid()) and assigned.is_active
        and site.is_active
        and assigned.site_id in (origin_site_id,destination_site_id)
    )
  );

create policy nexora_transfer_lines_bodeguero_site_read
  on public.nexora_transfer_lines for select to authenticated
  using (
    (select public.bodega_is_staff()) and exists (
      select 1 from public.nexora_transfers transfer
      where transfer.id=nexora_transfer_lines.transfer_id
    )
  );

create policy nexora_transfer_returns_bodeguero_site_read
  on public.nexora_transfer_return_documents for select to authenticated
  using (
    (select public.bodega_is_staff()) and exists (
      select 1 from public.nexora_transfers transfer
      where transfer.id=nexora_transfer_return_documents.transfer_id
    )
  );

create policy nexora_transfer_events_bodeguero_site_read
  on public.nexora_transfer_events for select to authenticated
  using (
    (select public.bodega_is_staff()) and exists (
      select 1 from public.nexora_transfers transfer
      where transfer.id=nexora_transfer_events.transfer_id
    )
  );

-- Las incidencias siguen siendo inmutables. Visibles para quien participa
-- en origen o destino, sin exponer manifiestos de otras sedes.
create policy nexora_transfer_missing_participant_read
  on public.nexora_transfer_missing_observations for select to authenticated
  using (
    ((select public.bodega_is_staff()) or
      nexora_internal.worker_session() is not null)
    and exists (
      select 1 from public.nexora_transfers transfer
      where transfer.id=nexora_transfer_missing_observations.transfer_id
    )
  );

-- Booleano mínimo; NO revela la cantidad/costo de IMEI ni el acta Admin.
create function public.nexora_transfer_ready()
returns boolean language sql stable security definer
set search_path = pg_catalog
as $ready$
  select auth.uid() is not null
    and (public.bodega_is_staff() or
      nexora_internal.worker_session() is not null)
    and exists (select 1 from public.nexora_initial_inventory_approvals);
$ready$;
revoke all on function public.nexora_transfer_ready()
  from public,anon,authenticated;
grant execute on function public.nexora_transfer_ready() to authenticated;
comment on function public.nexora_transfer_ready() is
  'Estado booleano de habilitación para traslados de cuatro roles sin revelar actas ni inventario. No autoriza un movimiento sin validaciones de sede, ruta, IMEI y custodia.';

-- Clave compuesta redundante pero deliberada: evita asociar una nota de
-- recepción a un traslado, IMEI o autor distinto del incidente original,
-- incluso si un mantenimiento privilegiado intenta escribir una fila errónea.
-- La clave individual transfer_line_id de la auditoría sigue siendo UNIQUE.
alter table public.nexora_transfer_missing_observations
  add constraint nexora_missing_incident_evidence_identity_key
  unique (transfer_line_id,transfer_id,serial_snapshot,reported_by);

create table public.nexora_transfer_missing_receipt_notes (
  transfer_line_id uuid primary key,
  transfer_id uuid not null references public.nexora_transfers(id) on delete restrict,
  serial_snapshot text not null,
  receiver_observation text not null
    check (length(regexp_replace(receiver_observation,
      '^[[:space:]]+|[[:space:]]+$','','g')) between 3 and 500),
  recorded_by uuid not null references public.bodega_profiles(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  constraint nexora_missing_note_matches_original_incident
    foreign key (transfer_line_id,transfer_id,serial_snapshot,recorded_by)
    references public.nexora_transfer_missing_observations
      (transfer_line_id,transfer_id,serial_snapshot,reported_by)
    on delete restrict
);
create index nexora_transfer_missing_notes_by_transfer
  on public.nexora_transfer_missing_receipt_notes(transfer_id,recorded_at);

alter table public.nexora_transfer_missing_receipt_notes
  enable row level security;
create policy nexora_transfer_missing_receipt_notes_admin_read
  on public.nexora_transfer_missing_receipt_notes
  for select to authenticated
  using ((select public.bodega_is_admin()));
create policy nexora_transfer_missing_receipt_notes_participant_read
  on public.nexora_transfer_missing_receipt_notes
  for select to authenticated
  using (
    ((select public.bodega_is_staff()) or
      nexora_internal.worker_session() is not null)
    and exists (
      select 1 from public.nexora_transfers transfer
      where transfer.id=nexora_transfer_missing_receipt_notes.transfer_id
    )
  );
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
  v_worker jsonb;
  v_destination uuid;
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
  -- Verifica el perfil operativo desde la base: ningún rol o sede del
  -- navegador concede autoridad. El motor verifica otra vez el traslado.
  v_worker:=nexora_internal.worker_session();
  if v_actor is null or not (public.bodega_is_staff() or v_worker is not null) then
    raise exception 'No tienes permiso para operar traslados multisede.';
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
  select t.status,t.destination_site_id into v_status,v_destination
    from public.nexora_transfers t where t.id=p_transfer_id for update;

  -- Solo quien pertenece al destino recibe; el Administrador puede
  -- actuar globalmente. El sitio asignado debe seguir activo.
  if not public.bodega_is_admin() and (
      (v_worker is not null and
       ((v_worker->>'siteId')::uuid is distinct from v_destination))
      or (v_worker is null and not exists (
        select 1 from public.nexora_staff_sites assigned
        join public.nexora_sites site on site.id=assigned.site_id
        where assigned.user_id=v_actor and assigned.is_active
          and assigned.site_id=v_destination and site.is_active
      ))
    ) then
    raise exception 'No tienes permiso para recibir en la sede de destino.';
  end if;
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
    -- Incluye tabuladores, saltos de línea y otras clases Unicode
    -- reconocidas por PostgreSQL como espacios; no basta con btrim(' ').
    v_note:=regexp_replace(v_mark->>'observation',
      '^[[:space:]]+|[[:space:]]+$','','g');
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
    regexp_replace(mark.value->>'observation',
      '^[[:space:]]+|[[:space:]]+$','','g'),v_actor
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
language plpgsql security definer
set search_path = pg_catalog
as $nexora_wrapper$
declare
  v_actor uuid := auth.uid();
  v_worker jsonb := nexora_internal.worker_session();
  v_required_site uuid;
begin
  -- Autoriza por identidad y rol real en DB, nunca por datos de la interfaz.
  if v_actor is null or not (
      public.bodega_is_staff() or v_worker is not null
    ) then
    raise exception 'No tienes permiso para operar traslados multisede.';
  end if;
  if p_action='receive' then
    raise exception 'Esta recepción requiere las notas individuales por IMEI y la RPC correspondiente.';
  end if;

  -- Origen autoriza create/dispatch/return/cancel; receive se valida en
  -- la RPC atómica de notas usando el DESTINO. El Administrador es global.
  if p_action='create' then
    v_required_site:=p_origin;
  elsif p_action in ('dispatch','return','cancel') then
    select t.origin_site_id into v_required_site
    from public.nexora_transfers t where t.id=p_transfer_id;
  end if;

  if v_required_site is not null and not public.bodega_is_admin() then
    if v_worker is not null then
      if (v_worker->>'siteId')::uuid is distinct from v_required_site then
        raise exception 'Solo puedes enviar mercancía de tu local asignado.';
      end if;
    elsif not exists (
      select 1 from public.nexora_staff_sites assigned
      join public.nexora_sites site on site.id=assigned.site_id
      where assigned.user_id=v_actor and assigned.is_active
        and site.is_active and assigned.site_id=v_required_site
    ) then
      raise exception 'Bodeguero: no puedes operar un traslado de una sede no asignada.';
    end if;
  end if;

  -- La RPC interna revalida la ruta, titularidad física por IMEI,
  -- documento, estado y custodia bajo una sola transacción.
  return nexora_internal.execute_transfer(
    p_action,p_transfer_id,p_origin,p_destination,p_serials,p_note
  );
end;
$nexora_wrapper$;

-- Importante: la RPC interna original era ejecutable por authenticated,
-- que podía saltarse el nuevo requisito de observaciones llamando a
-- execute_transfer('receive',...) directamente. El esquema nexora_internal
-- no es API pública, pero revocamos EXECUTE para cerrar el bypass incluso
-- desde clientes SQL con USAGE en ese esquema.
--
-- El wrapper público es ahora SECURITY DEFINER y revalida identidad/rol
-- en el ejecutor original para las demás etapas (create/dispatch/return/cancel).
-- El recibo con notas también es SECURITY DEFINER y usa la función privada.
revoke all on function nexora_internal.execute_transfer(
  text,uuid,uuid,uuid,text[],text
) from public,anon,authenticated;
revoke all on function public.nexora_transfer_action(
  text,uuid,uuid,uuid,text[],text
) from public,anon,authenticated;
grant execute on function public.nexora_transfer_action(
  text,uuid,uuid,uuid,text[],text
) to authenticated;

comment on table public.nexora_transfer_missing_receipt_notes is
  'Observación escrita y confirmación explícita del receptor para cada IMEI que no llegó. Historial inmutable, vinculado a la observación automática del PR #144.';
comment on function public.nexora_transfer_receive_with_notes(uuid,text[],jsonb) is
  'Recepción por IMEI y notas atómicas: Admin o trabajador de destino asignado, validación de origen/destino, custodia y retorno físico.';
