-- Nexora: enriquecer ventas previas con referencia, cliente, fecha y procedencia del Excel.
alter table public.bodega_previous_serials
  add column if not exists referencia text,
  add column if not exists cliente text,
  add column if not exists fecha_venta date,
  add column if not exists archivo_origen text,
  add column if not exists hoja_origen text,
  add column if not exists fila_origen integer;

create index if not exists bodega_previous_serials_referencia_idx
  on public.bodega_previous_serials (lower(btrim(referencia)))
  where referencia is not null;
create index if not exists bodega_previous_serials_cliente_idx
  on public.bodega_previous_serials (lower(btrim(cliente)))
  where cliente is not null;

create or replace function public.nexora_importar_ventas_previas(p_registros jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_total integer := 0;
  v_importados integer := 0;
  v_duplicados integer := 0;
  v_archivos integer := 0;
  v_auditoria jsonb := null;
  v_user_email text := '';
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'BODEGA_FORBIDDEN' using errcode = '42501';
  end if;

  if p_registros is null or jsonb_typeof(p_registros) is distinct from 'array' then
    raise exception 'BODEGA_SERIAL_PREVIOS_INVALIDOS' using errcode = '22023';
  end if;

  if jsonb_array_length(p_registros) > 20000 then
    raise exception 'BODEGA_SERIAL_PREVIOS_LIMITE' using errcode = '22023';
  end if;

  -- Comparte el mismo bloqueo que los guardados normales de Nexora para que la
  -- comprobación contra inventario y recepciones pendientes no tenga carreras.
  perform pg_advisory_xact_lock(78192346);

  with entrada as materialized (
    select
      btrim(coalesce(item.value ->> 'serial', '')) as serial,
      lower(btrim(coalesce(item.value ->> 'serial', ''))) as clave,
      nullif(btrim(item.value ->> 'referencia'), '') as referencia,
      nullif(btrim(item.value ->> 'cliente'), '') as cliente,
      case
        when pg_input_is_valid(nullif(btrim(item.value ->> 'fechaVenta'), ''), 'date')
          then (item.value ->> 'fechaVenta')::date
        else null
      end as fecha_venta,
      nullif(btrim(item.value ->> 'archivoOrigen'), '') as archivo_origen,
      nullif(btrim(item.value ->> 'hojaOrigen'), '') as hoja_origen,
      case
        when coalesce(item.value ->> 'filaOrigen', '') ~ '^[0-9]{1,9}$'
          then (item.value ->> 'filaOrigen')::integer
        else null
      end as fila_origen,
      nullif(btrim(item.value ->> 'notas'), '') as notas,
      item.orden
    from jsonb_array_elements(p_registros) with ordinality as item(value, orden)
    where nullif(btrim(coalesce(item.value ->> 'serial', '')), '') is not null
  ),
  unicos as materialized (
    select distinct on (clave) *
    from entrada
    order by clave, orden
  ),
  elegibles as materialized (
    select u.*
    from unicos u
    where not exists (
      select 1
      from public.bodega_units unit
      where lower(btrim(unit.serial)) = u.clave
    )
    and not exists (
      select 1
      from public.bodega_reception_items item
      where lower(btrim(item.serial)) = u.clave
    )
  ),
  insertados as (
    insert into public.bodega_previous_serials (
      serial, notas, referencia, cliente, fecha_venta,
      archivo_origen, hoja_origen, fila_origen, created_by
    )
    select
      e.serial, e.notas, e.referencia, e.cliente, e.fecha_venta,
      e.archivo_origen, e.hoja_origen, e.fila_origen, auth.uid()
    from elegibles e
    order by e.orden
    on conflict ((lower(btrim(serial)))) do nothing
    returning id
  )
  select
    (select count(*)::integer from jsonb_array_elements(p_registros)),
    (select count(*)::integer from insertados),
    (select count(distinct nullif(btrim(value ->> 'archivoOrigen'), ''))::integer
       from jsonb_array_elements(p_registros))
  into v_total, v_importados, v_archivos;

  v_duplicados := greatest(v_total - v_importados, 0);

  if v_importados > 0 then
    select coalesce(email, '')
      into v_user_email
      from public.bodega_profiles
      where id = auth.uid();

    insert into public.bodega_audit_logs (
      user_id, user_email, action, entity, entity_id, details, created_at
    )
    values (
      auth.uid(),
      v_user_email,
      'create',
      'serial_previo',
      null,
      format('%s seriales previos importados desde %s archivo(s)', v_importados, greatest(v_archivos, 1)),
      now()
    )
    returning jsonb_build_object(
      'id', id,
      'userId', user_id,
      'userEmail', user_email,
      'action', action,
      'entity', entity,
      'entityId', entity_id,
      'details', details,
      'createdAt', created_at
    ) into v_auditoria;
  end if;

  return jsonb_build_object(
    'importados', v_importados,
    'duplicados', v_duplicados,
    'auditoria', v_auditoria
  );
end;
$function$;

revoke all on function public.nexora_importar_ventas_previas(jsonb) from public, anon;
grant execute on function public.nexora_importar_ventas_previas(jsonb) to authenticated;

-- Mantener compatibilidad con las versiones de Nexora que aún envían solo seriales.
create or replace function public.nexora_importar_seriales_previos(
  p_seriales text[],
  p_notas text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_registros jsonb;
begin
  if coalesce(cardinality(p_seriales), 0) > 20000 then
    raise exception 'BODEGA_SERIAL_PREVIOS_LIMITE' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('serial', btrim(valor), 'notas', p_notas)
      order by orden
    ),
    '[]'::jsonb
  )
  into v_registros
  from unnest(coalesce(p_seriales, array[]::text[])) with ordinality as valores(valor, orden);

  return public.nexora_importar_ventas_previas(v_registros);
end;
$function$;

revoke all on function public.nexora_importar_seriales_previos(text[], text) from public, anon;
grant execute on function public.nexora_importar_seriales_previos(text[], text) to authenticated;
