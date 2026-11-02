-- Nexora Multisede: lectura global por IMEI dentro de Inventario.
-- No asigna, vende, reserva ni traslada unidades. Las no conciliadas
-- permanecen explícitamente SIN SEDE hasta el acta física inicial.

create function public.nexora_inventory_imei_directory(
  p_state text default 'all',
  p_site_id uuid default null,
  p_query text default '',
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public
as $$
declare
  v_result jsonb;
  v_summary jsonb;
  v_sites jsonb;
  v_total integer;
  v_query text := lower(btrim(coalesce(p_query,'')));
  v_approved boolean;
begin
  if auth.uid() is null or not (
    public.bodega_is_staff()
    or exists (
      select 1 from public.bodega_profiles bp
      join public.nexora_staff_role_plans rp on rp.user_id=bp.id
      where bp.id=auth.uid() and bp.is_active
        and rp.operationally_enabled and rp.planned_role in ('encargado','vendedor')
    )
  ) then
    raise exception 'Tu sesión no tiene permiso para consultar el inventario global.';
  end if;
  if p_state is null or p_state not in
    ('all','sin_conciliar','en_sede','en_transito','retorno_pendiente','vendido')
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
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'name',s.name,'city',c.name,'siteType',s.site_type
  ) order by c.name,s.name),'[]'::jsonb)
  into v_sites from public.nexora_sites s
    join public.nexora_cities c on c.id=s.city_id where s.is_active;

  -- La categoría de custodia prevalece sobre el texto 'location' legacy.
  -- Ni un registro de traslado ni un IMEI vendido cuentan como disponible.
  with ledger as (
    select u.id,u.serial,u.status,u.cost,u.location,u.product_id,
      p.name as product_name,p.sku,
      case
        when u.status='vendido' or coalesce(c.custody_status,'')='sold'
          then 'vendido'
        when c.custody_status='in_transit' then 'en_transito'
        when c.custody_status='return_pending' then 'retorno_pendiente'
        when v_approved and i.site_id is not null
          and coalesce(c.custody_status,'at_site')='at_site'
          then 'en_sede'
        else 'sin_conciliar'
      end as custody_state,
      case when v_approved and i.site_id is not null
         and coalesce(c.custody_status,'at_site')='at_site'
        then coalesce(c.site_id,i.site_id) end as effective_site_id,
      exists (
        select 1 from public.bodega_order_item_units l
        join public.bodega_order_items oi on oi.id=l.order_item_id
        join public.bodega_orders ord on ord.id=oi.order_id
        where l.unit_id=u.id and ord.status<>'cancelado'
      ) as committed_order,
      exists (
        select 1 from public.nexora_transfer_lines l
        where l.unit_id=u.id and l.state in ('prepared','in_transit','return_pending')
      ) as committed_transfer
    from public.bodega_units u
    join public.bodega_products p on p.id=u.product_id
    left join public.nexora_initial_unit_sites i on i.unit_id=u.id
    left join public.nexora_unit_custody c on c.unit_id=u.id
  )
  select jsonb_build_object(
    'sinConciliar',count(*) filter(where custody_state='sin_conciliar'),
    'enSede',count(*) filter(where custody_state='en_sede'),
    'enTransito',count(*) filter(where custody_state='en_transito'),
    'retornoPendiente',count(*) filter(where custody_state='retorno_pendiente'),
    'vendidos',count(*) filter(where custody_state='vendido'),
    'sinCosto',count(*) filter(where cost is null and status<>'vendido'),
    'total',count(*)
  ) into v_summary from ledger;

  with ledger as (
    select u.id,u.serial,u.status,u.cost,u.location,p.name as product_name,p.sku,
      case
        when u.status='vendido' or coalesce(c.custody_status,'')='sold'
          then 'vendido'
        when c.custody_status='in_transit' then 'en_transito'
        when c.custody_status='return_pending' then 'retorno_pendiente'
        when v_approved and i.site_id is not null
          and coalesce(c.custody_status,'at_site')='at_site'
          then 'en_sede'
        else 'sin_conciliar'
      end as custody_state,
      case when v_approved and i.site_id is not null
        and coalesce(c.custody_status,'at_site')='at_site'
        then coalesce(c.site_id,i.site_id) end as effective_site_id,
      exists (
        select 1 from public.bodega_order_item_units l
        join public.bodega_order_items oi on oi.id=l.order_item_id
        join public.bodega_orders ord on ord.id=oi.order_id
        where l.unit_id=u.id and ord.status<>'cancelado'
      ) as committed_order,
      exists (
        select 1 from public.nexora_transfer_lines l
        where l.unit_id=u.id and l.state in ('prepared','in_transit','return_pending')
      ) as committed_transfer
    from public.bodega_units u
    join public.bodega_products p on p.id=u.product_id
    left join public.nexora_initial_unit_sites i on i.unit_id=u.id
    left join public.nexora_unit_custody c on c.unit_id=u.id
  ),
  enriched as (
    select l.*,s.name as site_name,city.name as city_name,
      (l.custody_state='en_sede'
        and l.status in ('en_bodega','en_local')
        and l.cost is not null and l.cost>=0
        and not l.committed_order and not l.committed_transfer) as candidate
    from ledger l
    left join public.nexora_sites s on s.id=l.effective_site_id
    left join public.nexora_cities city on city.id=s.city_id
  ),
  filtered as (
    select * from enriched
    where (p_state='all' or custody_state=p_state)
      and (p_site_id is null or effective_site_id=p_site_id)
      and (v_query='' or strpos(lower(serial),v_query)>0
        or strpos(lower(product_name),v_query)>0
        or strpos(lower(sku),v_query)>0
        or strpos(lower(coalesce(site_name,'')),v_query)>0)
  )
  select count(*) into v_total from filtered;

  with ledger as (
    select u.id,u.serial,u.status,u.cost,u.location,p.name as product_name,p.sku,
      case
        when u.status='vendido' or coalesce(c.custody_status,'')='sold'
          then 'vendido'
        when c.custody_status='in_transit' then 'en_transito'
        when c.custody_status='return_pending' then 'retorno_pendiente'
        when v_approved and i.site_id is not null
          and coalesce(c.custody_status,'at_site')='at_site'
          then 'en_sede'
        else 'sin_conciliar'
      end as custody_state,
      case when v_approved and i.site_id is not null
        and coalesce(c.custody_status,'at_site')='at_site'
        then coalesce(c.site_id,i.site_id) end as effective_site_id,
      exists (
        select 1 from public.bodega_order_item_units l
        join public.bodega_order_items oi on oi.id=l.order_item_id
        join public.bodega_orders ord on ord.id=oi.order_id
        where l.unit_id=u.id and ord.status<>'cancelado'
      ) as committed_order,
      exists (
        select 1 from public.nexora_transfer_lines l
        where l.unit_id=u.id and l.state in ('prepared','in_transit','return_pending')
      ) as committed_transfer
    from public.bodega_units u
    join public.bodega_products p on p.id=u.product_id
    left join public.nexora_initial_unit_sites i on i.unit_id=u.id
    left join public.nexora_unit_custody c on c.unit_id=u.id
  ),
  enriched as (
    select l.*,s.name as site_name,city.name as city_name,
      (l.custody_state='en_sede'
        and l.status in ('en_bodega','en_local')
        and l.cost is not null and l.cost>=0
        and not l.committed_order and not l.committed_transfer) as candidate
    from ledger l
    left join public.nexora_sites s on s.id=l.effective_site_id
    left join public.nexora_cities city on city.id=s.city_id
  ),
  page as (
    select * from enriched
    where (p_state='all' or custody_state=p_state)
      and (p_site_id is null or effective_site_id=p_site_id)
      and (v_query='' or strpos(lower(serial),v_query)>0
        or strpos(lower(product_name),v_query)>0
        or strpos(lower(sku),v_query)>0
        or strpos(lower(coalesce(site_name,'')),v_query)>0)
    order by product_name collate "C",serial collate "C",id
    limit p_page_size offset (p_page-1)*p_page_size
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'unitId',id,'serial',serial,'productName',product_name,'sku',sku,
    'cost',cost,'unitStatus',status,'custodyState',custody_state,
    'siteId',effective_site_id,'siteName',site_name,'cityName',city_name,
    'historicalLocation',location,
    'committedOrder',committed_order,'committedTransfer',committed_transfer,
    'commercialCandidate',candidate
  ) order by product_name collate "C",serial collate "C",id),'[]'::jsonb)
  into v_result from page;

  return jsonb_build_object(
    'initialApproved',v_approved,
    'summary',v_summary,'sites',v_sites,
    'items',v_result,'page',p_page,'pageSize',p_page_size,
    'matched',v_total);
end;
$$;
revoke all on function public.nexora_inventory_imei_directory(text,uuid,text,integer,integer)
  from public,anon,authenticated;
grant execute on function public.nexora_inventory_imei_directory(text,uuid,text,integer,integer)
  to authenticated;
comment on function public.nexora_inventory_imei_directory(text,uuid,text,integer,integer)
  is 'Directorio paginado de IMEI/costos y custodia multisede; solo lectura. Sin asignaciones automáticas ni permiso de venta.';
