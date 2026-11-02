-- Nexora Multisede 2.0: caja diaria y estructura POS retail.
-- No altera bodega_units, pedidos, recepciones ni precios mayoristas.
-- Operaciones de caja se habilitan solo cuando un rol operativo
-- esté efectivamente activado y asignado a su sede (aún imposible).

create table public.nexora_cash_sessions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.nexora_sites(id) on delete restrict,
  business_date date not null,
  state text not null default 'open' check (state in ('open','closed')),
  opening_cash numeric(16,2) not null check (opening_cash >= 0),
  opened_by uuid not null references public.bodega_profiles(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closing_expected_cash numeric(16,2) check (closing_expected_cash >= 0),
  closing_counted_cash numeric(16,2) check (closing_counted_cash >= 0),
  closing_difference numeric(16,2),
  closed_by uuid references public.bodega_profiles(id) on delete restrict,
  closed_at timestamptz,
  unique(site_id,business_date),
  constraint nexora_cash_closure_fields check (
    (state='open' and closing_expected_cash is null and closing_counted_cash is null
      and closing_difference is null and closed_by is null and closed_at is null)
    or
    (state='closed' and closing_expected_cash is not null and closing_counted_cash is not null
      and closing_difference is not null and closed_by is not null and closed_at is not null)
  )
);
create index nexora_cash_recent_idx on public.nexora_cash_sessions(business_date desc,site_id);

create table public.nexora_cash_expenses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.nexora_cash_sessions(id) on delete restrict,
  amount numeric(16,2) not null check (amount > 0),
  description text not null check (char_length(btrim(description)) between 5 and 500),
  authorized_by uuid not null references public.bodega_profiles(id) on delete restrict,
  authorized_at timestamptz not null default now()
);
create index nexora_cash_expenses_session_idx on public.nexora_cash_expenses(session_id);

-- Próximo POS: tabla inmutable, sin RPC de venta todavía.
-- Una unidad solo podrá figurar en una venta retail de todo el sistema.
create table public.nexora_retail_sales (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.nexora_cash_sessions(id) on delete restrict,
  unit_id uuid not null unique references public.bodega_units(id) on delete restrict,
  site_id uuid not null references public.nexora_sites(id) on delete restrict,
  serial_snapshot text not null,
  unit_cost numeric(16,2) not null check (unit_cost >= 0),
  unit_price numeric(16,2) not null check (unit_price > unit_cost),
  payment_method text not null check (payment_method in ('efectivo','transferencia')),
  paid_amount numeric(16,2) not null,
  sold_by uuid not null references public.bodega_profiles(id) on delete restrict,
  sold_at timestamptz not null default now(),
  constraint nexora_sale_full_payment check(paid_amount=unit_price)
);
create index nexora_retail_sales_cash_idx on public.nexora_retail_sales(cash_session_id,sold_at);

create table public.nexora_cash_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.nexora_cash_sessions(id) on delete restrict,
  action text not null check (action in ('open','expense','close','reopen')),
  actor_id uuid not null references public.bodega_profiles(id) on delete restrict,
  note text,
  data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index nexora_cash_events_session_idx on public.nexora_cash_events(session_id,occurred_at);

alter table public.nexora_cash_sessions enable row level security;
alter table public.nexora_cash_expenses enable row level security;
alter table public.nexora_retail_sales enable row level security;
alter table public.nexora_cash_events enable row level security;
create policy nexora_cash_session_admin_read on public.nexora_cash_sessions
  for select to authenticated using ((select public.bodega_is_admin()));
create policy nexora_cash_expense_admin_read on public.nexora_cash_expenses
  for select to authenticated using ((select public.bodega_is_admin()));
create policy nexora_retail_sale_admin_read on public.nexora_retail_sales
  for select to authenticated using ((select public.bodega_is_admin()));
create policy nexora_cash_events_admin_read on public.nexora_cash_events
  for select to authenticated using ((select public.bodega_is_admin()));
revoke all on public.nexora_cash_sessions,public.nexora_cash_expenses,
 public.nexora_retail_sales,public.nexora_cash_events from public,anon,authenticated;
grant select on public.nexora_cash_sessions,public.nexora_cash_expenses,
 public.nexora_retail_sales,public.nexora_cash_events to authenticated;

