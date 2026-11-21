-- El inventario operativo debe mostrar el catálogo completo, incluidos repuestos.
-- Se elimina únicamente el filtro heredado del POS para cuentas operativas preparadas.
-- Se conservan autenticación, autorización, paginación, custodia e historial.

CREATE OR REPLACE FUNCTION public.nexora_inventory_imei_directory(p_state text DEFAULT 'all'::text, p_site_id uuid DEFAULT NULL::uuid, p_query text DEFAULT ''::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_summary jsonb;
  v_items jsonb;
  v_total integer;
  v_query text := lower(btrim(coalesce(p_query,'')));
  v_approved boolean;
begin
  if auth.uid() is null or not (
    public.bodega_is_staff()
    or nexora_internal.worker_session() is not null
  ) then
    raise exception 'Tu sesión no tiene permiso para consultar el inventario global.';
  end if;
  if p_state is null or p_state not in
    ('all','sin_conciliar','en_sede','vendido')
    or p_page is null or p_page<1 or p_page>10000
    or p_page_size is null or p_page_size<1 or p_page_size>50
    or char_length(v_query)>100 then
    raise exception 'Parámetros de inventario fuera de los límites permitidos.';
  end if;
  if p_site_id is not null and not exists(
    select 1 from public.nexora_sites where id=p_site_id
  ) then
    raise exception 'La sede solicitada no existe.';
  end if;

  select exists(select 1 from public.nexora_initial_inventory_approvals)
    into v_approved;

  with ledger as (
    select u.id,u.serial,u.status,u.location,u.product_id,
      p.name as product_name,p.sku,p.categoria as category_key,
      p.image_url,p.color_variants,p.technical_specs,p.description,
      case
        when u.status='vendido' then 'vendido'
        when v_approved and i.site_id is not null then 'en_sede'
        else 'sin_conciliar'
      end as custody_state,
      case when v_approved and i.site_id is not null
        then i.site_id end as effective_site_id,
      exists (
        select 1 from public.bodega_order_item_units l
        join public.bodega_order_items oi on oi.id=l.order_item_id
        join public.bodega_orders ord on ord.id=oi.order_id
        where l.unit_id=u.id and ord.status<>'cancelado'
      ) as committed_order
    from public.bodega_units u
    join public.bodega_products p on p.id=u.product_id
    left join public.nexora_initial_unit_sites i on i.unit_id=u.id
    
  )
  select jsonb_build_object(
    'sinConciliar',count(*) filter(where custody_state='sin_conciliar'),
    'enSede',count(*) filter(where custody_state='en_sede'),
    'enTransito',count(*) filter(where custody_state='en_transito'),
    'retornoPendiente',count(*) filter(where custody_state='retorno_pendiente'),
    'vendidos',count(*) filter(where custody_state='vendido'),
    'total',count(*)
  ) into v_summary from ledger;

  with ledger as (
    select u.id,u.serial,u.status,u.location,p.name as product_name,p.sku,
      p.categoria as category_key,p.image_url,p.color_variants,
      p.technical_specs,p.description,
      case
        when u.status='vendido' then 'vendido'
        when v_approved and i.site_id is not null then 'en_sede'
        else 'sin_conciliar'
      end as custody_state,
      case when v_approved and i.site_id is not null
        then i.site_id end as effective_site_id,
      exists (
        select 1 from public.bodega_order_item_units l
        join public.bodega_order_items oi on oi.id=l.order_item_id
        join public.bodega_orders ord on ord.id=oi.order_id
        where l.unit_id=u.id and ord.status<>'cancelado'
      ) as committed_order
    from public.bodega_units u
    join public.bodega_products p on p.id=u.product_id
    left join public.nexora_initial_unit_sites i on i.unit_id=u.id
    
  ),
  filtered as (
    select * from ledger
    where (p_state='all' or custody_state=p_state)
      and (p_site_id is null or effective_site_id=p_site_id)
      and (v_query='' or strpos(lower(serial),v_query)>0
        or strpos(lower(product_name),v_query)>0
        or strpos(lower(sku),v_query)>0)
  )
  select count(*) into v_total from filtered;

  with ledger as (
    select u.id,u.serial,u.status,u.location,p.name as product_name,p.sku,
      p.categoria as category_key,p.image_url,p.color_variants,
      p.technical_specs,p.description,
      case
        when u.status='vendido' then 'vendido'
        when v_approved and i.site_id is not null then 'en_sede'
        else 'sin_conciliar'
      end as custody_state,
      case when v_approved and i.site_id is not null
        then i.site_id end as effective_site_id,
      exists (
        select 1 from public.bodega_order_item_units l
        join public.bodega_order_items oi on oi.id=l.order_item_id
        join public.bodega_orders ord on ord.id=oi.order_id
        where l.unit_id=u.id and ord.status<>'cancelado'
      ) as committed_order
    from public.bodega_units u
    join public.bodega_products p on p.id=u.product_id
    left join public.nexora_initial_unit_sites i on i.unit_id=u.id
    
  ),
  page as (
    select * from ledger
    where (p_state='all' or custody_state=p_state)
      and (p_site_id is null or effective_site_id=p_site_id)
      and (v_query='' or strpos(lower(serial),v_query)>0
        or strpos(lower(product_name),v_query)>0
        or strpos(lower(sku),v_query)>0)
    order by product_name collate "C",serial collate "C",id
    limit p_page_size offset (p_page-1)*p_page_size
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'unitId',id,'serial',serial,'productName',product_name,'sku',sku,
    'categoryKey',category_key,'imageUrl',image_url,
    'technicalSpecs',technical_specs,'description',description,
    'colorVariants',coalesce((
      select jsonb_agg(jsonb_build_object(
        'color',variant.photo->>'color',
        'imageUrl',variant.photo->>'imageUrl',
        'swatchHex',variant.photo->>'swatchHex'
      ))
      from jsonb_array_elements(coalesce(color_variants,'[]'::jsonb)) as variant(photo)
    ),'[]'::jsonb),
    'unitStatus',status,'custodyState',custody_state,
    'historicalLocation',location,'committedOrder',committed_order
  ) order by product_name collate "C",serial collate "C",id),'[]'::jsonb)
  into v_items from page;

  return jsonb_build_object(
    'initialApproved',v_approved,'summary',v_summary,
    'items',v_items,'page',p_page,'pageSize',p_page_size,'matched',v_total
  );
