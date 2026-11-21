-- Remove obsolete operational money fields. Historical snapshots in nexora_archive are intentionally untouched.
-- Warranty refund agreements and their payment evidence are also preserved as warranty history.

drop trigger if exists nexora_zero_legacy_order_item_amounts on public.bodega_order_items;
drop trigger if exists nexora_zero_legacy_order_total on public.bodega_orders;
drop trigger if exists nexora_zero_legacy_product_amounts on public.bodega_products;
drop trigger if exists nexora_zero_legacy_reception_item_cost on public.bodega_reception_items;
drop trigger if exists nexora_zero_legacy_unit_cost on public.bodega_units;
drop trigger if exists nexora_zero_legacy_warranty_cost on public.bodega_warranties;

drop function if exists nexora_internal.zero_legacy_order_item_amounts();
drop function if exists nexora_internal.zero_legacy_order_total();
drop function if exists nexora_internal.zero_legacy_product_amounts();
drop function if exists nexora_internal.zero_legacy_reception_item_cost();
drop function if exists nexora_internal.zero_legacy_unit_cost();
drop function if exists nexora_internal.zero_legacy_warranty_cost();

-- Remove obsolete price/cost keys from product color variants while retaining color and image data.
update public.bodega_products p
set color_variants = coalesce((
  select jsonb_agg(v.value - 'price' - 'cost' order by v.ordinality)
  from jsonb_array_elements(p.color_variants) with ordinality as v(value, ordinality)
), '[]'::jsonb)
where jsonb_typeof(p.color_variants) = 'array'
  and p.color_variants::text ~ '"(price|cost)"';

alter table public.bodega_order_items
  drop column if exists unit_price,
  drop column if exists subtotal;

alter table public.bodega_orders
  drop column if exists total;

alter table public.bodega_products
  drop column if exists price,
  drop column if exists cost;

alter table public.bodega_reception_items
  drop column if exists cost;

alter table public.bodega_units
  drop column if exists cost;

alter table public.bodega_warranties
  drop column if exists costo;

