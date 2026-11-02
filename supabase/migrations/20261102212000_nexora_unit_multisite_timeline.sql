-- Nexora Multisede 2.0 · Tramo verificable de la hoja de vida de un IMEI.
-- El historial legacy sigue existiendo sin cambios; esta consulta aporta
-- únicamente hitos multisede comprobados. No altera inventario ni ventas.

create function public.nexora_unit_multisite_timeline(
  p_unit_id uuid,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog
as $$
declare
  v_serial text;
  v_total integer;
  v_events jsonb;
begin
  if auth.uid() is null or not public.bodega_is_staff() then
    raise exception 'Sin permiso para consultar la hoja de vida multisede.';
  end if;
  if p_unit_id is null or p_page is null or p_page < 1 or p_page > 10000
    or p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'Parámetros de consulta de IMEI inválidos.';
  end if;

  select u.serial into v_serial
  from public.bodega_units u where u.id=p_unit_id;
  if not found then
    raise exception 'El IMEI solicitado no existe.';
  end if;

  -- No atribuimos una recepción global a todos los IMEI del manifiesto:
  -- solo al serial que tiene received_at/returned_at en su línea.
  with events as (
    select
      ('initial:'||i.unit_id::text) as event_id,
      'initial_approved'::text as event_type,
      i.approved_at as event_at,
      'Conciliación física inicial aprobada'::text as description,
      null::text as origin_site,
      s.name::text as destination_site,
      null::text as reference,
      'approved'::text as unit_state
    from public.nexora_initial_unit_sites i
      join public.nexora_sites s on s.id=i.site_id
    where i.unit_id=p_unit_id and i.approved_at is not null

    union all

    select ('transfer:'||l.id::text||':prepared'),
      'transfer_prepared',t.created_at,
      'IMEI incluido en manifiesto de traslado',
      src.name,dst.name,
      'Traslado #'||t.transfer_number::text,l.state
    from public.nexora_transfer_lines l
      join public.nexora_transfers t on t.id=l.transfer_id
      join public.nexora_sites src on src.id=t.origin_site_id
      join public.nexora_sites dst on dst.id=t.destination_site_id
    where l.unit_id=p_unit_id

    union all

    select ('transfer:'||l.id::text||':dispatched'),
      'transfer_dispatched',t.dispatched_at,
      'IMEI despachado; en tránsito (no disponible)',
      src.name,dst.name,'Traslado #'||t.transfer_number::text,l.state
    from public.nexora_transfer_lines l
      join public.nexora_transfers t on t.id=l.transfer_id
      join public.nexora_sites src on src.id=t.origin_site_id
      join public.nexora_sites dst on dst.id=t.destination_site_id
    where l.unit_id=p_unit_id and t.dispatched_at is not null
      and l.state <> 'cancelled'

    union all

    select ('transfer:'||l.id::text||':received'),
      'transfer_received',l.received_at,
      'Recepción física de este IMEI confirmada en destino',
      src.name,dst.name,'Traslado #'||t.transfer_number::text,l.state
    from public.nexora_transfer_lines l
      join public.nexora_transfers t on t.id=l.transfer_id
      join public.nexora_sites src on src.id=t.origin_site_id
      join public.nexora_sites dst on dst.id=t.destination_site_id
    where l.unit_id=p_unit_id and l.received_at is not null

    union all

    select ('transfer:'||l.id::text||':missing'),
      'transfer_return_pending',doc.created_at,
      'Faltante registrado: documento de devolución pendiente, sin reingreso al stock',
      src.name,dst.name,'Traslado #'||t.transfer_number::text,l.state
    from public.nexora_transfer_lines l
      join public.nexora_transfers t on t.id=l.transfer_id
      join public.nexora_transfer_return_documents doc on doc.transfer_id=t.id
      join public.nexora_sites src on src.id=t.origin_site_id
      join public.nexora_sites dst on dst.id=t.destination_site_id
    where l.unit_id=p_unit_id and l.state in ('return_pending','returned')

    union all

    select ('transfer:'||l.id::text||':returned'),
      'transfer_returned',l.returned_at,
      'Devolución física de este IMEI confirmada',
      dst.name,src.name,'Traslado #'||t.transfer_number::text,l.state
    from public.nexora_transfer_lines l
      join public.nexora_transfers t on t.id=l.transfer_id
      join public.nexora_sites src on src.id=t.origin_site_id
      join public.nexora_sites dst on dst.id=t.destination_site_id
    where l.unit_id=p_unit_id and l.returned_at is not null

    union all

    select ('transfer:'||l.id::text||':cancelled'),
      'transfer_cancelled',t.closed_at,
      'Manifiesto de traslado cancelado antes de completarse',
      src.name,dst.name,'Traslado #'||t.transfer_number::text,l.state
    from public.nexora_transfer_lines l
      join public.nexora_transfers t on t.id=l.transfer_id
      join public.nexora_sites src on src.id=t.origin_site_id
      join public.nexora_sites dst on dst.id=t.destination_site_id
    where l.unit_id=p_unit_id and l.state='cancelled' and t.closed_at is not null

    union all

    select ('sale:'||sale.id::text),
      'retail_sale',sale.sold_at,
      'Venta minorista confirmada con pago completo',
      s.name,null::text,'Venta minorista', 'sold'::text
    from public.nexora_retail_sales sale
      join public.nexora_sites s on s.id=sale.site_id
    where sale.unit_id=p_unit_id
  ),
  counted as (
    select count(*)::integer total from events where event_at is not null
  ),
  paged as (
    select * from events
    where event_at is not null
    order by event_at desc,event_id desc
    limit p_page_size offset (p_page-1)*p_page_size
  )
  select counted.total,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'eventId',e.event_id,'eventType',e.event_type,
        'eventAt',e.event_at,'description',e.description,
        'originSite',e.origin_site,'destinationSite',e.destination_site,
        'reference',e.reference,'unitState',e.unit_state
      ) order by e.event_at desc,e.event_id desc) from paged e
    ),'[]'::jsonb)
  into v_total,v_events from counted;

  return jsonb_build_object(
    'unitId',p_unit_id,'serial',v_serial,
    'scope','multisite_confirmed_only',
    'total',v_total,'page',p_page,'pageSize',p_page_size,
    'items',v_events
  );
end;
$$;
revoke all on function public.nexora_unit_multisite_timeline(uuid,integer,integer)
  from public,anon,authenticated;
grant execute on function public.nexora_unit_multisite_timeline(uuid,integer,integer)
  to authenticated;
comment on function public.nexora_unit_multisite_timeline(uuid,integer,integer)
is 'Hitos multisede por IMEI de solo lectura. Historial legacy permanece intacto y no se duplica aquí.';