end;
$function$
;

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
    where (v_query='' or strpos(lower(p.name),v_query)>0 or strpos(lower(p.sku),v_query)>0);

  with paged as (
    select p.id,p.name,p.sku,p.categoria,p.image_url,p.color_variants,
      p.technical_specs,p.description
    from public.bodega_products p
    where (v_query='' or strpos(lower(p.name),v_query)>0 or strpos(lower(p.sku),v_query)>0)
    order by p.name collate "C",p.sku collate "C",p.id
    limit p_page_size offset (p_page-1)*p_page_size
  ),
  ledger as (
    select p.id as product_id,u.id as unit_id,u.status,u.unit_condition,
      case
        when u.status='vendido' then 'vendido'
        when v_approved and init.site_id is not null then 'en_sede'
        else 'sin_conciliar'
      end as physical_state,
      exists (
        select 1 from public.bodega_order_item_units oi_unit
        join public.bodega_order_items oi on oi.id=oi_unit.order_item_id
        join public.bodega_orders ord on ord.id=oi.order_id
        where oi_unit.unit_id=u.id and ord.status<>'cancelado'
      ) as committed_order
    from paged p
    left join public.bodega_units u on u.product_id=p.id
    left join public.nexora_initial_unit_sites init on init.unit_id=u.id
    
  ),
  totals as (
    select product_id,
      count(unit_id)::integer as total,
      count(unit_id) filter(where physical_state='en_sede')::integer as physically_verified,
      count(unit_id) filter(where physical_state='en_sede' and committed_order)::integer as committed_orders,
      count(unit_id) filter(where physical_state='sin_conciliar')::integer as unverified,
      count(unit_id) filter(where physical_state='en_transito')::integer as in_transit,
      count(unit_id) filter(where physical_state='retorno_pendiente')::integer as pending_return,
      count(unit_id) filter(where physical_state='vendido')::integer as sold
    from ledger
    group by product_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'productId',p.id,'name',p.name,'sku',p.sku,
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
    'committedOrders',t.committed_orders,'unverified',t.unverified,
    'inTransit',t.in_transit,'pendingReturn',t.pending_return,'sold',t.sold
  ) order by p.name collate "C",p.sku collate "C",p.id),'[]'::jsonb)
  into v_items
  from paged p join totals t on t.product_id=p.id;

  return jsonb_build_object(
    'initialApproved',v_approved,'items',v_items,
    'matched',v_matched,'page',p_page,'pageSize',p_page_size,
    'scope','serialized_imei_only'
  );
end;
$function$
;
