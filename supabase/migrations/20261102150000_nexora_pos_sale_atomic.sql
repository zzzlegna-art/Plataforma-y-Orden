-- Nexora Multisede · POS transaccional por IMEI.
-- Sin ventas automáticas. Requiere inventario inicial APROBADO, caja abierta,
-- Encargado habilitado y sede autorizada; ese perfil hoy sigue desactivado.
-- Mantiene intacto el sistema mayorista.

alter table public.nexora_unit_custody
  drop constraint nexora_custody_shape;
alter table public.nexora_unit_custody
  drop constraint nexora_unit_custody_custody_status_check;
alter table public.nexora_unit_custody
  add constraint nexora_unit_custody_custody_status_check
  check (custody_status in ('at_site','in_transit','return_pending','sold'));
alter table public.nexora_unit_custody
  add constraint nexora_custody_shape
  check (
    (custody_status='at_site' and site_id is not null and transfer_id is null)
    or (custody_status in ('in_transit','return_pending') and site_id is null and transfer_id is not null)
    or (custody_status='sold' and site_id is null and transfer_id is null)
  );

alter table public.nexora_retail_sales
  add column request_id uuid unique;

-- Reconciliación idempotente: nunca debe existir una segunda venta con la misma solicitud.
-- La tabla está vacía en la fecha de esta migración y el valor se exige a todas las ventas futuras.
alter table public.nexora_retail_sales
  alter column request_id set not null;

alter table public.nexora_cash_events
  drop constraint nexora_cash_events_action_check;
alter table public.nexora_cash_events
  add constraint nexora_cash_events_action_check
  check(action in ('open','expense','close','reopen','sale'));

-- Nadie puede editar el libro de ventas por fuera de un proceso de reversión
-- aprobado por el administrador (en una etapa posterior).
create function public.nexora_protect_retail_receipt()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
begin
  raise exception 'Los comprobantes retail son inmutables. Usa una devolución autorizada cuando esté habilitada.';
end;
$$;
revoke all on function public.nexora_protect_retail_receipt() from public,anon,authenticated;
create trigger nexora_retail_receipt_immutable
  before update or delete on public.nexora_retail_sales
  for each row execute function public.nexora_protect_retail_receipt();

-- Evita que las pantallas de mayoristas asignen un IMEI ya vendido en retail.
create function public.nexora_guard_retail_legacy_assignment()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
begin
  -- Compartir la exclusión transaccional con POS y traslados, incluso
  -- al insertar o reemplazar IMEI en un pedido mayorista.
  perform pg_advisory_xact_lock(78192346);
  if new.unit_id is not null and exists(
    select 1 from public.nexora_retail_sales sale where sale.unit_id=new.unit_id
  ) then
    raise exception 'Este IMEI ya fue vendido en un local; no puede ingresar a un pedido mayorista.';
  end if;
  return new;
end;
$$;
revoke all on function public.nexora_guard_retail_legacy_assignment() from public,anon,authenticated;
create trigger nexora_00_guard_retail_legacy_assignment
before insert or update of unit_id,order_item_id on public.bodega_order_item_units
for each row execute function public.nexora_guard_retail_legacy_assignment();

-- Una venta confirmada no puede volver al inventario comercial
-- por sincronizaciones antiguas del cliente.
create function public.nexora_guard_retail_legacy_unit()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.nexora_retail_sales r where r.unit_id=old.id) then
      raise exception 'No puedes eliminar un IMEI vendido en POS.';
    end if;
    return old;
  end if;
  if old.status='vendido' and exists(
      select 1 from public.nexora_retail_sales r where r.unit_id=old.id
    ) and (new.status is distinct from old.status
       or new.serial is distinct from old.serial
       or new.cost is distinct from old.cost
       or new.location is distinct from old.location) then
    raise exception 'IMEI vendido en POS: no puede reactivarse ni modificarse fuera de un proceso de devolución.';
  end if;
  return new;
end;
$$;
revoke all on function public.nexora_guard_retail_legacy_unit() from public,anon,authenticated;
create trigger nexora_guard_pos_sold_unit
before update of status,serial,cost,location or delete on public.bodega_units
for each row execute function public.nexora_guard_retail_legacy_unit();

