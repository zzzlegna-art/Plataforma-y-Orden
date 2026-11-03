-- Nexora V4: permisos de traslados por sede y rutas del Plan Maestro.
-- Requiere nexora_internal.site_role_scope_basis() del PR #141.
-- No activa roles, no cambia IMEI/costos/actas ni ejecuta traslados reales.

create or replace function nexora_internal.is_current_active_multisite_staff()
returns boolean language sql stable security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1 from public.bodega_profiles p
    where p.id=(select auth.uid())
      and p.is_active
      and p.role in ('admin','bodeguero')
  );
$$;
revoke all on function nexora_internal.is_current_active_multisite_staff()
  from public,anon,authenticated;
grant execute on function nexora_internal.is_current_active_multisite_staff()
  to authenticated;
comment on function nexora_internal.is_current_active_multisite_staff() is
  'Solo lectura RLS: confirma el perfil legacy activo del usuario actual, incluidos los roles multisede planificados. No concede escrituras.';

create or replace function public.nexora_transfer_readiness()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public
as $
begin
  if auth.uid() is null
    or not nexora_internal.is_current_active_multisite_staff() then
    raise exception 'Solo personal activo puede consultar la preparación de traslados.';
  end if;
  return jsonb_build_object(
    'isApproved',exists(select 1 from public.nexora_initial_inventory_approvals)
  );
end;
$;
revoke all on function public.nexora_transfer_readiness()
  from public,anon,authenticated;
grant execute on function public.nexora_transfer_readiness() to authenticated;
comment on function public.nexora_transfer_readiness() is
  'Lectura mínima para traslados: devuelve solo si el acta inicial está aprobada. No revela IMEI ni datos de conciliación y no autoriza movimientos.';

create or replace function nexora_internal.is_allowed_transfer_route(
  p_origin uuid,p_destination uuid
)
returns boolean language sql stable security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1 from public.nexora_sites o
    join public.nexora_sites d on d.id=p_destination
    where o.id=p_origin and o.is_active and d.is_active
      and (
        -- Sede principal hacia bodega regional dependiente.
        (o.site_type='principal' and d.site_type='bodega' and d.parent_site_id=o.id)
        -- Una bodega regional puede abastecer otra ciudad.
        or (o.site_type='bodega' and d.site_type='bodega' and o.city_id<>d.city_id)
        -- La sede principal actual también abastece directamente su local dependiente.
        or (o.site_type in ('principal','bodega') and d.site_type='local' and d.parent_site_id=o.id)
        -- Un local puede devolver mercancía a su bodega de origen.
        or (o.site_type='local' and d.site_type in ('principal','bodega') and o.parent_site_id=d.id)
      )
  );
$$;
revoke all on function nexora_internal.is_allowed_transfer_route(uuid,uuid)
  from public,anon,authenticated;
comment on function nexora_internal.is_allowed_transfer_route(uuid,uuid) is
  'Rutas de mercancía aprobadas por Plan Maestro V4; local a local siempre prohibido. Solo llamada interna del motor de traslados.';

-- Lectura mínima de red y vínculos para roles multisede activos.
-- No permite gestionar personal ni consultar asignaciones de otros empleados.
drop policy if exists nexora_cities_read on public.nexora_cities;
create policy nexora_cities_read on public.nexora_cities
  for select to authenticated
  using ((select nexora_internal.is_current_active_multisite_staff()));

drop policy if exists nexora_sites_read on public.nexora_sites;
create policy nexora_sites_read on public.nexora_sites
  for select to authenticated
  using ((select nexora_internal.is_current_active_multisite_staff()));

drop policy if exists nexora_staff_sites_read on public.nexora_staff_sites;
create policy nexora_staff_sites_read on public.nexora_staff_sites
  for select to authenticated
  using (
    (select public.bodega_is_admin())
    or (
      is_active and user_id=(select auth.uid())
      and (select nexora_internal.is_current_active_multisite_staff())
    )
  );

-- El empleado ve únicamente traslados que tocan una sede que tiene asignada.
drop policy if exists nexora_transfers_read_admin on public.nexora_transfers;
create policy nexora_transfers_read_admin on public.nexora_transfers
  for select to authenticated
  using (
    (select public.bodega_is_admin())
    or (
      (select nexora_internal.is_current_active_multisite_staff())
      and exists(
        select 1 from public.nexora_staff_sites ss
        where ss.user_id=(select auth.uid()) and ss.is_active
          and ss.site_id in (origin_site_id,destination_site_id)
      )
    )
  );

