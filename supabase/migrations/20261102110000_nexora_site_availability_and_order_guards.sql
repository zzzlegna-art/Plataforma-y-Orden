-- Nexora: custodia física ↔ disponibilidad comercial
-- Entrega de lectura y protecciones anti-doble-reserva.
-- No modifica ni mueve unidades existentes ni habilita un POS nuevo.

-- Intercepta pedidos legacy que intenten reservar un IMEI preparado,
-- en tránsito o pendiente de devolución. Mantiene el resto del sistema intacto.
create function public.nexora_guard_order_assignment_custody()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  if exists (select 1 from public.nexora_initial_inventory_approvals) then
    perform pg_advisory_xact_lock(78192346);
    if exists (
      select 1 from public.nexora_transfer_lines l
      where l.unit_id=new.unit_id and l.state in ('prepared','in_transit','return_pending')
    ) then
      raise exception 'IMEI bloqueado: ya está comprometido en un traslado multisede.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.nexora_guard_order_assignment_custody() from public,anon,authenticated;
create trigger nexora_guard_order_assignment
before insert or update of unit_id, order_item_id on public.bodega_order_item_units
for each row execute function public.nexora_guard_order_assignment_custody();

-- Rechaza cualquier cambio de estado, serial o ubicación legacy mientras el
-- equipo esté comprometido en un traslado, incluso si se omite la pantalla.
-- Las operaciones normales previas a la aprobación permanecen inalteradas.
create function public.nexora_guard_unit_during_custody()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  if exists (select 1 from public.nexora_initial_inventory_approvals) then
    if tg_op='DELETE' then
      if exists (select 1 from public.nexora_transfer_lines l
        where l.unit_id=old.id and l.state in ('prepared','in_transit','return_pending')) then
        raise exception 'IMEI en traslado: no puede eliminarse de inventario.';
      end if;
      return old;
    end if;
    if new.status is distinct from old.status or new.serial is distinct from old.serial
      or new.location is distinct from old.location then
      perform pg_advisory_xact_lock(78192346);
      if exists (select 1 from public.nexora_transfer_lines l
        where l.unit_id=new.id and l.state in ('prepared','in_transit','return_pending')) then
        raise exception 'IMEI en traslado: no puedes venderlo, reasignarlo ni cambiar su serial.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.nexora_guard_unit_during_custody() from public,anon,authenticated;
create trigger nexora_guard_unit_custody_update
before update of status,serial,location on public.bodega_units
for each row execute function public.nexora_guard_unit_during_custody();
create trigger nexora_guard_unit_custody_delete
before delete on public.bodega_units
for each row execute function public.nexora_guard_unit_during_custody();

-- Panel de disponibilidad sin permisos de venta. Solo cuenta unidades con
-- estado vendible + custodia física at_site + sin pedido sin despachar.
-- Las unidades en tránsito/devolución NO se atribuyen a ningún local.
create function public.nexora_site_commercial_readiness()
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog,public
as $$
declare
  v_approved boolean;
  v_sites jsonb;
  v_transit bigint;
  v_returns bigint;
  v_notmapped bigint;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede consultar disponibilidad multisede.';
  end if;
  select exists(select 1 from public.nexora_initial_inventory_approvals) into v_approved;
  if not v_approved then
    return jsonb_build_object('approved',false,'sites','[]'::jsonb,
      'inTransit',0,'returnPending',0,'unmapped',0);
  end if;

  with physical as (
    select u.id,u.status,
      coalesce(c.site_id,i.site_id) as site_id,
      coalesce(c.custody_status,'at_site') as custody_status,
      exists (
        select 1 from public.bodega_order_item_units l
        join public.bodega_order_items oi on oi.id=l.order_item_id
        join public.bodega_orders o on o.id=oi.order_id
        where l.unit_id=u.id and o.status not in ('cancelado','despachado')
      ) as reserved
    from public.nexora_initial_unit_sites i
    join public.bodega_units u on u.id=i.unit_id
    left join public.nexora_unit_custody c on c.unit_id=u.id
  ), grouped as (
    select s.id as site_id,s.name as site_name,s.site_type,
      count(p.id) filter (where p.custody_status='at_site'
        and p.status in ('en_bodega','en_local','en_reparacion','defectuoso'))::integer as physical,
      count(p.id) filter (where p.custody_status='at_site' and p.status in ('en_bodega','en_local')
        and p.reserved)::integer as reserved,
      count(p.id) filter (where p.custody_status='at_site' and p.status in ('en_bodega','en_local')
        and not p.reserved)::integer as candidate,
      count(p.id) filter (where p.custody_status='at_site'
        and p.status in ('en_transito','en_reparacion','defectuoso'))::integer as restricted
    from public.nexora_sites s
    left join physical p on p.site_id=s.id
    group by s.id,s.name,s.site_type
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'siteId',g.site_id,'siteName',g.site_name,'siteType',g.site_type,
    'physical',g.physical,'reserved',g.reserved,
    'candidate',g.candidate,'restricted',g.restricted
  ) order by g.site_name),'[]'::jsonb) into v_sites from grouped g;

  select count(*) filter(where c.custody_status='in_transit'),
    count(*) filter(where c.custody_status='return_pending')
    into v_transit,v_returns from public.nexora_unit_custody c;
  select count(*) into v_notmapped from public.bodega_units u
    where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
      and not exists (select 1 from public.nexora_initial_unit_sites i where i.unit_id=u.id);
  return jsonb_build_object(
    'approved',true,'sites',v_sites,
    'inTransit',v_transit,'returnPending',v_returns,'unmapped',v_notmapped);
