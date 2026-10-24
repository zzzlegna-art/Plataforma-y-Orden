-- Nexora: importación masiva de seriales previos con metadatos y trazabilidad por archivo.
-- Los datos históricos siguen separados del inventario activo.

create table public.bodega_previous_serial_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_file text not null,
  rows_read integer not null default 0 check (rows_read >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  inventory_conflict_count integer not null default 0 check (inventory_conflict_count >= 0),
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.bodega_previous_serials
  add column referencia text,
  add column cliente text,
  add column fecha_venta date,
  add column source_file text,
  add column import_batch_id uuid references public.bodega_previous_serial_import_batches(id) on delete set null;

create index bodega_previous_serials_import_batch_idx
  on public.bodega_previous_serials (import_batch_id);
create index bodega_previous_serial_import_batches_created_at_idx
  on public.bodega_previous_serial_import_batches (created_at desc);

alter table public.bodega_previous_serial_import_batches enable row level security;
grant select, insert, update on public.bodega_previous_serial_import_batches to authenticated;
create policy bodega_previous_serial_import_batches_read
  on public.bodega_previous_serial_import_batches
  for select to authenticated
  using (public.bodega_is_staff());
create policy bodega_previous_serial_import_batches_insert
  on public.bodega_previous_serial_import_batches
  for insert to authenticated
  with check (public.bodega_is_admin());
create policy bodega_previous_serial_import_batches_update
  on public.bodega_previous_serial_import_batches
  for update to authenticated
  using (public.bodega_is_admin())
  with check (public.bodega_is_admin());

create or replace function public.nexora_importar_seriales_previos_detallado(
  p_registros jsonb,
  p_archivo_origen text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_total integer := 0;
  v_importados integer := 0;
  v_duplicados integer := 0;
  v_conflictos integer := 0;
  v_lote_id uuid;
  v_auditoria jsonb := null;
  v_user_email text := '';
  v_archivo text := coalesce(nullif(btrim(p_archivo_origen), ''), 'Importación sin nombre');
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'BODEGA_FORBIDDEN' using errcode = '42501';
  end if;

  if p_registros is null or jsonb_typeof(p_registros) <> 'array' then
    raise exception 'BODEGA_SERIAL_PREVIOS_ENTRADA_INVALIDA' using errcode = '22023';
  end if;

  if jsonb_array_length(p_registros) > 20000 then
    raise exception 'BODEGA_SERIAL_PREVIOS_LIMITE' using errcode = '22023';
  end if;

  if length(v_archivo) > 255 then
    raise exception 'BODEGA_SERIAL_PREVIOS_ARCHIVO_INVALIDO' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_registros) as entrada(valor)
    where nullif(btrim(valor->>'fechaVenta'), '') is not null
      and btrim(valor->>'fechaVenta') !~ '^\d{4}-\d{2}-\d{2}$'
  ) then
    raise exception 'BODEGA_SERIAL_PREVIOS_FECHA_INVALIDA' using errcode = '22023';
  end if;

  select count(*)::integer
    into v_total
  from jsonb_array_elements(p_registros) as entrada(valor)
  where nullif(btrim(valor->>'serial'), '') is not null;

  if v_total = 0 then
    return jsonb_build_object(
      'leidos', 0,
      'importados', 0,
      'duplicados', 0,
      'conflictosInventario', 0
    );
  end if;

  insert into public.bodega_previous_serial_import_batches (
    source_file, rows_read, created_by
  )
  values (v_archivo, v_total, auth.uid())
  returning id into v_lote_id;

  -- Cuenta un conflicto por serial único si existe en inventario activo y aún
  -- no existe en el registro histórico. Las repeticiones adicionales son duplicados.
  with entrada as materialized (
    select
      btrim(valor->>'serial') as serial,
      lower(btrim(valor->>'serial')) as clave,
      orden
    from jsonb_array_elements(p_registros) with ordinality as items(valor, orden)
    where nullif(btrim(valor->>'serial'), '') is not null
  ),
  unicos as materialized (
    select distinct on (clave) serial, clave, orden
    from entrada
    order by clave, orden
  )
  select count(*)::integer
    into v_conflictos
  from unicos u
  where not exists (
    select 1
    from public.bodega_previous_serials previo
    where lower(btrim(previo.serial)) = u.clave
  )
  and exists (
    select 1
    from public.bodega_units unidad
    where lower(btrim(unidad.serial)) = u.clave
  );

  with entrada as materialized (
    select
      btrim(valor->>'serial') as serial,
      lower(btrim(valor->>'serial')) as clave,
      nullif(btrim(valor->>'referencia'), '') as referencia,
      nullif(btrim(valor->>'cliente'), '') as cliente,
      nullif(btrim(valor->>'fechaVenta'), '')::date as fecha_venta,
      nullif(btrim(valor->>'notas'), '') as notas,
      orden
    from jsonb_array_elements(p_registros) with ordinality as items(valor, orden)
    where nullif(btrim(valor->>'serial'), '') is not null
  ),
  unicos as materialized (
    select distinct on (clave)
      serial, clave, referencia, cliente, fecha_venta, notas, orden
    from entrada
    order by clave, orden
  ),
  insertados as (
    insert into public.bodega_previous_serials (
      serial, notas, referencia, cliente, fecha_venta, source_file,
      import_batch_id, created_by
    )
    select
      u.serial, u.notas, u.referencia, u.cliente, u.fecha_venta, v_archivo,
      v_lote_id, auth.uid()
    from unicos u
    where not exists (
      select 1
      from public.bodega_units unidad
      where lower(btrim(unidad.serial)) = u.clave
    )
    order by u.orden
    on conflict ((lower(btrim(serial)))) do nothing
    returning id
  )
  select count(*)::integer into v_importados from insertados;

  v_duplicados := greatest(v_total - v_importados - v_conflictos, 0);

  update public.bodega_previous_serial_import_batches
  set imported_count = v_importados,
      duplicate_count = v_duplicados,
      inventory_conflict_count = v_conflictos
  where id = v_lote_id;

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
    format(
      'Importación de seriales previos: archivo %s; leídos %s; nuevos %s; duplicados %s; conflictos con inventario %s',
      v_archivo, v_total, v_importados, v_duplicados, v_conflictos
    ),
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

  return jsonb_build_object(
    'loteId', v_lote_id,
    'archivo', v_archivo,
    'leidos', v_total,
    'importados', v_importados,
    'duplicados', v_duplicados,
    'conflictosInventario', v_conflictos,
    'auditoria', v_auditoria
  );
