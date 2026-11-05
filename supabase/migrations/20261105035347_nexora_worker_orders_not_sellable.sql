-- Nexora: IMEI físicamente en sede no equivale a IMEI libre de pedidos.
-- El reporte de Encargado/Vendedor expone committedOrders por referencia y sede.
-- Sin operaciones de escritura a inventario, pedidos ni traslados.
CREATE OR REPLACE FUNCTION public.nexora_inventory_reference_summary(p_query text DEFAULT ''::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_query text := lower(btrim(coalesce(p_query,'')));
  v_approved boolean;
  v_matched integer;
  v_items jsonb;
  v_retail_only boolean := nexora_internal.worker_session() is not null;
begin
  if auth.uid() is null or not (
    public.bodega_is_staff()
    or nexora_internal.worker_session() is not null
  ) then
    raise exception 'No tienes permiso para consultar el inventario por referencia.';
  end if;
  if p_query is null or char_length(v_query)>100 or
    p_page is null or p_page<1 or p_page>10000 or
    p_page_size is null or p_page_size<1 or p_page_size>50 then
    raise exception 'Filtros de inventario fuera de los límites permitidos.';
  end if;

  select exists(select 1 from public.nexora_initial_inventory_approvals)
    into v_approved;
  select count(*) into v_matched
    from public.bodega_products p
    where (v_query='' or strpos(lower(p.name),v_query)>0 or strpos(lower(p.sku),v_query)>0)
      and (not v_retail_only or (coalesce(lower(p.categoria),'') <> 'repuesto'
    and not exists (
      select 1 from public.bodega_product_types t
      where t.key = p.categoria and t.mayorista_group = 'repuestos'
    )
    and (nullif(p.categoria,'') is not null or not exists (
      select 1 from public.bodega_categories cat
      where cat.id = p.category_id and cat.name ~* '(repuesto|accesorio)'
    ))));

  with paged as (
    select p.id,p.name,p.sku,p.categoria,p.image_url,p.color_variants,p.price,p.cost,p.brand_id,p.technical_specs,p.description from public.bodega_products p
    where (v_query='' or strpos(lower(p.name),v_query)>0 or strpos(lower(p.sku),v_query)>0)
      and (not v_retail_only or (coalesce(lower(p.categoria),'') <> 'repuesto'
    and not exists (
      select 1 from public.bodega_product_types t
      where t.key = p.categoria and t.mayorista_group = 'repuestos'
    )
    and (nullif(p.categoria,'') is not null or not exists (
      select 1 from public.bodega_categories cat
      where cat.id = p.category_id and cat.name ~* '(repuesto|accesorio)'
    ))))
    order by p.name collate "C",p.sku collate "C",p.id
    limit p_page_size offset (p_page-1)*p_page_size
  ),
  ledger as (
    select p.id as product_id,u.id as unit_id,u.status,u.cost,u.unit_condition,
      case
        when u.status='vendido' or c.custody_status='sold' then 'vendido'
        when c.custody_status='in_transit' or u.status='en_transito' then 'en_transito'
        when c.custody_status='return_pending' then 'retorno_pendiente'
        when v_approved and init.site_id is not null
          and coalesce(c.custody_status,'at_site')='at_site' then 'en_sede'
        else 'sin_conciliar'
      end as physical_state,
      case
        when v_approved and init.site_id is not null
          and coalesce(c.custody_status,'at_site')='at_site'
          and u.status not in ('vendido','en_transito')
          then coalesce(c.site_id,init.site_id)
        else null
      end as verified_site_id,
      exists (
        select 1 from public.bodega_order_item_units oi_unit
        join public.bodega_order_items oi on oi.id=oi_unit.order_item_id
        join public.bodega_orders ord on ord.id=oi.order_id
        where oi_unit.unit_id=u.id and ord.status<>'cancelado'
      ) as committed_order,
      exists (
        select 1 from public.nexora_transfer_lines line
        where line.unit_id=u.id and line.state in ('prepared','in_transit','return_pending')
      ) as committed_transfer
    from paged p
    left join public.bodega_units u on u.product_id=p.id
    left join public.nexora_initial_unit_sites init on init.unit_id=u.id
    left join public.nexora_unit_custody c on c.unit_id=u.id
  ),
  availability as (
    select ledger.*,
      (unit_id is not null and physical_state='en_sede'
        and status in ('en_bodega','en_local')
        and cost is not null and cost>=0
        and not committed_order and not committed_transfer
      ) as ready_to_sell
    from ledger
  ),
  grouped as (
    select product_id,verified_site_id,
      count(unit_id)::integer as total,
      count(unit_id) filter(where physical_state='en_sede')::integer as physically_verified,
      count(unit_id) filter(where ready_to_sell)::integer as available,
      count(unit_id) filter(where physical_state='en_sede' and committed_order)::integer as committed_orders,
      count(unit_id) filter(where physical_state='sin_conciliar')::integer as unverified,
      count(unit_id) filter(where physical_state='en_transito')::integer as in_transit,
      count(unit_id) filter(where physical_state='retorno_pendiente')::integer as pending_return,
      count(unit_id) filter(where physical_state='vendido')::integer as sold,
      count(unit_id) filter(where physical_state='en_sede' and unit_condition='nuevo')::integer as new_units,
      count(unit_id) filter(where physical_state='en_sede' and unit_condition='seminuevo')::integer as used_units
    from availability
    group by product_id,verified_site_id
  ),
  totals as (
    select product_id,
      sum(total)::integer as total,
      sum(physically_verified)::integer as physically_verified,
      sum(available)::integer as available,
      sum(committed_orders)::integer as committed_orders,
      sum(unverified)::integer as unverified,
      sum(in_transit)::integer as in_transit,
      sum(pending_return)::integer as pending_return,
      sum(sold)::integer as sold,
      sum(new_units)::integer as new_units,
      sum(used_units)::integer as used_units
    from grouped group by product_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'productId',p.id,'name',p.name,'sku',p.sku,
    'salePrice',p.price,'referenceCost',p.cost,
    'brandName',(select b.name from public.bodega_brands b where b.id=p.brand_id),
    'newUnits',t.new_units,'usedUnits',t.used_units,
    'categoryKey',p.categoria,'imageUrl',p.image_url,
    'technicalSpecs',p.technical_specs,'description',p.description,
    'colorVariants',coalesce((
      select jsonb_agg(jsonb_build_object(
        'color',variant.photo->>'color',
        'imageUrl',variant.photo->>'imageUrl',
        'swatchHex',variant.photo->>'swatchHex'
      ))
      from jsonb_array_elements(coalesce(p.color_variants,'[]'::jsonb)) as variant(photo)
    ),'[]'::jsonb),
    'total',t.total,'physicallyVerified',t.physically_verified,
    'available',t.available,'committedOrders',t.committed_orders,'unverified',t.unverified,
    'inTransit',t.in_transit,'pendingReturn',t.pending_return,'sold',t.sold,
    'sites',coalesce((
      select jsonb_agg(jsonb_build_object(
        'siteId',g.verified_site_id,
        'siteName',coalesce(s.name,'Sin sede verificada'),
        'cityName',city.name,'total',g.total,
        'physicallyVerified',g.physically_verified,
        'available',g.available,'committedOrders',g.committed_orders,
        'unverified',g.unverified,'inTransit',g.in_transit,
        'pendingReturn',g.pending_return,'sold',g.sold
      ) order by city.name nulls last,s.name nulls last)
      from grouped g
      left join public.nexora_sites s on s.id=g.verified_site_id
      left join public.nexora_cities city on city.id=s.city_id
      where g.product_id=p.id and g.total>0
    ),'[]'::jsonb)
  ) order by p.name collate "C",p.sku collate "C",p.id),'[]'::jsonb)
  into v_items
  from paged p join totals t on t.product_id=p.id;

  return jsonb_build_object(
    'initialApproved',v_approved,'items',v_items,
    'matched',v_matched,'page',p_page,'pageSize',p_page_size,
    'scope','serialized_imei_only');
end;
$function$
;
