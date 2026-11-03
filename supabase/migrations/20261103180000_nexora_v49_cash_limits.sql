-- Nexora V4.9 - limites monetarios configurables por Administrador.
-- Migracion ADITIVA: no habilita caja, roles, ventas, ni cambia historicos.
create table public.nexora_cash_limits (
  site_id uuid primary key references public.nexora_sites(id) on delete restrict,
  max_per_expense numeric(16,2) not null check (max_per_expense >= 0),
  max_per_day numeric(16,2) not null check (max_per_day >= 0),
  updated_by uuid not null references public.bodega_profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);
create table public.nexora_cash_limit_events (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.nexora_sites(id) on delete restrict,
  actor_id uuid not null references public.bodega_profiles(id) on delete restrict,
  old_max_per_expense numeric(16,2),
  old_max_per_day numeric(16,2),
  new_max_per_expense numeric(16,2) not null,
  new_max_per_day numeric(16,2) not null,
  occurred_at timestamptz not null default now()
);
create index nexora_cash_limit_events_site_idx
  on public.nexora_cash_limit_events(site_id, occurred_at desc);

alter table public.nexora_cash_limits enable row level security;
alter table public.nexora_cash_limit_events enable row level security;
create policy nexora_cash_limits_admin_read on public.nexora_cash_limits
  for select to authenticated using ((select public.bodega_is_admin()));
create policy nexora_cash_limit_events_admin_read on public.nexora_cash_limit_events
  for select to authenticated using ((select public.bodega_is_admin()));
revoke all on public.nexora_cash_limits, public.nexora_cash_limit_events
  from public, anon, authenticated;
grant select on public.nexora_cash_limits, public.nexora_cash_limit_events
  to authenticated;

-- Sin politica configurada, no puede efectuarse ningun gasto. El tope es
-- transaccional en servidor, independientemente del navegador o la UI.
create function nexora_internal.guard_cash_expense_limit()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_site_id uuid;
  v_limit public.nexora_cash_limits%rowtype;
  v_spent numeric;
begin
  select s.site_id into v_site_id from public.nexora_cash_sessions s
  where s.id = new.session_id for update;
  if v_site_id is null then raise exception 'Sesion de caja inexistente.'; end if;
  select * into v_limit from public.nexora_cash_limits l
    where l.site_id = v_site_id for share;
  if not found then
    raise exception 'El Administrador debe configurar los topes de gasto de este local.';
  end if;
  if new.amount > v_limit.max_per_expense then
    raise exception 'Gasto superior al limite por operacion autorizado.';
  end if;
  select coalesce(sum(e.amount), 0) into v_spent
    from public.nexora_cash_expenses e where e.session_id = new.session_id;
  if v_spent + new.amount > v_limit.max_per_day then
    raise exception 'Se excederia el limite diario de gastos del local.';
  end if;
  return new;
end;
$$;
revoke all on function nexora_internal.guard_cash_expense_limit()
  from public, anon, authenticated;
create trigger nexora_00_cash_expense_limit
  before insert on public.nexora_cash_expenses
  for each row execute function nexora_internal.guard_cash_expense_limit();

-- Solo Administrador configura; cada cambio conserva actor y valores previos.
create function nexora_internal.set_cash_limits(
  p_site_id uuid, p_per_expense numeric, p_per_day numeric
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_old public.nexora_cash_limits%rowtype;
  v_updated public.nexora_cash_limits%rowtype;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador configura limites de caja.';
  end if;
  if p_per_expense is null or p_per_day is null or
    p_per_expense < 0 or p_per_day < 0 or
    p_per_expense > 99999999999999.99 or p_per_day > 99999999999999.99 or
    p_per_expense <> round(p_per_expense,2) or p_per_day <> round(p_per_day,2) then
    raise exception 'Limites no validos: usa importes no negativos con dos decimales.';
  end if;
  if not exists(select 1 from public.nexora_sites
    where id=p_site_id and is_active and site_type='local') then
    raise exception 'Selecciona un local comercial activo.';
  end if;
  perform pg_advisory_xact_lock(78192349, hashtext(p_site_id::text));
  select * into v_old from public.nexora_cash_limits
    where site_id=p_site_id for update;
  insert into public.nexora_cash_limits
    (site_id,max_per_expense,max_per_day,updated_by)
    values (p_site_id,p_per_expense,p_per_day,auth.uid())
    on conflict (site_id) do update
      set max_per_expense=excluded.max_per_expense,
          max_per_day=excluded.max_per_day,
          updated_by=excluded.updated_by,
          updated_at=now()
    returning * into v_updated;
  insert into public.nexora_cash_limit_events
    (site_id,actor_id,old_max_per_expense,old_max_per_day,
     new_max_per_expense,new_max_per_day)
    values (p_site_id,auth.uid(),v_old.max_per_expense,v_old.max_per_day,
            p_per_expense,p_per_day);
  return jsonb_build_object(
    'siteId',p_site_id,'maxPerExpense',v_updated.max_per_expense,
    'maxPerDay',v_updated.max_per_day,'updatedAt',v_updated.updated_at
  );
end;
$$;
revoke all on function nexora_internal.set_cash_limits(uuid,numeric,numeric)
  from public,anon,authenticated;
grant execute on function nexora_internal.set_cash_limits(uuid,numeric,numeric)
  to authenticated;
create function public.nexora_set_cash_limits(
  p_site_id uuid,p_per_expense numeric,p_per_day numeric
) returns jsonb language sql volatile security invoker
set search_path=pg_catalog,public
as $$
  select nexora_internal.set_cash_limits(p_site_id,p_per_expense,p_per_day);
$$;
revoke all on function public.nexora_set_cash_limits(uuid,numeric,numeric)
  from public,anon,authenticated;
grant execute on function public.nexora_set_cash_limits(uuid,numeric,numeric)
  to authenticated;

create function public.nexora_cash_limit_report()
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public
as $$
declare v_rows jsonb;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador consulta limites de caja.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'siteId',s.id,'siteName',s.name,'configured',l.site_id is not null,
    'maxPerExpense',l.max_per_expense,'maxPerDay',l.max_per_day,
    'updatedAt',l.updated_at
  ) order by s.name),'[]'::jsonb) into v_rows
  from public.nexora_sites s left join public.nexora_cash_limits l on l.site_id=s.id
  where s.is_active and s.site_type='local';
  return v_rows;
end;
$$;
revoke all on function public.nexora_cash_limit_report()
  from public,anon,authenticated;
grant execute on function public.nexora_cash_limit_report() to authenticated;

comment on table public.nexora_cash_limits is
  'Topes por gasto y por dia configurables solo por Administrador; no activa caja ni POS.';