-- Lectura administrativa y resumen de actividad del día. Las cifras
-- se calculan con operaciones firmadas, no por valores del navegador.
create function public.nexora_cash_day_report(p_business_date date default null)
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public
as $$
declare
  v_date date := coalesce(p_business_date,(now() at time zone 'America/Bogota')::date);
  v_initial boolean;
  v_data jsonb;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede consultar la caja diaria global.';
  end if;
  select exists(select 1 from public.nexora_initial_inventory_approvals) into v_initial;
  with by_store as (
    select s.id,s.name,cs.id session_id,cs.state,
           cs.opening_cash,cs.opened_at,cs.closed_at,
           cs.closing_expected_cash,cs.closing_counted_cash,cs.closing_difference,
           (select coalesce(sum(e.amount),0) from public.nexora_cash_expenses e
              where e.session_id=cs.id)::numeric as expenses,
           (select coalesce(sum(sale.paid_amount),0) from public.nexora_retail_sales sale
              where sale.cash_session_id=cs.id and sale.payment_method='efectivo')::numeric as sales_cash,
           (select coalesce(sum(sale.paid_amount),0) from public.nexora_retail_sales sale
              where sale.cash_session_id=cs.id and sale.payment_method='transferencia')::numeric as sales_transfer,
           exists(
             select 1 from public.nexora_staff_sites ss
             join public.nexora_staff_role_plans rp on rp.user_id=ss.user_id
             join public.bodega_profiles bp on bp.id=ss.user_id
             where ss.site_id=s.id and ss.is_active and bp.is_active
               and rp.operationally_enabled and rp.planned_role='encargado'
           ) as has_active_manager
      from public.nexora_sites s
      left join public.nexora_cash_sessions cs
        on cs.site_id=s.id and cs.business_date=v_date
      where s.site_type='local' and s.is_active
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'siteId',id,'siteName',name,
    'sessionId',session_id,'state',coalesce(state,'not_opened'),
    'openingCash',coalesce(opening_cash,0),
    'expenses',expenses,'salesCash',sales_cash,'salesTransfer',sales_transfer,
    'expectedCash',coalesce(opening_cash,0)+sales_cash-expenses,
    'closingCountedCash',closing_counted_cash,
    'closingDifference',closing_difference,
    'openedAt',opened_at,'closedAt',closed_at,'managerEnabled',has_active_manager
  ) order by name),'[]'::jsonb) into v_data from by_store;
  return jsonb_build_object('businessDate',v_date,'initialApproved',v_initial,
    'timezone','America/Bogota','stores',v_data);
end;
$$;
revoke all on function public.nexora_cash_day_report(date) from public,anon,authenticated;
grant execute on function public.nexora_cash_day_report(date) to authenticated;