drop policy if exists nexora_transfer_lines_read_admin on public.nexora_transfer_lines;
create policy nexora_transfer_lines_read_admin on public.nexora_transfer_lines
  for select to authenticated
  using (
    (select public.bodega_is_admin())
    or exists(
      select 1 from public.nexora_transfers t
      where t.id=nexora_transfer_lines.transfer_id
    )
  );

drop policy if exists nexora_transfer_returns_read_admin on public.nexora_transfer_return_documents;
create policy nexora_transfer_returns_read_admin on public.nexora_transfer_return_documents
  for select to authenticated
  using (
    (select public.bodega_is_admin())
    or exists(
      select 1 from public.nexora_transfers t
      where t.id=nexora_transfer_return_documents.transfer_id
    )
  );

drop policy if exists nexora_transfer_events_read_admin on public.nexora_transfer_events;
create policy nexora_transfer_events_read_admin on public.nexora_transfer_events
  for select to authenticated
  using (
    (select public.bodega_is_admin())
    or exists(
      select 1 from public.nexora_transfers t
      where t.id=nexora_transfer_events.transfer_id
    )
  );

drop policy if exists nexora_custody_read_admin on public.nexora_unit_custody;
create policy nexora_custody_read_admin on public.nexora_unit_custody
  for select to authenticated
  using (
    (select public.bodega_is_admin())
    or (
      (select nexora_internal.is_current_active_multisite_staff())
      and (
        exists(
          select 1 from public.nexora_staff_sites ss
          where ss.user_id=(select auth.uid()) and ss.is_active
            and ss.site_id=nexora_unit_custody.site_id
        )
        or exists(
          select 1 from public.nexora_transfers t
          where t.id=nexora_unit_custody.transfer_id
        )
      )
    )
  );

alter table public.nexora_transfer_events
  drop constraint if exists nexora_transfer_events_event_type_check;