end;
$$;
revoke all on function public.nexora_site_commercial_readiness() from public,anon,authenticated;
grant execute on function public.nexora_site_commercial_readiness() to authenticated;

-- Por producto en sede, estrictamente informativo. No representa
-- stock vendible por POS hasta añadir reservas y validación de sede transaccionales.
create function public.nexora_site_product_readiness(p_site_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog,public
as $$
declare
  v_data jsonb;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede consultar disponibilidad por referencia.';
  end if;
  if not exists(select 1 from public.nexora_initial_inventory_approvals) then
    return '[]'::jsonb;
  end if;
  if not exists(select 1 from public.nexora_sites where id=p_site_id) then
    raise exception 'Sede inexistente.';
  end if;
  with units as (
    select u.id,u.product_id,u.status,
      exists (
        select 1 from public.bodega_order_item_units l
        join public.bodega_order_items oi on oi.id=l.order_item_id
        join public.bodega_orders o on o.id=oi.order_id
        where l.unit_id=u.id and o.status not in ('cancelado','despachado')
      ) as reserved
    from public.nexora_initial_unit_sites i
    join public.bodega_units u on u.id=i.unit_id
    left join public.nexora_unit_custody c on c.unit_id=u.id
    where coalesce(c.site_id,i.site_id)=p_site_id
      and coalesce(c.custody_status,'at_site')='at_site'
  ), grouped as (
    select u.product_id,
      coalesce(p.name,'Producto sin referencia') as name,
      count(*) filter(where u.status in ('en_bodega','en_local') and not u.reserved)::integer as candidate,
      count(*) filter(where u.status in ('en_bodega','en_local') and u.reserved)::integer as reserved,
      count(*) filter(where u.status in ('en_transito','en_reparacion','defectuoso'))::integer as restricted
    from units u left join public.bodega_products p on p.id=u.product_id
    where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
    group by u.product_id,p.name
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'productId',product_id,'productName',name,
    'candidate',candidate,'reserved',reserved,'restricted',restricted
  ) order by name),'[]'::jsonb) into v_data from grouped;
  return v_data;
end;
$$;
revoke all on function public.nexora_site_product_readiness(uuid) from public,anon,authenticated;
grant execute on function public.nexora_site_product_readiness(uuid) to authenticated;

-- Replacement of transfer RPC with shared lock + open-order checks.
create or replace function nexora_internal.execute_transfer(
  p_action text,
  p_transfer_id uuid default null,
  p_origin uuid default null,
  p_destination uuid default null,
  p_serials text[] default array[]::text[],
  p_note text default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
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
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede operar traslados multisede.';
  end if;
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
    if not exists (
      select 1 from public.nexora_sites o join public.nexora_sites d
        on d.parent_site_id = o.id
      where o.id=p_origin and d.id=p_destination and o.is_active and d.is_active
    ) then
      raise exception 'El traslado debe seguir una ruta activa de abastecimiento: bodega hacia su punto dependiente.';
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
$$;


-- Impide reactivar un pedido anteriormente cancelado si sus IMEI ya están
-- comprometidos en un traslado. Un pedido despachado dispara la actualización
-- de bodega_units, donde el otro guard rechaza la venta en tránsito.
create function public.nexora_guard_order_reactivation_custody()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  if new.status is distinct from old.status
     and new.status not in ('cancelado','despachado')
     and exists (select 1 from public.nexora_initial_inventory_approvals) then
    perform pg_advisory_xact_lock(78192346);
    if exists (
      select 1 from public.bodega_order_items oi
      join public.bodega_order_item_units link on link.order_item_id=oi.id
      join public.nexora_transfer_lines line on line.unit_id=link.unit_id
      where oi.order_id=new.id and line.state in ('prepared','in_transit','return_pending')
    ) then
      raise exception 'No puedes activar un pedido con IMEI comprometidos en traslado.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.nexora_guard_order_reactivation_custody()
  from public,anon,authenticated;
create trigger nexora_guard_order_reactivation
before update of status on public.bodega_orders
for each row execute function public.nexora_guard_order_reactivation_custody();
