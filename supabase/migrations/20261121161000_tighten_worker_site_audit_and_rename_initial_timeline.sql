create or replace function nexora_internal.audit_worker_enabled_change()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_site uuid;
  v_count integer;
  v_marker text;
  v_root constant uuid := 'cf03b83a-a23f-4bd2-a778-2c071fa9df2e';
begin
  if new.operationally_enabled is not distinct from old.operationally_enabled then
    return new;
  end if;

  select count(*), (array_agg(site_id))[1]
    into v_count, v_site
  from public.nexora_staff_sites ss
  where ss.user_id = new.user_id and ss.is_active;

  if v_count <> 1 or v_site is distinct from v_root
     or not exists (
       select 1 from public.nexora_sites s
       where s.id = v_root and s.is_active
         and s.site_type = 'principal' and s.name = 'Bodega 6A'
     ) then
    raise exception 'Para cambiar el acceso se requiere una única asignación activa a Bodega 6A.';
  end if;

  select au.raw_app_meta_data->>'nexora_prepared_role'
    into v_marker
  from auth.users au
  where au.id = new.user_id;

  if v_marker is distinct from new.planned_role
     or v_marker not in ('encargado', 'vendedor') then
    raise exception 'La activación no corresponde a la identidad de Auth.';
  end if;

  insert into public.nexora_worker_activation_events
    (user_id, site_id, role, action, actor_id)
  values (
    new.user_id,
    v_site,
    new.planned_role,
    case when new.operationally_enabled then 'activated' else 'deactivated' end,
    auth.uid()
  );

  return new;
end;
$function$;

create or replace function public.nexora_unit_initial_approval_timeline(
  p_unit_id uuid,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_serial text;
  v_total integer;
  v_events jsonb;
begin
  if auth.uid() is null or not public.bodega_is_staff() then
    raise exception 'Sin permiso para consultar el historial de conciliación inicial.';
  end if;

  if p_unit_id is null or p_page is null or p_page < 1 or p_page > 10000
     or p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'Parámetros de consulta de IMEI inválidos.';
  end if;

  select u.serial into v_serial
  from public.bodega_units u
  where u.id = p_unit_id;

  if not found then
    raise exception 'El IMEI solicitado no existe.';
  end if;

  with events as (
    select
      ('initial:' || i.unit_id::text) event_id,
      'initial_approved'::text event_type,
      i.approved_at event_at,
      'Conciliación física inicial aprobada'::text description,
      null::text origin_site,
      s.name::text destination_site,
      null::text reference,
      'approved'::text unit_state
    from public.nexora_initial_unit_sites i
    join public.nexora_sites s on s.id = i.site_id
    where i.unit_id = p_unit_id and i.approved_at is not null
  ),
  counted as (
    select count(*)::integer total from events where event_at is not null
  ),
  paged as (
    select * from events
    where event_at is not null
    order by event_at desc, event_id desc
    limit p_page_size offset (p_page - 1) * p_page_size
  )
  select
    counted.total,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'eventId', e.event_id,
        'eventType', e.event_type,
        'eventAt', e.event_at,
        'description', e.description,
        'originSite', e.origin_site,
        'destinationSite', e.destination_site,
        'reference', e.reference,
        'unitState', e.unit_state
      ) order by e.event_at desc, e.event_id desc)
      from paged e
    ), '[]'::jsonb)
  into v_total, v_events
  from counted;

  return jsonb_build_object(
    'unitId', p_unit_id,
    'serial', v_serial,
    'scope', 'initial_approval_only',
    'total', v_total,
    'page', p_page,
    'pageSize', p_page_size,
    'items', v_events
  );
end;
$function$;
