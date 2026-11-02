-- Nexora Multisede V4, cap. 19: movimientos monetarios INTERNOS, distintos de ventas y caja.
-- Registro documental: no inventa saldos de cuentas, egresos de caja ni conciliación bancaria.
create table public.nexora_money_transfers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  origin_site_id uuid not null references public.nexora_sites(id) on delete restrict,
  destination_site_id uuid not null references public.nexora_sites(id) on delete restrict,
  origin_account text not null check (length(btrim(origin_account)) between 3 and 120),
  destination_account text not null check (length(btrim(destination_account)) between 3 and 120),
  amount numeric(16,2) not null check (amount > 0),
  currency text not null default 'COP' check (currency = 'COP'),
  proof_reference text not null check (length(btrim(proof_reference)) between 5 and 250),
  status text not null default 'sent' check (status in ('sent','received','reconciled')),
  sent_by uuid not null references public.bodega_profiles(id) on delete restrict,
  sent_at timestamptz not null default now(),
  received_by uuid references public.bodega_profiles(id) on delete restrict,
  received_at timestamptz,
  reconciled_by uuid references public.bodega_profiles(id) on delete restrict,
  reconciled_at timestamptz,
  reconciliation_note text,
  constraint nexora_money_distinct_sites check (origin_site_id <> destination_site_id),
  constraint nexora_money_receipt_consistent check (
    (status = 'sent' and received_at is null and received_by is null and reconciled_at is null and reconciled_by is null)
    or (status = 'received' and received_at is not null and received_by is not null and reconciled_at is null and reconciled_by is null)
    or (status = 'reconciled' and received_at is not null and received_by is not null and reconciled_at is not null and reconciled_by is not null)
  )
);
create index nexora_money_transfers_sent_idx on public.nexora_money_transfers(sent_at desc);
create index nexora_money_transfers_origin_idx on public.nexora_money_transfers(origin_site_id,sent_at desc);
create index nexora_money_transfers_destination_idx on public.nexora_money_transfers(destination_site_id,sent_at desc);

create table public.nexora_money_transfer_events (
  id bigint generated always as identity primary key,
  transfer_id uuid not null references public.nexora_money_transfers(id) on delete restrict,
  action text not null check (action in ('send','receive','reconcile')),
  actor_id uuid not null references public.bodega_profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  note text
);
create index nexora_money_transfer_events_transfer_idx on public.nexora_money_transfer_events(transfer_id,occurred_at);

alter table public.nexora_money_transfers enable row level security;
alter table public.nexora_money_transfer_events enable row level security;
create policy nexora_money_transfers_admin_read on public.nexora_money_transfers
  for select to authenticated using ((select public.bodega_is_admin()));
create policy nexora_money_transfer_events_admin_read on public.nexora_money_transfer_events
  for select to authenticated using ((select public.bodega_is_admin()));
revoke all on public.nexora_money_transfers,public.nexora_money_transfer_events from public,anon,authenticated;
grant select on public.nexora_money_transfers,public.nexora_money_transfer_events to authenticated;