-- Procedimientos futuros de caja: requieren aprobación inicial, una
-- asignación real activa a la sede y rol ACTIVADO (hoy siempre false).
-- Admin puede abrir; Encargado puede abrir/cerrar/gastar; Admin reabre
-- de forma extraordinaria con motivo. Nunca concede permisos legacy.
create function nexora_internal.cash_operation(
  p_action text, p_site_id uuid, p_amount numeric default null, p_note text default null
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare
  v_role text;
  v_is_admin boolean;
  v_site record;
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_session public.nexora_cash_sessions%rowtype;
  v_sales_cash numeric;
  v_expenses numeric;
  v_expected numeric;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  if p_action not in ('open','expense','close','reopen') or p_action is null then
    raise exception 'Operación de caja inválida.';
  end if;
  if not exists(select 1 from public.nexora_initial_inventory_approvals) then
    raise exception 'Aprueba primero el inventario inicial.';
  end if;
  if not exists(
    select 1 from public.nexora_staff_sites ss
    join public.nexora_staff_role_plans rp on rp.user_id=ss.user_id
    join public.bodega_profiles bp on bp.id=ss.user_id
    where ss.site_id=p_site_id and ss.is_active and bp.is_active
      and rp.operationally_enabled and rp.planned_role='encargado'
  ) then
    raise exception 'No se puede operar caja sin Encargado habilitado en esta sede.';
  end if;

  v_is_admin:=public.bodega_is_admin();
  select rp.planned_role into v_role
  from public.nexora_staff_role_plans rp
  join public.nexora_staff_sites ss on ss.user_id=rp.user_id
  join public.bodega_profiles bp on bp.id=rp.user_id
  where rp.user_id=auth.uid() and rp.operationally_enabled
    and ss.site_id=p_site_id and ss.is_active and bp.is_active;
  if (p_action in ('open','reopen') and not v_is_admin and
      (p_action='reopen' or v_role is distinct from 'encargado'))
     or (p_action in ('expense','close') and v_role is distinct from 'encargado') then
    raise exception 'No tienes permisos para operar la caja de este local.';
  end if;
  select s.id into v_site from public.nexora_sites s
    where s.id=p_site_id and s.is_active and s.site_type='local';
  if not found then raise exception 'Selecciona un local comercial activo.'; end if;
  perform pg_advisory_xact_lock(78192348);

  select * into v_session from public.nexora_cash_sessions
    where site_id=p_site_id and business_date=v_day for update;

  if p_action='open' then
    if v_session.id is not null then raise exception 'Solo se permite una apertura por local y día.'; end if;
    if p_amount is null or p_amount<0 or p_amount>99999999999999.99\n       or p_amount<>round(p_amount,2) then
      raise exception 'El efectivo inicial debe ser un importe válido y no negativo.';
    end if;
    insert into public.nexora_cash_sessions
      (site_id,business_date,opening_cash,opened_by)
    values(p_site_id,v_day,p_amount,auth.uid()) returning * into v_session;
    insert into public.nexora_cash_events(session_id,action,actor_id,data)
    values(v_session.id,'open',auth.uid(),jsonb_build_object('openingCash',p_amount));
    return jsonb_build_object('sessionId',v_session.id,'state','open','date',v_day);
  end if;

  if v_session.id is null then raise exception 'No existe apertura de caja para hoy.'; end if;

  if p_action='reopen' then
    if not v_is_admin or v_session.state<>'closed' or length(btrim(coalesce(p_note,'')))<5 then
      raise exception 'Reapertura excepcional solo por Administrador, con motivo suficiente.';
    end if;
    update public.nexora_cash_sessions
      set state='open',closed_by=null,closed_at=null,closing_expected_cash=null,
      closing_counted_cash=null,closing_difference=null
    where id=v_session.id;
    insert into public.nexora_cash_events(session_id,action,actor_id,note,data)
    values(v_session.id,'reopen',auth.uid(),btrim(p_note),
      jsonb_build_object('priorClosingDifference',v_session.closing_difference));
    return jsonb_build_object('sessionId',v_session.id,'state','open','reopened',true);
  end if;

  if v_session.state<>'open' then raise exception 'La caja del día está cerrada.'; end if;
  select coalesce(sum(sale.paid_amount),0) into v_sales_cash
  from public.nexora_retail_sales sale
  where sale.cash_session_id=v_session.id and sale.payment_method='efectivo';
  select coalesce(sum(e.amount),0) into v_expenses
  from public.nexora_cash_expenses e where e.session_id=v_session.id;
  v_expected:=v_session.opening_cash+v_sales_cash-v_expenses;

  if p_action='expense' then
    if p_amount is null or p_amount<=0 or p_amount>99999999999999.99\n       or p_amount<>round(p_amount,2)
       or length(btrim(coalesce(p_note,'')))<5 or length(p_note)>500 then
      raise exception 'Registra monto positivo y una descripción de 5 a 500 caracteres.';
    end if;
    if p_amount>v_expected then
      raise exception 'El gasto excede el efectivo esperado en caja.';
    end if;
    insert into public.nexora_cash_expenses(session_id,amount,description,authorized_by)
      values(v_session.id,p_amount,btrim(p_note),auth.uid());
    insert into public.nexora_cash_events(session_id,action,actor_id,note,data)
      values(v_session.id,'expense',auth.uid(),btrim(p_note),jsonb_build_object('amount',p_amount));
    return jsonb_build_object('sessionId',v_session.id,'state','open',
      'expenseRegistered',p_amount);
  end if;

  if p_action='close' then
    if p_amount is null or p_amount<0 or p_amount>99999999999999.99 then
      raise exception 'Cuenta y confirma el efectivo físico de cierre.';
    end if;
    update public.nexora_cash_sessions
      set state='closed',closed_by=auth.uid(),closed_at=now(),
      closing_expected_cash=v_expected,closing_counted_cash=p_amount,
      closing_difference=p_amount-v_expected
      where id=v_session.id;
    insert into public.nexora_cash_events(session_id,action,actor_id,data)
      values(v_session.id,'close',auth.uid(),
        jsonb_build_object('expected',v_expected,'counted',p_amount,
          'difference',p_amount-v_expected,'salesCash',v_sales_cash,'expenses',v_expenses));
    return jsonb_build_object('sessionId',v_session.id,'state','closed',
      'expected',v_expected,'counted',p_amount,'difference',p_amount-v_expected);
  end if;
  raise exception 'Acción no reconocida.';
end;
$$;
revoke all on function nexora_internal.cash_operation(text,uuid,numeric,text)
 from public,anon,authenticated;
grant usage on schema nexora_internal to authenticated;
grant execute on function nexora_internal.cash_operation(text,uuid,numeric,text)
 to authenticated;

create function public.nexora_cash_operation(
  p_action text,p_site_id uuid,p_amount numeric default null,p_note text default null
) returns jsonb language sql volatile security invoker
set search_path=pg_catalog,public as $$
  select nexora_internal.cash_operation(p_action,p_site_id,p_amount,p_note);
$$;
revoke all on function public.nexora_cash_operation(text,uuid,numeric,text)
 from public,anon,authenticated;
grant execute on function public.nexora_cash_operation(text,uuid,numeric,text)
 to authenticated;

comment on table public.nexora_retail_sales is
  'Registro preparado para ventas retail con pago completo, costo IMEI y unidad única. SIN habilitar operaciones de venta hasta conectar POS seguro.';
comment on table public.nexora_cash_sessions is
  'Caja local por día Colombia; operaciones se autorizan exclusivamente por RPC, rol de sede habilitado y control transaccional.';