-- Historical snapshots remain intact in nexora_archive, but monetary values are not exposed
-- by the operational serial-trace API.
create or replace function public.nexora_historical_serial_trace(p_serial text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_serial text := lower(btrim(coalesce(p_serial, '')));
  v_unit_id uuid;
  v_order_id uuid;
  v_result jsonb;
  v_events jsonb;
  v_warranties jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.bodega_profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role in ('admin', 'bodeguero')
  ) then
    raise exception 'No tienes permiso para consultar el historial de seriales.'
      using errcode = '42501';
  end if;

  if char_length(v_serial) < 5 or char_length(v_serial) > 80 then
    raise exception 'Ingresa un serial completo (5-80 caracteres).'
      using errcode = '22023';
  end if;

  select l.source_unit_id, o.source_id,
    jsonb_build_object(
      'found', true,
      'serial', l.serial,
      'source', 'Techrez',
      'readOnly', true,
      'order', jsonb_build_object(
        'sourceId', o.source_id,
        'code', o.code,
        'status', o.status,
        'orderDate', o.order_date,
        'deliveryDate', o.snapshot ->> 'delivery_date'
      ),
      'customer', jsonb_build_object(
        'name', coalesce(nullif(c.snapshot ->> 'name', ''), 'Cliente sin identificar'),
        'phone', c.snapshot ->> 'phone'
      ),
      'product', jsonb_build_object(
        'name', coalesce(nullif(p.snapshot ->> 'name', ''), 'Referencia histórica'),
        'sku', p.snapshot ->> 'sku',
        'category', p.snapshot ->> 'categoria',
        'imageUrl', case when img.match_count = 1 then img.image_url else null end,
        'imageSource', case when img.match_count = 1 then 'exact_catalog_reference' else null end
      ),
      'unit', jsonb_build_object(
        'sourceId', l.source_unit_id,
        'status', u.snapshot ->> 'status',
        'condition', u.snapshot ->> 'unit_condition',
        'color', u.snapshot ->> 'color',
        'receivedAt', u.snapshot ->> 'received_at',
        'assignedAt', l.source_link_snapshot ->> 'created_at'
      ),
      'line', jsonb_build_object(
        'sourceId', i.source_id,
        'quantity', coalesce(nullif(i.snapshot ->> 'quantity', '')::numeric, 0)
      )
    )
  into v_unit_id, v_order_id, v_result
  from nexora_archive.order_serial_links l
  join nexora_archive.units u
    on u.source_ref = l.source_ref
   and u.source_id = l.source_unit_id
  join nexora_archive.order_items i
    on i.source_ref = l.source_ref
   and i.source_id = l.source_order_item_id
  join nexora_archive.orders o
    on o.source_ref = i.source_ref
   and o.source_id = i.source_order_id
  left join nexora_archive.customers c
    on c.source_ref = o.source_ref
   and c.source_id = o.source_customer_id
  left join nexora_archive.products p
    on p.source_ref = i.source_ref
   and p.source_id = i.source_product_id
  left join lateral (
    select count(*)::integer as match_count,
           max(bp.image_url) as image_url
    from public.bodega_products bp
    where bp.image_url is not null
      and btrim(bp.image_url) <> ''
      and bp.categoria = p.snapshot ->> 'categoria'
      and regexp_replace(
            regexp_replace(lower(bp.name), '^apple[[:space:]]+', '', 'g'),
            '[[:space:]]+', '', 'g'
          ) = regexp_replace(
            regexp_replace(lower(p.snapshot ->> 'name'), '^apple[[:space:]]+', '', 'g'),
            '[[:space:]]+', '', 'g'
          )
  ) img on true
  where l.source_ref = 'kiizldurgjtorxpzebpm'
    and lower(btrim(l.serial)) = v_serial
    and lower(btrim(u.serial)) = v_serial
  order by o.order_date desc, l.source_id
  limit 1;

  if v_result is null then
    return jsonb_build_object('found', false, 'serial', btrim(p_serial), 'readOnly', true);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.source_id,
        'occurredAt', m.occurred_at,
        'type', m.movement_type,
        'referenceType', m.reference_type,
        'referenceId', m.reference_id,
        'quantity', m.snapshot ->> 'quantity',
        'notes', m.snapshot ->> 'notes'
      ) order by m.occurred_at desc, m.source_id
    ), '[]'::jsonb
  ) into v_events
  from nexora_archive.serial_movements m
  where m.source_ref = 'kiizldurgjtorxpzebpm'
    and (
      m.source_unit_id = v_unit_id
      or (
        m.reference_id = v_order_id
        and m.serial is not null
        and lower(btrim(m.serial)) = v_serial
      )
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', w.source_id,
        'code', w.snapshot ->> 'code',
        'status', w.status,
        'reason', w.snapshot ->> 'reason',
        'receivedAt', w.snapshot ->> 'received_at',
        'resolvedAt', w.snapshot ->> 'resolved_at',
        'replacementSerial', w.replacement_unit_serial,
        'originalSerial', w.unit_serial,
        'events', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', e.source_id,
                'status', e.snapshot ->> 'status',
                'notes', e.snapshot ->> 'notes',
                'occurredAt', e.occurred_at
              ) order by e.occurred_at
            )
            from nexora_archive.warranty_events e
            where e.source_ref = w.source_ref
              and e.source_warranty_id = w.source_id
          ), '[]'::jsonb
        )
      ) order by w.imported_at desc, w.source_id
    ), '[]'::jsonb
  ) into v_warranties
  from nexora_archive.warranties w
  where w.source_ref = 'kiizldurgjtorxpzebpm'
    and (
      w.source_unit_id = v_unit_id
      or w.source_replacement_unit_id = v_unit_id
      or lower(btrim(coalesce(w.unit_serial, ''))) = v_serial
      or lower(btrim(coalesce(w.replacement_unit_serial, ''))) = v_serial
      or lower(btrim(coalesce(w.snapshot ->> 'imei_manual', ''))) = v_serial
    );

  return v_result || jsonb_build_object('movements', v_events, 'warranties', v_warranties);
end;
$function$;

-- Currency configuration is no longer needed after removing operational price and cost features.
alter table public.bodega_settings drop column if exists currency;