end;
$function$;

revoke all on function public.nexora_importar_seriales_previos_detallado(jsonb, text) from public, anon;
grant execute on function public.nexora_importar_seriales_previos_detallado(jsonb, text) to authenticated;

-- Conserva compatibilidad con versiones anteriores de la aplicación, pero aplica
-- las mismas reglas de deduplicación y conflicto con el inventario activo.
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
  v_resultado jsonb;
begin
  select coalesce(
    jsonb_agg(jsonb_build_object('serial', btrim(serial), 'notas', p_notas) order by orden),
    '[]'::jsonb
  )
  into v_registros
  from unnest(coalesce(p_seriales, array[]::text[])) with ordinality as entrada(serial, orden)
  where nullif(btrim(serial), '') is not null;

  v_resultado := public.nexora_importar_seriales_previos_detallado(v_registros, 'Pegado manual');

  return jsonb_build_object(
    'importados', coalesce((v_resultado->>'importados')::integer, 0),
    'duplicados', coalesce((v_resultado->>'duplicados')::integer, 0),
    'conflictosInventario', coalesce((v_resultado->>'conflictosInventario')::integer, 0),
    'auditoria', v_resultado->'auditoria'
  );
end;
$function$;

revoke all on function public.nexora_importar_seriales_previos(text[], text) from public, anon;
grant execute on function public.nexora_importar_seriales_previos(text[], text) to authenticated;

comment on function public.nexora_importar_seriales_previos_detallado(jsonb, text)
  is 'Importa hasta 20.000 seriales previos con referencia, cliente, fecha de venta y archivo de origen; omite duplicados y seriales ya existentes en inventario, y registra un lote auditable.';
