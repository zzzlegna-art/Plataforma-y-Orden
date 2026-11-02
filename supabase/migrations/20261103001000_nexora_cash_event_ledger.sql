-- Nexora Multisede 2.0: historial detallado de eventos de caja.
-- Solo lectura para Administrador; RLS existente aplica mediante SECURITY INVOKER.
-- No expone JSON arbitrario del evento ni cambia inventario, ventas o cierres.
create function public.nexora_cash_event_ledger(
  p_from date default null,
  p_to date default null,
  p_site_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 25
) returns jsonb
language plpgsql stable security invoker
set search_path=pg_catalog
as $$
declare
  v_to date := coalesce(p_to,(now() at time zone 'America/Bogota')::date);
  v_from date := coalesce(p_from,v_to-29);
  v_total integer;
  v_items jsonb;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede consultar los eventos de caja.';
  end if;
  if v_from>v_to or v_to-v_from>365 or p_page is null or p_page<1 or p_page>10000
    or p_page_size is null or p_page_size<1 or p_page_size>50 then
    raise exception 'Período o paginación de bitácora inválidos.';
  end if;
  if p_site_id is not null and not exists(
    select 1 from public.nexora_sites where id=p_site_id and site_type='local'
  ) then
    raise exception 'La sede de caja solicitada no existe.';
  end if;

  select count(*)::integer into v_total
  from public.nexora_cash_events ev
    join public.nexora_cash_sessions cs on cs.id=ev.session_id
  where cs.business_date between v_from and v_to
    and (p_site_id is null or cs.site_id=p_site_id);

  with audit_page as (
    select ev.id,ev.session_id,ev.action,ev.note,ev.occurred_at,
      ev.data,cs.business_date,cs.site_id,cs.state as current_session_state,
      site.name as site_name,city.name as city_name,
      actor.full_name as actor_name,actor.email as actor_email
    from public.nexora_cash_events ev
    join public.nexora_cash_sessions cs on cs.id=ev.session_id
    join public.nexora_sites site on site.id=cs.site_id and site.site_type='local'
    join public.nexora_cities city on city.id=site.city_id
    join public.bodega_profiles actor on actor.id=ev.actor_id
    where cs.business_date between v_from and v_to
      and (p_site_id is null or cs.site_id=p_site_id)
    order by ev.occurred_at desc,ev.id desc
    limit p_page_size offset (p_page-1)*p_page_size
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId',a.id::text,
    'sessionId',a.session_id,
    'siteId',a.site_id,'siteName',a.site_name,'cityName',a.city_name,
    'businessDate',a.business_date,
    'action',a.action,'occurredAt',a.occurred_at,
    'actorName',a.actor_name,'actorEmail',a.actor_email,
    'note',a.note,
    'currentSessionState',a.current_session_state,
    'amount',case when a.action='open'
      then (a.data->>'openingCash')::numeric
      when a.action='expense' then (a.data->>'amount')::numeric
      else null::numeric end,
    'expected',case when a.action='close'
      then (a.data->>'expected')::numeric else null::numeric end,
    'counted',case when a.action='close'
      then (a.data->>'counted')::numeric else null::numeric end,
    'priorClosingDifference',case when a.action='reopen'
      then (a.data->>'priorClosingDifference')::numeric else null::numeric end
  ) order by a.occurred_at desc,a.id desc),'[]'::jsonb)
  into v_items from audit_page a;

  return jsonb_build_object('scope','cash_events_admin_only',
    'timezone','America/Bogota','from',v_from,'to',v_to,
    'siteId',p_site_id,'page',p_page,'pageSize',p_page_size,
    'total',v_total,'items',v_items);
end;
$$;
revoke all on function public.nexora_cash_event_ledger(date,date,uuid,integer,integer)
  from public,anon,authenticated;
grant execute on function public.nexora_cash_event_ledger(date,date,uuid,integer,integer)
  to authenticated;
comment on function public.nexora_cash_event_ledger(date,date,uuid,integer,integer)
is 'Bitácora de caja por Administrador, con actor, tipo de operación, fecha y valores aprobados. Solo lectura sin exponer JSON arbitrario.';
