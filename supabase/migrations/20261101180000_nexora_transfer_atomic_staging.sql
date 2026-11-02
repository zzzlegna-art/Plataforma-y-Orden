-- Nexora Multisede 2.0: RPC atomicos. SOLO PARA STAGING; NO aplicar en produccion.
-- Prerrequisitos: migraciones 20261101040000 y 20261101140000.
-- Piloto administrativo: los cuatro roles se habilitaran con la migracion RLS posterior.
-- Postgres ejecuta cada invocacion de funcion en una transaccion: cualquier error revierte todo.

alter table public.bodega_movements drop constraint bodega_movements_reference_type_check;
alter table public.bodega_movements add constraint bodega_movements_reference_type_check
  check (reference_type in ('recepcion','pedido','garantia','manual','traslado'));

alter table public.nexora_transfers add column receipt_decisions jsonb
  check (receipt_decisions is null or jsonb_typeof(receipt_decisions)='array');

-- Enviar unidades disponibles sin reservar inventario ni dejar traslados a medias.
-- Un segundo envio con igual UUID devuelve el documento existente solo si todo coincide.
create function public.nexora_dispatch_transfer(
  p_transfer_id uuid,p_origin uuid,p_destination uuid,p_unit_ids uuid[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := (select auth.uid());
  origin_kind text;
  origin_label text;
  destination_label text;
  old_transfer public.nexora_transfers%rowtype;
  item public.bodega_units%rowtype;
  count_units int := 0;
  time_now timestamptz := clock_timestamp();
begin
  if actor is null or not (select public.bodega_is_admin()) then
    raise exception 'Piloto de traslados: solo Administrador hasta migrar los permisos por sede.';
  end if;
  if p_transfer_id is null or p_origin is null or p_destination is null
    or p_origin=p_destination or p_unit_ids is null
    or cardinality(p_unit_ids) not between 1 and 500 then
    raise exception 'Datos o cantidad de unidades invalidos.';
  end if;
  if exists (select 1 from unnest(p_unit_ids) i(id) where i.id is null)
    or (select count(distinct i.id) from unnest(p_unit_ids) i(id))<>cardinality(p_unit_ids) then
    raise exception 'IMEI repetidos o vacios en el despacho.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_transfer_id::text,0));
  select * into old_transfer from public.nexora_transfers where id=p_transfer_id for update;
  if found then
    if old_transfer.kind<>'envio' or old_transfer.origin_site_id<>p_origin
      or old_transfer.destination_site_id<>p_destination
      or (select array_agg(unit_id order by unit_id) from public.nexora_transfer_units
        where transfer_id=p_transfer_id) is distinct from
         (select array_agg(id order by id) from unnest(p_unit_ids) i(id)) then
      raise exception 'El identificador ya pertenece a otro envio.';
    end if;
    return pg_catalog.jsonb_build_object('transferId',p_transfer_id,
      'status',old_transfer.status,'idempotent',true);
  end if;

  select s.kind, s.name || ' · ' || c.name into origin_kind, origin_label
    from public.nexora_sites s join public.nexora_cities c on c.id=s.city_id
    where s.id=p_origin and s.is_active for share of s;
  select s.name || ' · ' || c.name into destination_label
    from public.nexora_sites s join public.nexora_cities c on c.id=s.city_id
    where s.id=p_destination and s.is_active for share of s;
  if origin_kind is null or destination_label is null or origin_kind not in ('principal','bodega','local') then
    raise exception 'Origen inexistente o inactivo.';
  end if;

  for item in select * from public.bodega_units u where u.id=any(p_unit_ids)
      order by u.id for update loop
    count_units:=count_units+1;
    if item.site_id is distinct from p_origin or
      item.status<>case when origin_kind='local' then 'en_local' else 'en_bodega' end then
      raise exception 'IMEI % no esta disponible en el origen.',item.serial;
    end if;
    if exists(select 1 from public.nexora_transfer_units tu
      where tu.unit_id=item.id and tu.is_open) then
      raise exception 'IMEI % en otro traslado abierto.',item.serial;
    end if;
    if exists(select 1 from public.bodega_order_item_units oi
      join public.bodega_order_items li on li.id=oi.order_item_id
      join public.bodega_orders o on o.id=li.order_id
      where oi.unit_id=item.id and o.status<>'cancelado') then
      raise exception 'IMEI % comprometido en un pedido.',item.serial;
    end if;
    if exists(select 1 from public.bodega_warranties w
      where (w.unit_id=item.id or w.replacement_unit_id=item.id)
      and w.status in ('recibido','en_servicio_tecnico','reenvio_pendiente')) then
      raise exception 'IMEI % comprometido en garantia.',item.serial;
    end if;
  end loop;
  if count_units<>cardinality(p_unit_ids) then
    raise exception 'El despacho incluye unidades inexistentes.';
  end if;

  insert into public.nexora_transfers
    (id,code,origin_site_id,destination_site_id,kind,status,
     created_by,dispatched_by,created_at,dispatched_at)
  values(p_transfer_id,'TRA-'||p_transfer_id::text,p_origin,p_destination,
    'envio','en_transito',actor,actor,time_now,time_now);

  for item in select * from public.bodega_units u where u.id=any(p_unit_ids)
      order by u.id for update loop
    insert into public.nexora_transfer_units(transfer_id,unit_id,is_open)
      values(p_transfer_id,item.id,true);
    update public.bodega_units set status='en_transito' where id=item.id;
    insert into public.bodega_movements
      (unit_id,product_id,type,quantity,reference_type,reference_id,notes,created_by,created_at)
    values(item.id,item.product_id,'salida',1,'traslado',p_transfer_id,
      'Despacho multisede: '||origin_label||' hacia '||destination_label,actor,time_now);
    insert into public.nexora_transfer_events
      (transfer_id,event_type,unit_id,details,created_by,created_at)
    values(p_transfer_id,'despachado',item.id,
      pg_catalog.jsonb_build_object('serial',item.serial,'origin',p_origin,'destination',p_destination),
      actor,time_now);
  end loop;
  return pg_catalog.jsonb_build_object('transferId',p_transfer_id,'status','en_transito',
    'dispatchedCount',count_units,'idempotent',false);
end; $$;

-- En la recepcion, todas las unidades se marcan recibidas o faltantes.
-- Faltantes generan UNA devolucion pendiente; no vuelven al disponible hasta verificarse.
create function public.nexora_receive_transfer(p_transfer_id uuid,p_decisions jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := (select auth.uid());
  tr public.nexora_transfers%rowtype;
  destination_kind text;
  destination_label text;
  now_at timestamptz := clock_timestamp();
  mark jsonb;
  normalized jsonb := '[]'::jsonb;
  uid uuid;
  decision text;
  observation text;
  item public.bodega_units%rowtype;
  sent_count int;
  received_count int := 0;
  missing_count int := 0;
  return_id uuid;
begin
  if actor is null or not (select public.bodega_is_admin()) then
    raise exception 'Piloto de recepcion: solo Administrador hasta migrar permisos por sede.';
  end if;
  if p_transfer_id is null or pg_catalog.jsonb_typeof(p_decisions) is distinct from 'array' then
    raise exception 'Se requiere una lista de verificacion por IMEI.';
  end if;
  if pg_catalog.jsonb_array_length(p_decisions) not between 1 and 500 then
    raise exception 'La lista debe contener entre 1 y 500 IMEI.';
  end if;
  for mark in select value from pg_catalog.jsonb_array_elements(p_decisions) loop
    if pg_catalog.jsonb_typeof(mark)<>'object' or nullif(mark->>'unit_id','') is null then
      raise exception 'Cada elemento requiere identificador de IMEI.';
    end if;
    uid:=(mark->>'unit_id')::uuid;
    decision:=mark->>'decision';
    observation:=btrim(coalesce(mark->>'observation',''));
    if decision is null or decision not in ('recibido','no_llego')
      or (decision='no_llego' and observation='') then
      raise exception 'Marcar recibido o no llego; los faltantes requieren observacion.';
    end if;
    normalized:=normalized||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('unit_id',uid,'decision',decision,
        'observation',observation));
  end loop;
  select pg_catalog.jsonb_agg(value order by value->>'unit_id') into normalized
    from pg_catalog.jsonb_array_elements(normalized);
  if (select count(distinct value->>'unit_id') from pg_catalog.jsonb_array_elements(normalized))
     <>pg_catalog.jsonb_array_length(normalized) then
    raise exception 'IMEI duplicados en la recepcion.';
  end if;

  select * into tr from public.nexora_transfers where id=p_transfer_id for update;
  if not found or tr.kind<>'envio' then raise exception 'Envio no encontrado.'; end if;
  if tr.status in ('recibido','recepcion_parcial') then
    if tr.receipt_decisions is distinct from normalized then
      raise exception 'Este traslado ya tiene otra recepcion confirmada.';
    end if;
    return pg_catalog.jsonb_build_object('transferId',p_transfer_id,
      'status',tr.status,'idempotent',true,
      'receivedCount',(select count(*) from public.nexora_transfer_units
        where transfer_id=p_transfer_id and receipt_status='recibido'),
      'missingCount',(select count(*) from public.nexora_transfer_units
        where transfer_id=p_transfer_id and receipt_status='no_llego'),
      'returnId',(select id from public.nexora_transfers
        where original_transfer_id=p_transfer_id and kind='retorno_faltantes'));
  end if;
  if tr.status not in ('en_transito','pendiente_recepcion') then
    raise exception 'El traslado no se encuentra en transito.';
  end if;
  select s.kind, s.name || ' · ' || c.name into destination_kind, destination_label
    from public.nexora_sites s join public.nexora_cities c on c.id=s.city_id
    where s.id=tr.destination_site_id and s.is_active;
  if destination_kind is null then raise exception 'Destino inactivo.'; end if;
  select count(*) into sent_count from public.nexora_transfer_units where transfer_id=p_transfer_id;
  if sent_count<>pg_catalog.jsonb_array_length(normalized) or sent_count=0 then
    raise exception 'Falta verificar alguno de los IMEI despachados.';
  end if;

  for mark in select value from pg_catalog.jsonb_array_elements(normalized) loop
    uid:=(mark->>'unit_id')::uuid;
    if not exists(select 1 from public.nexora_transfer_units
      where transfer_id=p_transfer_id and unit_id=uid and is_open
        and receipt_status='pendiente') then
      raise exception 'IMEI ajeno al traslado o ya marcado.';
    end if;
    select * into item from public.bodega_units where id=uid for update;
    if not found or item.status<>'en_transito' then
      raise exception 'IMEI fuera de transito o inexistente.';
    end if;
  end loop;

  update public.nexora_transfer_units set is_open=false where transfer_id=p_transfer_id;
  for mark in select value from pg_catalog.jsonb_array_elements(normalized) loop
    uid:=(mark->>'unit_id')::uuid;
    decision:=mark->>'decision';
    observation:=mark->>'observation';
    select * into item from public.bodega_units where id=uid;
    update public.nexora_transfer_units set receipt_status=decision,
      receipt_observation=nullif(observation,''),marked_by=actor,marked_at=now_at
      where transfer_id=p_transfer_id and unit_id=uid;
    if decision='recibido' then
      received_count:=received_count+1;
      update public.bodega_units set
        site_id=tr.destination_site_id,
        status=case when destination_kind='local' then 'en_local' else 'en_bodega' end
        where id=uid;
      insert into public.bodega_movements
        (unit_id,product_id,type,quantity,reference_type,reference_id,notes,created_by,created_at)
      values(uid,item.product_id,'entrada',1,'traslado',p_transfer_id,
        'Recepción física en '||destination_label,actor,now_at);
      insert into public.nexora_transfer_events
        (transfer_id,event_type,unit_id,details,created_by,created_at)
      values(p_transfer_id,'recepcion_confirmada',uid,
        pg_catalog.jsonb_build_object('destination',tr.destination_site_id),actor,now_at);
    else
      missing_count:=missing_count+1;
      insert into public.nexora_transfer_events
        (transfer_id,event_type,unit_id,details,created_by,created_at)
      values(p_transfer_id,'faltante_reportado',uid,
        pg_catalog.jsonb_build_object('observation',observation),actor,now_at);
    end if;
  end loop;

  if missing_count>0 then
    return_id:=pg_catalog.gen_random_uuid();
    insert into public.nexora_transfers
      (id,code,origin_site_id,destination_site_id,kind,status,original_transfer_id,
       created_by,dispatched_by,created_at,dispatched_at,notes)
    values(return_id,'RET-'||return_id::text,tr.destination_site_id,tr.origin_site_id,
      'retorno_faltantes','pendiente_recepcion',p_transfer_id,
      actor,actor,now_at,now_at,'Faltantes: verificar fisicamente en sede de origen');
    insert into public.nexora_transfer_units(transfer_id,unit_id,is_open)
      select return_id,unit_id,true from public.nexora_transfer_units
      where transfer_id=p_transfer_id and receipt_status='no_llego';
    insert into public.nexora_transfer_events(transfer_id,event_type,details,created_by,created_at)
      values(return_id,'creado',pg_catalog.jsonb_build_object('originalTransferId',p_transfer_id),
        actor,now_at);
    insert into public.nexora_transfer_events(transfer_id,event_type,details,created_by,created_at)
      values(p_transfer_id,'devolucion_generada',
        pg_catalog.jsonb_build_object('returnTransferId',return_id),actor,now_at);
  end if;
  update public.nexora_transfers set
    status=case when missing_count>0 then 'recepcion_parcial' else 'recibido' end,
    received_by=actor,received_at=now_at,receipt_decisions=normalized
    where id=p_transfer_id;
  return pg_catalog.jsonb_build_object('transferId',p_transfer_id,
    'status',case when missing_count>0 then 'recepcion_parcial' else 'recibido' end,
    'receivedCount',received_count,'missingCount',missing_count,
    'returnId',return_id,'idempotent',false);
end; $$;

-- Revisar fisicamente las devoluciones. No encontradas siguen EN TRANSITO y en INCIDENCIA.
create function public.nexora_verify_origin_return(p_return_id uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid := (select auth.uid());
 tr public.nexora_transfers%rowtype;
 now_at timestamptz := clock_timestamp();
 entry jsonb;
 canonical jsonb := '[]'::jsonb;
 uid uuid;
 present boolean;
 notes text;
 item public.bodega_units%rowtype;
 destination_kind text;
 destination_label text;
 total int;
 verified int := 0;
 incidents int := 0;
begin
 if actor is null or not (select public.bodega_is_admin()) then
   raise exception 'Piloto de devoluciones: solo Administrador hasta migrar permisos por sede.';
 end if;
 if p_return_id is null or pg_catalog.jsonb_typeof(p_rows) is distinct from 'array' then
   raise exception 'Lista de IMEI del retorno invalida.';
 end if;
 if pg_catalog.jsonb_array_length(p_rows) not between 1 and 500 then
   raise exception 'Lista del retorno vacia o demasiado grande.';
 end if;
 for entry in select value from pg_catalog.jsonb_array_elements(p_rows) loop
   if pg_catalog.jsonb_typeof(entry)<>'object' or nullif(entry->>'unit_id','') is null
      or pg_catalog.jsonb_typeof(entry->'present') is distinct from 'boolean' then
     raise exception 'Cada IMEI requiere unit_id y present booleano.';
   end if;
   uid:=(entry->>'unit_id')::uuid;
   present:=(entry->>'present')::boolean;
   notes:=btrim(coalesce(entry->>'observation',''));
   if not present and notes='' then
     raise exception 'Explica por que el equipo no aparece fisicamente.';
   end if;
   canonical:=canonical||pg_catalog.jsonb_build_array(
     pg_catalog.jsonb_build_object('unit_id',uid,'present',present,'observation',notes));
 end loop;
 select pg_catalog.jsonb_agg(value order by value->>'unit_id') into canonical
   from pg_catalog.jsonb_array_elements(canonical);
 if (select count(distinct value->>'unit_id') from pg_catalog.jsonb_array_elements(canonical))
    <>pg_catalog.jsonb_array_length(canonical) then
   raise exception 'IMEI duplicados en la devolucion.';
 end if;
 select * into tr from public.nexora_transfers where id=p_return_id for update;
 if not found or tr.kind<>'retorno_faltantes' then
   raise exception 'Devolucion inexistente.';
 end if;
 if tr.status in ('recibido','incidencia') then
   if tr.receipt_decisions is distinct from canonical then
     raise exception 'Ya existe una revision diferente de este retorno.';
   end if;
   return pg_catalog.jsonb_build_object('returnId',p_return_id,
     'status',tr.status,'idempotent',true);
 end if;
 if tr.status<>'pendiente_recepcion' then raise exception 'Retorno no pendiente.'; end if;
 select s.kind, s.name || ' · ' || c.name into destination_kind, destination_label
   from public.nexora_sites s join public.nexora_cities c on c.id=s.city_id
   where s.id=tr.destination_site_id and s.is_active;
 if destination_kind is null then raise exception 'Sede de origen desactivada.'; end if;
 select count(*) into total from public.nexora_transfer_units where transfer_id=p_return_id;
 if total<>pg_catalog.jsonb_array_length(canonical) or total=0 then
   raise exception 'Revisa todos los IMEI de esta devolucion.';
 end if;
 for entry in select value from pg_catalog.jsonb_array_elements(canonical) loop
   uid:=(entry->>'unit_id')::uuid;
   if not exists(select 1 from public.nexora_transfer_units
     where transfer_id=p_return_id and unit_id=uid and is_open
       and receipt_status='pendiente') then
     raise exception 'Unidad ajena a la devolucion o ya verificada.';
   end if;
   select * into item from public.bodega_units where id=uid for update;
   if not found or item.status<>'en_transito' then
     raise exception 'Equipo ya no se encuentra en transito.';
   end if;
 end loop;
 for entry in select value from pg_catalog.jsonb_array_elements(canonical) loop
   uid:=(entry->>'unit_id')::uuid;
   present:=(entry->>'present')::boolean;
   notes:=entry->>'observation';
   select * into item from public.bodega_units where id=uid;
   update public.nexora_transfer_units set
     receipt_status=case when present then 'recibido' else 'no_llego' end,
     receipt_observation=nullif(notes,''),marked_by=actor,marked_at=now_at,
     is_open=not present where transfer_id=p_return_id and unit_id=uid;
   if present then
     verified:=verified+1;
     update public.bodega_units set site_id=tr.destination_site_id,
       status=case when destination_kind='local' then 'en_local' else 'en_bodega' end
       where id=uid;
     insert into public.bodega_movements
       (unit_id,product_id,type,quantity,reference_type,reference_id,notes,created_by,created_at)
     values(uid,item.product_id,'entrada',1,'traslado',p_return_id,
       'Devolución verificada físicamente en '||destination_label,actor,now_at);
     insert into public.nexora_transfer_events
       (transfer_id,event_type,unit_id,details,created_by,created_at)
     values(p_return_id,'retorno_verificado',uid,
       pg_catalog.jsonb_build_object('site',tr.destination_site_id),actor,now_at);
   else
     incidents:=incidents+1;
     insert into public.nexora_transfer_events
       (transfer_id,event_type,unit_id,details,created_by,created_at)
     values(p_return_id,'incidencia',uid,
       pg_catalog.jsonb_build_object('observation',notes),actor,now_at);
   end if;
 end loop;
 update public.nexora_transfers set
   status=case when incidents>0 then 'incidencia' else 'recibido' end,
   received_by=actor,received_at=now_at,receipt_decisions=canonical
   where id=p_return_id;
 return pg_catalog.jsonb_build_object('returnId',p_return_id,
   'status',case when incidents>0 then 'incidencia' else 'recibido' end,
   'verifiedCount',verified,'incidentCount',incidents,'idempotent',false);
end; $$;

-- Resolver una incidencia abierta solo si el IMEI aparece fisicamente
-- en la bodega de origen. Si aun no aparece, la incidencia sigue abierta.
-- Se conserva el documento y la observacion originales como evidencia.
create function public.nexora_resolve_origin_incident(
  p_return_id uuid, p_unit_id uuid, p_observation text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := (select auth.uid());
  tr public.nexora_transfers%rowtype;
  unit_row public.nexora_transfer_units%rowtype;
  item public.bodega_units%rowtype;
  dest_kind text;
  dest_label text;
  remaining int;
  at_time timestamptz := clock_timestamp();
begin
  if actor is null or not (select public.bodega_is_admin()) then
    raise exception 'Solo el Administrador puede resolver incidencias durante el piloto.';
  end if;
  if p_return_id is null or p_unit_id is null
     or nullif(btrim(coalesce(p_observation,'')),'') is null then
    raise exception 'Selecciona el IMEI encontrado y escribe como se verifico fisicamente.';
  end if;

  select * into tr from public.nexora_transfers
    where id=p_return_id for update;
  if not found or tr.kind<>'retorno_faltantes'
      or tr.status not in ('incidencia','recibido') then
    raise exception 'La devolucion no tiene una incidencia verificable.';
  end if;

  select * into unit_row from public.nexora_transfer_units
    where transfer_id=p_return_id and unit_id=p_unit_id for update;
  if not found then
    raise exception 'IMEI no pertenece a esta devolucion.';
  end if;

  -- Reintento tras una respuesta perdida: comprobar el evento de resolucion
  -- en lugar de tomar un equipo recibido originalmente como incidencia resuelta.
  if not unit_row.is_open and unit_row.receipt_status='recibido'
     and exists (
       select 1 from public.nexora_transfer_events
       where transfer_id=p_return_id and unit_id=p_unit_id
         and event_type='incidencia_resuelta'
     ) then
    if not exists (
      select 1 from public.nexora_transfer_events
      where transfer_id=p_return_id and unit_id=p_unit_id
        and event_type='incidencia_resuelta'
        and details->>'observation' = btrim(p_observation)
    ) then
      raise exception 'La incidencia ya fue resuelta con otra observacion.';
    end if;
    return pg_catalog.jsonb_build_object('returnId',p_return_id,
      'unitId',p_unit_id,'status',tr.status,'idempotent',true);
  end if;

  if tr.status<>'incidencia' or not unit_row.is_open
      or unit_row.receipt_status<>'no_llego' then
    raise exception 'El IMEI no tiene una incidencia abierta.';
  end if;

  select s.kind,s.name||' · '||c.name into dest_kind,dest_label
    from public.nexora_sites s
    join public.nexora_cities c on c.id=s.city_id
    where s.id=tr.destination_site_id and s.is_active;
  if dest_kind not in ('principal','bodega','local') or dest_kind is null then
    raise exception 'La bodega de origen esta inactiva.';
  end if;
  select * into item from public.bodega_units where id=p_unit_id for update;
  if not found or item.status<>'en_transito'
      or item.site_id is distinct from tr.destination_site_id then
    raise exception 'El IMEI no coincide con el origen de esta devolucion.';
  end if;

  -- Mismo bloqueo y actualizacion atomica que el retorno ordinario.
  update public.nexora_transfer_units
    set receipt_status='recibido',is_open=false,
        marked_by=actor,marked_at=at_time
    where transfer_id=p_return_id and unit_id=p_unit_id;
  update public.bodega_units set
      site_id=tr.destination_site_id,
      status=case when dest_kind='local' then 'en_local' else 'en_bodega' end
    where id=p_unit_id;
  insert into public.bodega_movements
    (unit_id,product_id,type,quantity,reference_type,reference_id,notes,created_by,created_at)
  values (p_unit_id,item.product_id,'entrada',1,'traslado',p_return_id,
    'Incidencia resuelta: IMEI verificado fisicamente en '||dest_label,actor,at_time);
  insert into public.nexora_transfer_events
    (transfer_id,event_type,unit_id,details,created_by,created_at)
  values (p_return_id,'incidencia_resuelta',p_unit_id,
    pg_catalog.jsonb_build_object('observation',btrim(p_observation),
      'verified_site',tr.destination_site_id),actor,at_time);

  select count(*) into remaining from public.nexora_transfer_units
    where transfer_id=p_return_id and is_open;
  if remaining=0 then
    update public.nexora_transfers
      set status='recibido'
      where id=p_return_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'returnId',p_return_id,'unitId',p_unit_id,
    'status',case when remaining=0 then 'recibido' else 'incidencia' end,
    'remainingIncidents',remaining,'idempotent',false);
end; $$;

-- Public RPC requiere chequeo interno estricto de auth y rol ACTIVO.
-- Revocar PUBLIC explícitamente para evitar acceso anónimo por privilegio default.
revoke all on function public.nexora_dispatch_transfer(uuid,uuid,uuid,uuid[]) from public,anon;
revoke all on function public.nexora_receive_transfer(uuid,jsonb) from public,anon;
revoke all on function public.nexora_verify_origin_return(uuid,jsonb) from public,anon;
revoke all on function public.nexora_resolve_origin_incident(uuid,uuid,text) from public,anon;
grant execute on function public.nexora_dispatch_transfer(uuid,uuid,uuid,uuid[]) to authenticated;
grant execute on function public.nexora_receive_transfer(uuid,jsonb) to authenticated;
grant execute on function public.nexora_verify_origin_return(uuid,jsonb) to authenticated;
grant execute on function public.nexora_resolve_origin_incident(uuid,uuid,text) to authenticated;
