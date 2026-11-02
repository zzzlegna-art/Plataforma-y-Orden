-- Nexora Multisede 2.0: manifiestos, tránsito, recepción parcial y retorno físico.
-- Ledger de CUSTODIA independiente de la disponibilidad comercial legacy.
-- Las funciones rechazan los traslados hasta el cierre del inventario físico inicial.

create table public.nexora_unit_custody (
  unit_id uuid primary key references public.nexora_initial_unit_sites(unit_id) on delete restrict,
  site_id uuid references public.nexora_sites(id) on delete restrict,
  custody_status text not null check (custody_status in ('at_site','in_transit','return_pending')),
  transfer_id uuid,
  updated_at timestamptz not null default now(),
  constraint nexora_custody_shape check (
    (custody_status = 'at_site' and site_id is not null and transfer_id is null)
    or (custody_status in ('in_transit','return_pending') and site_id is null and transfer_id is not null)
  )
);

create table public.nexora_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_number bigint generated always as identity unique,
  origin_site_id uuid not null references public.nexora_sites(id) on delete restrict,
  destination_site_id uuid not null references public.nexora_sites(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','in_transit','awaiting_returns','closed','cancelled')),
  note text,
  created_by uuid not null references public.bodega_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  received_at timestamptz,
  closed_at timestamptz,
  constraint nexora_transfer_two_sites check (origin_site_id <> destination_site_id)
);
alter table public.nexora_unit_custody
  add constraint nexora_unit_custody_transfer_fk
  foreign key (transfer_id) references public.nexora_transfers(id) on delete restrict;

create table public.nexora_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.nexora_transfers(id) on delete restrict,
  unit_id uuid not null references public.nexora_initial_unit_sites(unit_id) on delete restrict,
  serial_snapshot text not null,
  cost_snapshot numeric,
  state text not null default 'prepared'
    check (state in ('prepared','in_transit','received','return_pending','returned','cancelled')),
  received_at timestamptz,
  returned_at timestamptz,
  unique (transfer_id,unit_id),
  constraint nexora_line_receipt_shape check (state <> 'received' or received_at is not null),
  constraint nexora_line_return_shape check (state <> 'returned' or returned_at is not null)
);
create unique index nexora_transfer_one_open_line_per_unit
  on public.nexora_transfer_lines(unit_id)
  where state in ('prepared','in_transit','return_pending');
create index nexora_transfer_lines_transfer_idx on public.nexora_transfer_lines(transfer_id,state);
create index nexora_transfers_recent_idx on public.nexora_transfers(created_at desc);
create index nexora_unit_custody_site_idx on public.nexora_unit_custody(site_id,custody_status);

-- Documento automático de DEVOLUCIÓN PENDIENTE: no crea existencias.
create table public.nexora_transfer_return_documents (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null unique references public.nexora_transfers(id) on delete restrict,
  expected_count integer not null check (expected_count > 0),
  status text not null default 'pending' check (status in ('pending','completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.nexora_transfer_events (
  id bigint generated always as identity primary key,
  transfer_id uuid not null references public.nexora_transfers(id) on delete restrict,
  event_type text not null check (event_type in ('created','dispatched','received','return_confirmed','cancelled')),
  actor_id uuid not null references public.bodega_profiles(id) on delete restrict,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index nexora_transfer_events_by_transfer_idx on public.nexora_transfer_events(transfer_id,created_at);

alter table public.nexora_unit_custody enable row level security;
alter table public.nexora_transfers enable row level security;
alter table public.nexora_transfer_lines enable row level security;
alter table public.nexora_transfer_return_documents enable row level security;
alter table public.nexora_transfer_events enable row level security;
create policy nexora_custody_read_admin on public.nexora_unit_custody for select to authenticated using ((select public.bodega_is_admin()));
create policy nexora_transfers_read_admin on public.nexora_transfers for select to authenticated using ((select public.bodega_is_admin()));
create policy nexora_transfer_lines_read_admin on public.nexora_transfer_lines for select to authenticated using ((select public.bodega_is_admin()));
create policy nexora_transfer_returns_read_admin on public.nexora_transfer_return_documents for select to authenticated using ((select public.bodega_is_admin()));
create policy nexora_transfer_events_read_admin on public.nexora_transfer_events for select to authenticated using ((select public.bodega_is_admin()));
revoke all on public.nexora_unit_custody,public.nexora_transfers,
 public.nexora_transfer_lines,public.nexora_transfer_return_documents,public.nexora_transfer_events
 from public,anon,authenticated;
grant select on public.nexora_unit_custody,public.nexora_transfers,
 public.nexora_transfer_lines,public.nexora_transfer_return_documents,public.nexora_transfer_events
 to authenticated;

-- ÚNICA escritura autorizada: RPC con validación de Admin en Postgres.
-- Un bloqueo de escrituras de las tablas logísticas serializa cada operación.
create function nexora_internal.execute_transfer(
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
  if not exists (select 1 from public.nexora_initial_inventory_approvals) then
    raise exception 'Aprueba primero el inventario inicial por IMEI.';
  end if;
  if p_action not in ('create','dispatch','receive','return','cancel') or p_action is null then
    raise exception 'Acción de traslado inválida.';
  end if;

  select coalesce(array_agg(lower(btrim(serial))),array[]::text[])
    into v_serials from unnest(coalesce(p_serials,array[]::text[])) as serial;
  v_wanted := cardinality(v_serials);
  if v_wanted > 100 or exists (select 1 from unnest(v_serials) s where s = '' or length(s)>160)
    or (select count(distinct s) from unnest(v_serials) s) <> v_wanted then
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
        and u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');
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
revoke all on function nexora_internal.execute_transfer(text,uuid,uuid,uuid,text[],text)
  from public,anon,authenticated;
grant usage on schema nexora_internal to authenticated;
grant execute on function nexora_internal.execute_transfer(text,uuid,uuid,uuid,text[],text)
  to authenticated;

create function public.nexora_transfer_action(
  p_action text,
  p_transfer_id uuid default null,
  p_origin uuid default null,
  p_destination uuid default null,
  p_serials text[] default array[]::text[],
  p_note text default null
) returns jsonb
language sql volatile security invoker
set search_path = pg_catalog,public
as $$
  select nexora_internal.execute_transfer(p_action,p_transfer_id,p_origin,p_destination,p_serials,p_note);
$$;
revoke all on function public.nexora_transfer_action(text,uuid,uuid,uuid,text[],text)
  from public,anon,authenticated;
grant execute on function public.nexora_transfer_action(text,uuid,uuid,uuid,text[],text)
  to authenticated;

comment on table public.nexora_transfer_return_documents is
  'Documento automático de diferencia: los IMEI faltantes permanecen sin sede hasta que se compruebe su retorno físico.';
comment on table public.nexora_unit_custody is
  'Control físico/auditado de custodia multisede. No implica stock comercial disponible ni modifica bodega_units.';