alter table public.nexora_transfer_events
  add constraint nexora_transfer_events_event_type_check
  check(event_type in ('created','edited','dispatched','received','return_confirmed','cancelled'));

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
  if auth.uid() is null then
    raise exception 'Inicia sesión para operar traslados multisede.';
  end if;
  -- Coordina el ledger con la escritura legacy de pedidos. Los guardas
  -- de asignación de pedidos usan exactamente el mismo bloqueo asesor.
  perform pg_advisory_xact_lock(78192346);
  if not exists (select 1 from public.nexora_initial_inventory_approvals) then
    raise exception 'Aprueba primero el inventario inicial por IMEI.';
  end if;
  if p_action not in ('create','edit','dispatch','receive','return','cancel') or p_action is null then
    raise exception 'Acción de traslado inválida.';
  end if;

  select coalesce(array_agg(lower(btrim(x.serial))),array[]::text[])
    into v_serials from unnest(coalesce(p_serials,array[]::text[])) as x(serial);
  v_wanted := cardinality(v_serials);
  if v_wanted > 100 or exists (select 1 from unnest(v_serials) s where s = '' or length(s)>160)
    or (select count(distinct x.serial) from unnest(v_serials) as x(serial)) <> v_wanted then
    raise exception 'IMEI repetido, vacío o más de 100 unidades por operación.';
  end if;
  if (p_action in ('create','edit','return') and v_wanted = 0)
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
    if not nexora_internal.is_allowed_transfer_route(p_origin,p_destination) then
      raise exception 'La ruta no está permitida por el Plan Maestro V4 o una de las sedes está inactiva.';
    end if;
    if length(coalesce(p_note,''))>300 then
      raise exception 'La observación no puede superar 300 caracteres.';
    end if;
    if not public.bodega_is_admin()
      and not nexora_internal.site_role_scope_basis(p_origin,'transfers.manage') then
      raise exception 'No tienes permiso de traslado en la sede de origen.';
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
    if not public.bodega_is_admin()
      and not nexora_internal.site_role_scope_basis(v_origin,'transfers.manage')
      and not nexora_internal.site_role_scope_basis(v_destination,'transfers.manage') then
      raise exception 'Solo personal autorizado de las sedes participantes puede cancelar el borrador.';
    end if;
    if v_status <> 'draft' then raise exception 'Solo puedes cancelar un traslado sin despachar.'; end if;
    update public.nexora_transfer_lines set state='cancelled' where transfer_id=v_tid and state='prepared';
    update public.nexora_transfers set status='cancelled',closed_at=now() where id=v_tid;
    insert into public.nexora_transfer_events(transfer_id,event_type,actor_id)
      values(v_tid,'cancelled',auth.uid());
    return jsonb_build_object('transferId',v_tid,'status','cancelled');
  end if;

  if p_action = 'edit' then
    if not public.bodega_is_admin()
      and not nexora_internal.site_role_scope_basis(v_origin,'transfers.manage')
      and not nexora_internal.site_role_scope_basis(v_destination,'transfers.manage') then
      raise exception 'Solo personal autorizado de las sedes participantes puede corregir el borrador.';
    end if;
    if v_status <> 'draft' then
      raise exception 'Un traslado solo puede corregirse antes del despacho.';
    end if;
    if not nexora_internal.is_allowed_transfer_route(v_origin,v_destination) then
      raise exception 'La ruta ya no está habilitada para nuevos traslados.';
    end if;
    if length(coalesce(p_note,''))>300 then
      raise exception 'La observación no puede superar 300 caracteres.';
    end if;

    select count(*) into v_matched
      from public.bodega_units u
      join public.nexora_initial_unit_sites s on s.unit_id=u.id
      left join public.nexora_unit_custody c on c.unit_id=u.id
      where lower(btrim(u.serial))=any(v_serials)
        and u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
        and u.serial=s.serial_snapshot
        and coalesce(c.site_id,s.site_id)=v_origin
        and coalesce(c.custody_status,'at_site')='at_site'
        and not exists (
          select 1 from public.nexora_transfer_lines l where l.unit_id=u.id
           and l.transfer_id<>v_tid
           and l.state in ('prepared','in_transit','return_pending')
        )
        and not exists (
          select 1 from public.bodega_order_item_units link
          join public.bodega_order_items item on item.id=link.order_item_id
          join public.bodega_orders ord on ord.id=item.order_id
          where link.unit_id=u.id and ord.status not in ('cancelado','despachado')
        );
    if v_matched <> v_wanted then
      raise exception 'Uno o más IMEI no están disponibles físicamente en el origen o están comprometidos en otro proceso.';
    end if;

    select coalesce(jsonb_agg(l.serial_snapshot order by l.serial_snapshot),'[]'::jsonb)
      into v_result
      from public.nexora_transfer_lines l
      where l.transfer_id=v_tid and l.state='prepared';

    delete from public.nexora_transfer_lines
      where transfer_id=v_tid and state='prepared';

    insert into public.nexora_unit_custody(unit_id,site_id,custody_status)
      select u.id,s.site_id,'at_site'
      from public.bodega_units u
      join public.nexora_initial_unit_sites s on s.unit_id=u.id
      where lower(btrim(u.serial))=any(v_serials)
      on conflict (unit_id) do nothing;

    insert into public.nexora_transfer_lines(transfer_id,unit_id,serial_snapshot,cost_snapshot)
      select v_tid,u.id,u.serial,s.cost_snapshot
      from public.bodega_units u
      join public.nexora_initial_unit_sites s on s.unit_id=u.id
      where lower(btrim(u.serial))=any(v_serials);

    update public.nexora_transfers
      set note=nullif(btrim(p_note),'')
      where id=v_tid;

    insert into public.nexora_transfer_events(transfer_id,event_type,actor_id,detail)
      values(v_tid,'edited',auth.uid(),jsonb_build_object(
        'previousSerials',v_result,
        'currentSerials',to_jsonb(v_serials),
        'units',v_wanted
      ));
    return jsonb_build_object('transferId',v_tid,'status','draft','units',v_wanted,'edited',true);
  end if;

  if p_action = 'dispatch' then
    if not public.bodega_is_admin()
      and not nexora_internal.site_role_scope_basis(v_origin,'transfers.manage') then
      raise exception 'Solo personal autorizado de la sede de origen puede despachar.';
    end if;
    if not nexora_internal.is_allowed_transfer_route(v_origin,v_destination) then
      raise exception 'No se puede despachar por una ruta que ya no está habilitada.';
    end if;
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
    if not public.bodega_is_admin()
      and not nexora_internal.site_role_scope_basis(v_destination,'transfers.manage') then
      raise exception 'Solo personal autorizado de la sede de destino puede confirmar la recepción.';
    end if;
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
    if not public.bodega_is_admin()
      and not nexora_internal.site_role_scope_basis(v_origin,'transfers.manage') then
      raise exception 'Solo personal autorizado de la sede de origen puede confirmar el retorno físico.';
    end if;
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

revoke all on function nexora_internal.execute_transfer(text,uuid,uuid,uuid,text[],text)
  from public,anon,authenticated;
grant execute on function nexora_internal.execute_transfer(text,uuid,uuid,uuid,text[],text)
  to authenticated;

comment on function nexora_internal.execute_transfer(text,uuid,uuid,uuid,text[],text) is
  'Motor transaccional de traslados V4: permisos por sede, rutas aprobadas, edición solo antes del despacho, custodia y auditoría física.';