-- Escritor transaccional aislado. No hay DML directo desde el navegador.
create function nexora_internal.money_transfer_action(
  p_action text, p_request_id uuid default null, p_transfer_id uuid default null,
  p_origin_site_id uuid default null, p_destination_site_id uuid default null,
  p_origin_account text default null, p_destination_account text default null,
  p_amount numeric default null, p_proof_reference text default null, p_note text default null
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public
as $$
declare
  v_transfer public.nexora_money_transfers%rowtype;
  v_origin text := btrim(coalesce(p_origin_account,''));
  v_destination text := btrim(coalesce(p_destination_account,''));
  v_proof text := btrim(coalesce(p_proof_reference,''));
  v_note text := btrim(coalesce(p_note,''));
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede gestionar transferencias monetarias.';
  end if;
  if p_action not in ('send','receive','reconcile') or p_action is null then
    raise exception 'Acción de transferencia inválida.';
  end if;
  if p_action = 'send' then
    if p_request_id is null or p_origin_site_id is null or p_destination_site_id is null
       or p_origin_site_id=p_destination_site_id then
      raise exception 'Selecciona dos sedes distintas y una solicitud válida.';
    end if;
    if not exists(select 1 from public.nexora_sites where id=p_origin_site_id and is_active)
       or not exists(select 1 from public.nexora_sites where id=p_destination_site_id and is_active) then
      raise exception 'Ambas sedes deben existir y estar activas.';
    end if;
    if length(v_origin) not between 3 and 120 or length(v_destination) not between 3 and 120
       or length(v_proof) not between 5 and 250 then
      raise exception 'Indica cuenta origen, cuenta destino y comprobante real.';
    end if;
    if p_amount is null or p_amount<=0 or p_amount>999999999999.99
      or p_amount<>round(p_amount,2) then
      raise exception 'El importe COP debe ser positivo, válido y tener máximo dos decimales.';
    end if;
    -- El mismo request_id se utiliza si se corta la conexión: jamás registrar dos envíos.
    perform pg_advisory_xact_lock(78192357);
    select * into v_transfer from public.nexora_money_transfers
      where request_id=p_request_id for update;
    if found then
      if v_transfer.origin_site_id<>p_origin_site_id
         or v_transfer.destination_site_id<>p_destination_site_id
         or v_transfer.origin_account<>v_origin or v_transfer.destination_account<>v_destination
         or v_transfer.amount<>p_amount or v_transfer.proof_reference<>v_proof then
        raise exception 'La solicitud ya existe con información diferente.';
      end if;
      return jsonb_build_object('transferId',v_transfer.id,'status',v_transfer.status,'replayed',true);
    end if;
    insert into public.nexora_money_transfers
      (request_id,origin_site_id,destination_site_id,origin_account,destination_account,
       amount,proof_reference,sent_by)
      values (p_request_id,p_origin_site_id,p_destination_site_id,v_origin,v_destination,
              p_amount,v_proof,auth.uid())
      returning * into v_transfer;
    insert into public.nexora_money_transfer_events(transfer_id,action,actor_id,note)
      values(v_transfer.id,'send',auth.uid(),'Registro documental de envío; no constituye venta');
    return jsonb_build_object('transferId',v_transfer.id,'status','sent','replayed',false);
  end if;
  if p_transfer_id is null then raise exception 'Selecciona una transferencia registrada.'; end if;
  select * into v_transfer from public.nexora_money_transfers where id=p_transfer_id for update;
  if not found then raise exception 'No existe esta transferencia.'; end if;
  if p_action='receive' then
    if v_transfer.status<>'sent' then raise exception 'Solo los envíos pendientes admiten recepción.'; end if;
    if length(v_note)<5 or length(v_note)>500 then
      raise exception 'Confirma documentalmente la recepción con observación de 5 a 500 caracteres.';
    end if;
    update public.nexora_money_transfers set status='received',received_by=auth.uid(),
      received_at=now() where id=v_transfer.id;
    insert into public.nexora_money_transfer_events(transfer_id,action,actor_id,note)
      values(v_transfer.id,'receive',auth.uid(),v_note);
    return jsonb_build_object('transferId',v_transfer.id,'status','received');
  end if;
  if v_transfer.status<>'received' then
    raise exception 'Antes de conciliar debe registrarse la recepción.';
  end if;
  if length(v_note)<5 or length(v_note)>500 then
    raise exception 'Escribe evidencia de conciliación de 5 a 500 caracteres.';
  end if;
  update public.nexora_money_transfers set status='reconciled',reconciled_by=auth.uid(),
    reconciled_at=now(),reconciliation_note=v_note where id=v_transfer.id;
  insert into public.nexora_money_transfer_events(transfer_id,action,actor_id,note)
    values(v_transfer.id,'reconcile',auth.uid(),v_note);
  return jsonb_build_object('transferId',v_transfer.id,'status','reconciled');
end;
$$;
revoke all on function nexora_internal.money_transfer_action(text,uuid,uuid,uuid,uuid,text,text,numeric,text,text)
 from public,anon,authenticated;
grant usage on schema nexora_internal to authenticated;
grant execute on function nexora_internal.money_transfer_action(text,uuid,uuid,uuid,uuid,text,text,numeric,text,text) to authenticated;

create function public.nexora_money_transfer_action(
  p_action text, p_request_id uuid default null, p_transfer_id uuid default null,
  p_origin_site_id uuid default null, p_destination_site_id uuid default null,
  p_origin_account text default null, p_destination_account text default null,
  p_amount numeric default null, p_proof_reference text default null, p_note text default null
) returns jsonb
language sql volatile security invoker set search_path=pg_catalog,public as $$
  select nexora_internal.money_transfer_action(p_action,p_request_id,p_transfer_id,
    p_origin_site_id,p_destination_site_id,p_origin_account,p_destination_account,
    p_amount,p_proof_reference,p_note);
$$;
revoke all on function public.nexora_money_transfer_action(text,uuid,uuid,uuid,uuid,text,text,numeric,text,text)
 from public,anon,authenticated;
grant execute on function public.nexora_money_transfer_action(text,uuid,uuid,uuid,uuid,text,text,numeric,text,text) to authenticated;

-- Informe administrativo de transferencias internas, separado de ventas y caja.
create function public.nexora_money_transfer_report(p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public
as $$
declare v_data jsonb;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede consultar transferencias monetarias.';
  end if;
  if p_limit is null or p_limit<1 or p_limit>100 then
    raise exception 'Límite de consulta inválido.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'originSiteId',t.origin_site_id,'destinationSiteId',t.destination_site_id,
    'originAccount',t.origin_account,'destinationAccount',t.destination_account,
    'amount',t.amount,'currency',t.currency,'proofReference',t.proof_reference,
    'status',t.status,'sentAt',t.sent_at,'receivedAt',t.received_at,
    'reconciledAt',t.reconciled_at
  ) order by t.sent_at desc,t.id),'[]'::jsonb)
  into v_data from (
    select * from public.nexora_money_transfers order by sent_at desc,id limit p_limit
  ) t;
  return v_data;
end;
$$;
revoke all on function public.nexora_money_transfer_report(integer) from public,anon,authenticated;
grant execute on function public.nexora_money_transfer_report(integer) to authenticated;
