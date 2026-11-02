-- Nexora Multisede 2.0 · preparación de roles + verificación POS.
-- No modifica perfiles legacy ni activa privilegios de Encargado/Vendedor.
-- Tampoco reserva, vende, altera costos ni mueve IMEI.

create table public.nexora_staff_role_plans (
  user_id uuid primary key references public.bodega_profiles(id) on delete restrict,
  planned_role text not null check (planned_role in ('bodeguero','encargado','vendedor')),
  operationally_enabled boolean not null default false check (not operationally_enabled),
  created_by uuid not null references public.bodega_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.bodega_profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.nexora_staff_role_plan_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  planned_role text not null,
  actor_id uuid not null,
  event_type text not null check (event_type in ('planned','changed')),
  created_at timestamptz not null default now()
);
create index nexora_role_plan_events_user_idx
  on public.nexora_staff_role_plan_events(user_id,created_at desc);

create function public.nexora_validate_role_plan()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede preparar roles multisede.';
  end if;
  if not exists (
    select 1 from public.bodega_profiles p
    where p.id=new.user_id and p.is_active and p.role='bodeguero'
  ) then
    raise exception 'Solo pueden prepararse perfiles de personal activo no administrador.';
  end if;
  if tg_op='UPDATE' then
    if new.user_id is distinct from old.user_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'No se puede cambiar la identidad de un perfil preparado.';
    end if;
  else
    new.created_at:=now();
    new.created_by:=auth.uid();
  end if;
  new.operationally_enabled:=false;
  new.updated_at:=now();
  new.updated_by:=auth.uid();
  return new;
end;
$$;
revoke all on function public.nexora_validate_role_plan() from public,anon,authenticated;
create trigger nexora_guard_staff_role_plan
  before insert or update on public.nexora_staff_role_plans
  for each row execute function public.nexora_validate_role_plan();

create function nexora_internal.audit_role_plan()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Acción de roles no autorizada.';
  end if;
  if tg_op='INSERT' or new.planned_role is distinct from old.planned_role then
    insert into public.nexora_staff_role_plan_events
      (user_id,planned_role,actor_id,event_type)
    values(new.user_id,new.planned_role,auth.uid(),
      case when tg_op='INSERT' then 'planned' else 'changed' end);
  end if;
  return new;
end;
$$;
revoke all on function nexora_internal.audit_role_plan() from public,anon,authenticated;
create trigger nexora_role_plan_audit
  after insert or update on public.nexora_staff_role_plans
  for each row execute function nexora_internal.audit_role_plan();

alter table public.nexora_staff_role_plans enable row level security;
alter table public.nexora_staff_role_plan_events enable row level security;
create policy nexora_role_plans_read on public.nexora_staff_role_plans
  for select to authenticated using ((select public.bodega_is_admin()));
create policy nexora_role_plans_insert on public.nexora_staff_role_plans
  for insert to authenticated with check ((select public.bodega_is_admin()));
create policy nexora_role_plans_update on public.nexora_staff_role_plans
  for update to authenticated using ((select public.bodega_is_admin()))
  with check ((select public.bodega_is_admin()));
create policy nexora_role_plan_events_read on public.nexora_staff_role_plan_events
  for select to authenticated using ((select public.bodega_is_admin()));

revoke all on public.nexora_staff_role_plans,public.nexora_staff_role_plan_events
  from public,anon,authenticated;
grant select,insert,update on public.nexora_staff_role_plans to authenticated;
grant select on public.nexora_staff_role_plan_events to authenticated;

-- Consulta de elegibilidad de un IMEI para POS, sin autorización de venta.
-- Comprobaciones independientes de cliente: rol, sede/local, acta, precio,
-- custodio, pedido pendiente, traslado abierto y estado de unidad.
-- No hay efecto sobre ventas, caja, reservas o inventario.
create function public.nexora_pos_preflight(
  p_site_id uuid, p_serial text, p_price numeric
)
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public as $$
declare
  v_unit record;
  v_site record;
  v_custody record;
  v_reserved boolean;
  v_in_transfer boolean;
  v_approved boolean;
  v_reason text;
  v_eligible boolean := false;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede revisar el POS antes de habilitar roles.';
  end if;
  if p_site_id is null or p_serial is null or length(btrim(p_serial))=0
     or length(p_serial)>160 or p_price is null or p_price <= 0 then
    raise exception 'Selecciona local, IMEI y precio positivo.';
  end if;

  select exists(select 1 from public.nexora_initial_inventory_approvals) into v_approved;
  select s.id,s.name from public.nexora_sites s
   where s.id=p_site_id and s.site_type='local' and s.is_active into v_site;
  select u.id,u.serial,u.status,u.cost from public.bodega_units u
    where lower(btrim(u.serial))=lower(btrim(p_serial)) into v_unit;

  if not v_approved then
    v_reason:='INVENTORY_NOT_APPROVED';
  elsif v_site.id is null then
    v_reason:='INVALID_STORE';
  elsif v_unit.id is null then
    v_reason:='IMEI_NOT_FOUND';
  else
    select coalesce(c.site_id,i.site_id) site_id,
      coalesce(c.custody_status,'at_site') custody_status
      into v_custody
      from public.nexora_initial_unit_sites i
      left join public.nexora_unit_custody c on c.unit_id=i.unit_id
      where i.unit_id=v_unit.id;

    select exists(
      select 1 from public.bodega_order_item_units l
      join public.bodega_order_items oi on oi.id=l.order_item_id
      join public.bodega_orders o on o.id=oi.order_id
      where l.unit_id=v_unit.id and o.status not in ('cancelado','despachado')
    ) into v_reserved;
    select exists(
      select 1 from public.nexora_transfer_lines l
       where l.unit_id=v_unit.id and l.state in ('prepared','in_transit','return_pending')
    ) into v_in_transfer;

    if v_custody.site_id is distinct from p_site_id
       or v_custody.custody_status is distinct from 'at_site' then
      v_reason:='WRONG_SITE_OR_TRANSIT';
    elsif v_unit.status <> 'en_local' then
      v_reason:='NOT_RETAIL_STOCK';
    elsif v_reserved or v_in_transfer then
      v_reason:='IMEI_COMMITTED';
    elsif v_unit.cost is null or p_price <= v_unit.cost then
      v_reason:='PRICE_NOT_ABOVE_COST';
    else
      v_reason:='CHECKS_PASSED_POS_NOT_ENABLED';
      v_eligible:=true;
    end if;
  end if;
  return jsonb_build_object(
    'eligibleForFuturePos',v_eligible,
    'saleEnabled',false,
    'reason',v_reason,
    'siteName',v_site.name,
    'serial',coalesce(v_unit.serial,btrim(p_serial)),
    'status',v_unit.status,
    'unitCost',v_unit.cost,
    'proposedPrice',p_price
  );
end;
$$;
revoke all on function public.nexora_pos_preflight(uuid,text,numeric)
  from public,anon,authenticated;
grant execute on function public.nexora_pos_preflight(uuid,text,numeric) to authenticated;

comment on table public.nexora_staff_role_plans is
  'Asignación PREPARATORIA de rol por usuario. operationally_enabled está obligado a false y nunca cambia privilegios legacy.';
comment on function public.nexora_pos_preflight(uuid,text,numeric) is
  'Verificación informativa de IMEI para POS, NO crea ni autoriza una venta.';