-- Cerrar pedidos antiguos y reabrirlos no debe permitir adjudicar una
-- unidad vendida retail. Conserva todos los controles logísticos anteriores.
create function public.nexora_guard_retail_order_reopen()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
begin
  if new.status is distinct from old.status and new.status<>'cancelado'
    and exists (
      select 1 from public.bodega_order_items oi
      join public.bodega_order_item_units l on l.order_item_id=oi.id
      join public.nexora_retail_sales rs on rs.unit_id=l.unit_id
      where oi.order_id=new.id
    ) then
    raise exception 'Este pedido contiene IMEI vendidos en POS; no puede reactivarse.';
  end if;
  return new;
end;
$$;
revoke all on function public.nexora_guard_retail_order_reopen() from public,anon,authenticated;
create trigger nexora_guard_retail_reopen_order
before update of status on public.bodega_orders
for each row execute function public.nexora_guard_retail_order_reopen();

-- Única forma de registrar una venta retail. Una transacción Postgres:
-- una solicitud, una caja abierta, un IMEI libre, un pago completo, una venta.
create function nexora_internal.complete_retail_sale(
  p_request_id uuid, p_site_id uuid, p_serial text,
  p_price numeric, p_paid numeric, p_payment_method text
) returns jsonb
language plpgsql volatile security definer
set search_path=pg_catalog,public as $$
declare
  v_user_role text;
  v_is_admin boolean;
  v_has_manager boolean;
  v_allowed boolean;
  v_date date := (now() at time zone 'America/Bogota')::date;
  v_cash public.nexora_cash_sessions%rowtype;
  v_unit public.bodega_units%rowtype;
  v_sale public.nexora_retail_sales%rowtype;
  v_custody record;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para realizar la venta.'; end if;
  if p_request_id is null or p_site_id is null
    or p_serial is null or length(btrim(p_serial))=0 or length(btrim(p_serial))>160
    or p_price is null or p_paid is null or p_price<=0 or p_price>99999999999999.99
    or p_price<>round(p_price,2) or p_paid<>p_price
    or p_payment_method not in ('efectivo','transferencia') or p_payment_method is null then
    raise exception 'Venta inválida: selecciona local, IMEI, pago completo y medio de pago autorizado.';
  end if;

  -- Orden de bloqueos compatible con los traslados (78192346)
  -- y caja (78192348): elimina las carreras pedido-traslado-venta-cierre.
  perform pg_advisory_xact_lock(78192346);
  perform pg_advisory_xact_lock(78192348);

  v_is_admin := public.bodega_is_admin();
  select rp.planned_role into v_user_role from public.nexora_staff_role_plans rp
    join public.nexora_staff_sites ss on ss.user_id=rp.user_id
    join public.bodega_profiles bp on bp.id=rp.user_id
    where rp.user_id=auth.uid() and bp.is_active
      and rp.operationally_enabled and ss.is_active
      and ss.site_id=p_site_id;

  v_allowed := v_is_admin or v_user_role in ('encargado','vendedor');
  if not coalesce(v_allowed,false) then
    raise exception 'Sin permiso activo para ventas de este local.';
  end if;

  -- Reintento exactamente igual: devuelve el mismo comprobante.
  select * into v_sale from public.nexora_retail_sales
    where request_id=p_request_id;
  if found then
    if v_sale.sold_by<>auth.uid() or v_sale.site_id<>p_site_id
      or lower(btrim(v_sale.serial_snapshot))<>lower(btrim(p_serial))
      or v_sale.unit_price<>p_price or v_sale.paid_amount<>p_paid
      or v_sale.payment_method<>p_payment_method then
      raise exception 'El identificador de venta ya fue utilizado con otros datos.';
    end if;
    return jsonb_build_object(
      'saleId',v_sale.id,'serial',v_sale.serial_snapshot,
      'price',v_sale.unit_price,'paymentMethod',v_sale.payment_method,
      'soldAt',v_sale.sold_at,'replayed',true);
  end if;

  if not exists(select 1 from public.nexora_initial_inventory_approvals) then
    raise exception 'El inventario físico inicial todavía no está aprobado.';
  end if;
  if not exists (
    select 1 from public.nexora_sites s
    where s.id=p_site_id and s.site_type='local' and s.is_active
  ) then raise exception 'Solo se puede vender desde un local comercial activo.'; end if;

  select exists(
    select 1 from public.nexora_staff_sites ss
    join public.nexora_staff_role_plans rp on rp.user_id=ss.user_id
    join public.bodega_profiles bp on bp.id=ss.user_id
    where ss.site_id=p_site_id and ss.is_active and bp.is_active
      and rp.operationally_enabled and rp.planned_role='encargado'
  ) into v_has_manager;
  if not v_has_manager then
    raise exception 'La caja del local requiere Encargado habilitado.';
  end if;

  select * into v_cash from public.nexora_cash_sessions
    where site_id=p_site_id and business_date=v_date and state='open'
    for update;
  if not found then raise exception 'La caja de hoy no está abierta.'; end if;

  select * into v_unit from public.bodega_units u
    where lower(btrim(u.serial))=lower(btrim(p_serial)) for update;
  if not found then raise exception 'El IMEI no existe en inventario.'; end if;
  if v_unit.status<>'en_local' then
    raise exception 'Este IMEI no está disponible para venta minorista.';
  end if;
  if v_unit.cost is null or v_unit.cost<0 or p_price<=v_unit.cost then
    raise exception 'El precio debe superar estrictamente el costo real de este IMEI.';
  end if;

  select coalesce(c.site_id,i.site_id) as effective_site,
    coalesce(c.custody_status,'at_site') as state
    into v_custody
    from public.nexora_initial_unit_sites i
    left join public.nexora_unit_custody c on c.unit_id=i.unit_id
    where i.unit_id=v_unit.id;
  if not found or v_custody.effective_site is distinct from p_site_id
    or v_custody.state is distinct from 'at_site' then
    raise exception 'El IMEI no está físicamente asignado a este local.';
  end if;

  if exists (select 1 from public.nexora_transfer_lines l
      where l.unit_id=v_unit.id and l.state in ('prepared','in_transit','return_pending'))
    or exists (
      select 1 from public.bodega_order_item_units link
      join public.bodega_order_items item on item.id=link.order_item_id
      join public.bodega_orders ord on ord.id=item.order_id
      where link.unit_id=v_unit.id and ord.status<>'cancelado'
    )
    or exists (select 1 from public.nexora_retail_sales r where r.unit_id=v_unit.id) then
      raise exception 'IMEI ya asignado a un pedido, traslado o venta anterior.';
  end if;

  insert into public.nexora_retail_sales
    (request_id,cash_session_id,unit_id,site_id,serial_snapshot,
     unit_cost,unit_price,payment_method,paid_amount,sold_by)
  values(p_request_id,v_cash.id,v_unit.id,p_site_id,v_unit.serial,
    v_unit.cost,p_price,p_payment_method,p_paid,auth.uid())
  returning * into v_sale;

  -- La misma transacción da de baja stock legacy y custodia física:
  -- nunca hay un intervalo en que dos sistemas vendan el mismo IMEI.
  update public.bodega_units set status='vendido' where id=v_unit.id;
  insert into public.nexora_unit_custody(unit_id,site_id,custody_status,transfer_id)
    values(v_unit.id,null,'sold',null)
    on conflict (unit_id) do update set
      site_id=null,custody_status='sold',transfer_id=null,updated_at=now();

  insert into public.nexora_cash_events(session_id,action,actor_id,data)
    values(v_cash.id,'sale',auth.uid(),jsonb_build_object(
      'saleId',v_sale.id,'unitId',v_unit.id,'paymentMethod',p_payment_method,
      'paid',p_paid,'cost',v_unit.cost));

  return jsonb_build_object(
    'saleId',v_sale.id,'serial',v_sale.serial_snapshot,
    'price',v_sale.unit_price,'paymentMethod',v_sale.payment_method,
    'soldAt',v_sale.sold_at,'replayed',false);
end;
$$;
revoke all on function nexora_internal.complete_retail_sale(uuid,uuid,text,numeric,numeric,text)
 from public,anon,authenticated;
grant usage on schema nexora_internal to authenticated;
grant execute on function nexora_internal.complete_retail_sale(uuid,uuid,text,numeric,numeric,text)
 to authenticated;

create function public.nexora_pos_sell(
  p_request_id uuid,p_site_id uuid,p_serial text,p_price numeric,
  p_paid numeric,p_payment_method text
) returns jsonb language sql volatile security invoker
set search_path=pg_catalog,public as $$
  select nexora_internal.complete_retail_sale(
    p_request_id,p_site_id,p_serial,p_price,p_paid,p_payment_method
  );
$$;
revoke all on function public.nexora_pos_sell(uuid,uuid,text,numeric,numeric,text)
 from public,anon,authenticated;
grant execute on function public.nexora_pos_sell(uuid,uuid,text,numeric,numeric,text)
 to authenticated;

comment on function public.nexora_pos_sell(uuid,uuid,text,numeric,numeric,text) is
 'Venta POS atómica con pago íntegro e idempotencia, prohibida hasta aprobación inicial, caja abierta y roles operativos habilitados.';
