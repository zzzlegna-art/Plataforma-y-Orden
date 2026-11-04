-- NEXORA: permisos reales por sede, inventario global de solo lectura y traslados por ruta.
-- No cambia datos existentes ni crea traslados.
BEGIN;
CREATE OR REPLACE FUNCTION nexora_internal.execute_transfer(p_action text, p_transfer_id uuid DEFAULT NULL::uuid, p_origin uuid DEFAULT NULL::uuid, p_destination uuid DEFAULT NULL::uuid, p_serials text[] DEFAULT ARRAY[]::text[], p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_serials text[];
  v_wanted integer;
  v_matched integer;
  v_total integer;
  v_missing integer;
  v_remaining integer;
  v_number bigint;
  v_tid uuid;
  v_origin uuid;
  v_destination uuid;
  v_status text;
  v_result jsonb;
  v_worker jsonb;
  v_my_site uuid;
begin
  v_worker := nexora_internal.worker_session();
  if auth.uid() is null or not (public.bodega_is_staff() or v_worker is not null) then
    raise exception 'No tienes permiso para operar traslados multisede.';
  end if;
  v_my_site := nullif(v_worker->>'siteId','')::uuid;
  -- Coordina el ledger con la escritura legacy de pedidos. Los guardas
  -- de asignación de pedidos usan exactamente el mismo bloqueo asesor.
  perform pg_advisory_xact_lock(78192346);
  if not exists (select 1 from public.nexora_initial_inventory_approvals) then
    raise exception 'Aprueba primero el inventario inicial por IMEI.';
  end if;
  if p_action not in ('create','dispatch','receive','return','cancel') or p_action is null then
    raise exception 'Acción de traslado inválida.';
  end if;

  select coalesce(array_agg(lower(btrim(x.serial))),array[]::text[])
    into v_serials from unnest(coalesce(p_serials,array[]::text[])) as x(serial);
  v_wanted := cardinality(v_serials);
  if v_wanted > 100 or exists (select 1 from unnest(v_serials) s where s = '' or length(s)>160)
    or (select count(distinct x.serial) from unnest(v_serials) as x(serial)) <> v_wanted then
    raise exception 'IMEI repetido, vacío o más de 100 unidades por operación.';
  end if;
  if (p_action in ('create','return') and v_wanted = 0)
     or (p_action in ('dispatch','cancel') and v_wanted <> 0) then
    raise exception 'Cantidad de IMEI inválida para esta operación.';
  end if;

  lock table public.nexora_transfers in share row exclusive mode;
  lock table public.nexora_transfer_lines in share row exclusive mode;
  lock table public.nexora_unit_custody in share row exclusive mode;

  if p_action = 'create' then
    if p_origin is null or p_destination is null or p_origin = p_destination then
      raise exception 'Selecciona un origen y un destino diferentes.';
    end if;
    if v_worker is not null and p_origin <> v_my_site then
      raise exception 'Solo puedes iniciar traslados desde tu local asignado.';
    end if;
    if not exists (
      select 1 from public.nexora_sites o
      join public.nexora_sites d on d.id=p_destination
      where o.id=p_origin and o.is_active and d.is_active
        and (
          (o.site_type='principal' and d.site_type='bodega' and d.parent_site_id=o.id)
          or (o.site_type='principal' and d.site_type='local' and d.parent_site_id=o.id)
          or (o.site_type='bodega' and d.site_type='bodega' and o.id<>d.id)
          or (o.site_type='bodega' and d.site_type='local' and d.parent_site_id=o.id)
          or (o.site_type='local' and d.site_type in ('principal','bodega') and o.parent_site_id=d.id)
        )
    ) then
      raise exception 'Ruta no autorizada: no se permite local a local.';
    end if;
    select count(*) into v_matched
      from public.bodega_units u
      join public.nexora_initial_unit_sites s on s.unit_id=u.id
      left join public.nexora_unit_custody c on c.unit_id=u.id
      where lower(btrim(u.serial))=any(v_serials)
        and u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
        and u.serial=s.serial_snapshot
        and coalesce(c.site_id,s.site_id)=p_origin
        and coalesce(c.custody_status,'at_site')='at_site'
        and not exists (
          select 1 from public.nexora_transfer_lines l where l.unit_id=u.id
           and l.state in ('prepared','in_transit','return_pending')
        )
        and not exists (
          select 1 from public.bodega_order_item_units link
          join public.bodega_order_items item on item.id=link.order_item_id
          join public.bodega_orders ord on ord.id=item.order_id
          where link.unit_id=u.id and ord.status not in ('cancelado','despachado')
        );
    if v_matched <> v_wanted then
      raise exception 'Uno o más IMEI no están disponibles físicamente en el origen o están comprometidos en otro traslado.';
    end if;

    insert into public.nexora_transfers(origin_site_id,destination_site_id,note,created_by)
      values(p_origin,p_destination,nullif(btrim(p_note),''),auth.uid())
      returning id,transfer_number into v_tid,v_number;
    insert into public.nexora_unit_custody(unit_id,site_id,custody_status)
      select u.id,s.site_id,'at_site'
        from public.bodega_units u join public.nexora_initial_unit_sites s on s.unit_id=u.id
       where lower(btrim(u.serial))=any(v_serials)
      on conflict (unit_id) do nothing;
    insert into public.nexora_transfer_lines(transfer_id,unit_id,serial_snapshot,cost_snapshot)
      select v_tid,u.id,u.serial,s.cost_snapshot
      from public.bodega_units u join public.nexora_initial_unit_sites s on s.unit_id=u.id
      where lower(btrim(u.serial))=any(v_serials);
    insert into public.nexora_transfer_events(transfer_id,event_type,actor_id,detail)
      values(v_tid,'created',auth.uid(),jsonb_build_object('units',v_wanted));
    return jsonb_build_object('transferId',v_tid,'number',v_number,'status','draft','units',v_wanted);
  end if;

  select t.id,t.transfer_number,t.origin_site_id,t.destination_site_id,t.status
    into v_tid,v_number,v_origin,v_destination,v_status
    from public.nexora_transfers t where t.id=p_transfer_id for update;
  if not found then raise exception 'Traslado no encontrado.'; end if;
  select count(*) into v_total from public.nexora_transfer_lines where transfer_id=v_tid;
  if v_worker is not null and (
       (p_action in ('cancel','dispatch','return') and v_origin<>v_my_site)
       or (p_action='receive' and v_destination<>v_my_site)
     ) then
    raise exception 'El traslado no pertenece a una operación autorizada de tu local.';
  end if;

  if p_action = 'cancel' then
    if v_status <> 'draft' then raise exception 'Solo puedes cancelar un traslado sin despachar.'; end if;
    update public.nexora_transfer_lines set state='cancelled' where transfer_id=v_tid and state='prepared';
    update public.nexora_transfers set status='cancelled',closed_at=now() where id=v_tid;
    insert into public.nexora_transfer_events(transfer_id,event_type,actor_id)
      values(v_tid,'cancelled',auth.uid());
    return jsonb_build_object('transferId',v_tid,'status','cancelled');
  end if;

  if p_action = 'dispatch' then
    if v_status <> 'draft' then raise exception 'Solo puedes despachar un manifiesto en borrador.'; end if;
    select count(*) into v_matched
      from public.nexora_transfer_lines l
      join public.nexora_unit_custody c on c.unit_id=l.unit_id
      join public.bodega_units u on u.id=l.unit_id
      where l.transfer_id=v_tid and l.state='prepared'
        and c.custody_status='at_site' and c.site_id=v_origin
        and u.serial=l.serial_snapshot
        and u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
        and not exists (
          select 1 from public.bodega_order_item_units link
          join public.bodega_order_items item on item.id=link.order_item_id
          join public.bodega_orders ord on ord.id=item.order_id
          where link.unit_id=l.unit_id and ord.status not in ('cancelado','despachado')
        );
    if v_total=0 or v_matched<>v_total then
      raise exception 'No se puede despachar: verifica origen, disponibilidad física y estado de todos los IMEI.';
    end if;
    update public.nexora_unit_custody c
      set site_id=null,custody_status='in_transit',transfer_id=v_tid,updated_at=now()
      from public.nexora_transfer_lines l
      where l.transfer_id=v_tid and c.unit_id=l.unit_id;
    update public.nexora_transfer_lines set state='in_transit'
      where transfer_id=v_tid and state='prepared';
    update public.nexora_transfers set status='in_transit',dispatched_at=now() where id=v_tid;
    insert into public.nexora_transfer_events(transfer_id,event_type,actor_id,detail)
      values(v_tid,'dispatched',auth.uid(),jsonb_build_object('units',v_total));
    return jsonb_build_object('transferId',v_tid,'status','in_transit','sent',v_total);
  end if;

  if p_action = 'receive' then
    if v_status <> 'in_transit' then raise exception 'Esta recepción ya fue procesada o no ha sido despachada.'; end if;
    select count(*) into v_matched
      from public.nexora_transfer_lines l join public.bodega_units u on u.id=l.unit_id
      where l.transfer_id=v_tid and l.state='in_transit'
        and lower(btrim(l.serial_snapshot))=any(v_serials)
        and u.serial=l.serial_snapshot
        and u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');
    if v_matched <> v_wanted then
      raise exception 'La recepción contiene IMEI repetidos, ajenos al envío o ya no físicos.';
    end if;
    update public.nexora_transfer_lines
      set state='received',received_at=now()
      where transfer_id=v_tid and lower(btrim(serial_snapshot))=any(v_serials) and state='in_transit';
    update public.nexora_unit_custody c
      set site_id=v_destination,custody_status='at_site',transfer_id=null,updated_at=now()
      from public.nexora_transfer_lines l where l.transfer_id=v_tid and l.unit_id=c.unit_id and l.state='received';
    update public.nexora_transfer_lines
      set state='return_pending'
      where transfer_id=v_tid and state='in_transit';
    update public.nexora_unit_custody c
      set site_id=null,custody_status='return_pending',transfer_id=v_tid,updated_at=now()
      from public.nexora_transfer_lines l
      where l.transfer_id=v_tid and l.unit_id=c.unit_id and l.state='return_pending';
    v_missing := v_total-v_wanted;
    if v_missing>0 then
      insert into public.nexora_transfer_return_documents(transfer_id,expected_count)
        values(v_tid,v_missing);
    end if;
    update public.nexora_transfers
      set received_at=now(),
        status=case when v_missing=0 then 'closed' else 'awaiting_returns' end,
        closed_at=case when v_missing=0 then now() else null end where id=v_tid;
    insert into public.nexora_transfer_events(transfer_id,event_type,actor_id,detail)
      values(v_tid,'received',auth.uid(),jsonb_build_object('received',v_wanted,'missing',v_missing));
    return jsonb_build_object('transferId',v_tid,
      'status',case when v_missing=0 then 'closed' else 'awaiting_returns' end,
      'received',v_wanted,'missing',v_missing,'returnDocumentCreated',v_missing>0);
  end if;

  if p_action = 'return' then
    if v_status <> 'awaiting_returns' then
      raise exception 'No hay retorno físico pendiente para este traslado.';
    end if;
    select count(*) into v_matched
    from public.nexora_transfer_lines l join public.bodega_units u on u.id=l.unit_id
    where l.transfer_id=v_tid and l.state='return_pending'
      and lower(btrim(l.serial_snapshot))=any(v_serials)
      and u.serial=l.serial_snapshot
      and u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');
    if v_matched <> v_wanted then
      raise exception 'El retorno contiene IMEI ajenos, no pendientes o con estado incompatible.';
    end if;
    -- Solo un escaneo físico explícito puede devolver la custodia al origen.
    update public.nexora_transfer_lines
      set state='returned',returned_at=now()
      where transfer_id=v_tid and state='return_pending' and lower(btrim(serial_snapshot))=any(v_serials);
    update public.nexora_unit_custody c
      set site_id=v_origin,custody_status='at_site',transfer_id=null,updated_at=now()
      from public.nexora_transfer_lines l
      where l.transfer_id=v_tid and l.unit_id=c.unit_id and l.state='returned'
        and lower(btrim(l.serial_snapshot))=any(v_serials);
    select count(*) into v_remaining from public.nexora_transfer_lines
      where transfer_id=v_tid and state='return_pending';
    if v_remaining=0 then
      update public.nexora_transfer_return_documents
        set status='completed',completed_at=now() where transfer_id=v_tid;
      update public.nexora_transfers set status='closed',closed_at=now() where id=v_tid;
    end if;
    insert into public.nexora_transfer_events(transfer_id,event_type,actor_id,detail)
      values(v_tid,'return_confirmed',auth.uid(),
        jsonb_build_object('returnedNow',v_wanted,'remaining',v_remaining));
    return jsonb_build_object('transferId',v_tid,
      'status',case when v_remaining=0 then 'closed' else 'awaiting_returns' end,
      'returnedNow',v_wanted,'remaining',v_remaining);
  end if;
  raise exception 'Acción inválida.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.nexora_inventory_imei_directory(p_state text DEFAULT 'all'::text, p_site_id uuid DEFAULT NULL::uuid, p_query text DEFAULT ''::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    or nexora_internal.worker_session() is not null
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
$function$;

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
    select p.id,p.name,p.sku from public.bodega_products p
    where (v_query='' or strpos(lower(p.name),v_query)>0 or strpos(lower(p.sku),v_query)>0)
    order by p.name collate "C",p.sku collate "C",p.id
    limit p_page_size offset (p_page-1)*p_page_size
  ),
  ledger as (
    select p.id as product_id,u.id as unit_id,u.status,u.cost,
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
      count(unit_id) filter(where physical_state='sin_conciliar')::integer as unverified,
      count(unit_id) filter(where physical_state='en_transito')::integer as in_transit,
      count(unit_id) filter(where physical_state='retorno_pendiente')::integer as pending_return,
      count(unit_id) filter(where physical_state='vendido')::integer as sold
    from availability
    group by product_id,verified_site_id
  ),
  totals as (
    select product_id,
      sum(total)::integer as total,
      sum(physically_verified)::integer as physically_verified,
      sum(available)::integer as available,
      sum(unverified)::integer as unverified,
      sum(in_transit)::integer as in_transit,
      sum(pending_return)::integer as pending_return,
      sum(sold)::integer as sold
    from grouped group by product_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'productId',p.id,'name',p.name,'sku',p.sku,
    'total',t.total,'physicallyVerified',t.physically_verified,
    'available',t.available,'unverified',t.unverified,
    'inTransit',t.in_transit,'pendingReturn',t.pending_return,'sold',t.sold,
    'sites',coalesce((
      select jsonb_agg(jsonb_build_object(
        'siteId',g.verified_site_id,
        'siteName',coalesce(s.name,'Sin sede verificada'),
        'cityName',city.name,'total',g.total,
        'physicallyVerified',g.physically_verified,
        'available',g.available,
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
$function$;

-- Trabajadores: lectura de nombres de todas las sedes, pero no configuración.
create policy nexora_cities_worker_read on public.nexora_cities
for select to authenticated using (nexora_internal.worker_session() is not null);
create policy nexora_sites_worker_read on public.nexora_sites
for select to authenticated using (is_active and nexora_internal.worker_session() is not null);
-- Solo movimientos que salen de su local o llegan a su local.
create policy nexora_transfers_worker_read on public.nexora_transfers
for select to authenticated using (
  nexora_internal.worker_session() is not null and
  (origin_site_id=(nexora_internal.worker_session()->>'siteId')::uuid
   or destination_site_id=(nexora_internal.worker_session()->>'siteId')::uuid)
);
create policy nexora_transfer_lines_worker_read on public.nexora_transfer_lines
for select to authenticated using (
  nexora_internal.worker_session() is not null and exists(
    select 1 from public.nexora_transfers t where t.id=transfer_id
  )
);
create policy nexora_transfer_returns_worker_read on public.nexora_transfer_return_documents
for select to authenticated using (
  nexora_internal.worker_session() is not null and exists(
    select 1 from public.nexora_transfers t where t.id=transfer_id
  )
);
create policy nexora_transfer_events_worker_read on public.nexora_transfer_events
for select to authenticated using (
  nexora_internal.worker_session() is not null and exists(
    select 1 from public.nexora_transfers t where t.id=transfer_id
  )
);

COMMIT;
