-- Reduce the bulk-import response size; the app refreshes its current data snapshot after success.
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
  v_total integer := 0;
  v_importados integer := 0;
  v_duplicados integer := 0;
  v_auditoria jsonb := null;
  v_user_email text := '';
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'BODEGA_FORBIDDEN' using errcode = '42501';
  end if;

  if coalesce(cardinality(p_seriales), 0) > 20000 then
    raise exception 'BODEGA_SERIAL_PREVIOS_LIMITE' using errcode = '22023';
  end if;

  with entrada as materialized (
    select
      btrim(valor) as serial,
      lower(btrim(valor)) as clave,
      orden
    from unnest(coalesce(p_seriales, array[]::text[])) with ordinality as valores(valor, orden)
    where nullif(btrim(valor), '') is not null
  ),
  unicos as materialized (
    select distinct on (clave) serial, clave, orden
    from entrada
    order by clave, orden
  ),
  insertados as (
    insert into public.bodega_previous_serials (serial, notas, created_by)
    select u.serial, nullif(btrim(p_notas), ''), auth.uid()
    from unicos u
    order by u.orden
    on conflict ((lower(btrim(serial)))) do nothing
    returning id
  )
  select
    (select count(*)::integer from entrada),
    (select count(*)::integer from insertados)
  into v_total, v_importados;

  v_duplicados := v_total - v_importados;

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
      format('%s seriales previos importados (lote)', v_importados),
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
