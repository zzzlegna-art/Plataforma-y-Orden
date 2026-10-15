-- ============================================================
-- Bodega 6A :: códigos y concurrencia en el servidor
--
-- Qué resuelve (hoy lo decide cada navegador, así que dos personas a la vez pueden
-- pisarse):
--   1) Los códigos PED / GAR / REC los asigna la base y nunca se repiten.
--   2) Un mismo IMEI no puede asignarse a dos pedidos en preparación a la vez.
--
-- No cambia datos existentes. Es idempotente. La app actual y la nueva siguen
-- funcionando con o sin esta migración (es compatible hacia los dos lados).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Generador de códigos (día según la hora de Colombia)
--      PED-YYMMDD-NNN   pedidos      (ej. PED-260921-001)
--      GAR-YYMMDD-NNN   garantías    (ej. GAR-260921-001)
--      REC-NNNNN        recepciones  (consecutivo global, ej. REC-00069)
--    Toma un candado por tabla hasta el fin de la transacción: dos peticiones a la
--    vez esperan su turno en lugar de calcular el mismo número.
-- ------------------------------------------------------------
create or replace function public.bodega_siguiente_codigo(p_tabla text)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_dia text := to_char(now() at time zone 'America/Bogota', 'YYMMDD');
  v_max integer;
begin
  perform pg_advisory_xact_lock(hashtext('bodega_codigo:' || p_tabla));

  if p_tabla = 'bodega_orders' then
    select coalesce(max((regexp_match(code, '^PED-' || v_dia || '-(\d+)$'))[1]::integer), 0)
      into v_max from public.bodega_orders;
    return 'PED-' || v_dia || '-' || lpad((v_max + 1)::text, 3, '0');

  elsif p_tabla = 'bodega_warranties' then
    select coalesce(max((regexp_match(code, '^GAR-' || v_dia || '-(\d+)$'))[1]::integer), 0)
      into v_max from public.bodega_warranties;
    return 'GAR-' || v_dia || '-' || lpad((v_max + 1)::text, 3, '0');

  elsif p_tabla = 'bodega_receptions' then
    select coalesce(max((regexp_match(code, '^REC-(\d+)$'))[1]::integer), 0)
      into v_max from public.bodega_receptions;
    return 'REC-' || lpad((v_max + 1)::text, 5, '0');
  end if;

  raise exception 'bodega_siguiente_codigo: tabla no soportada (%)', p_tabla;
end;
$$;

-- ------------------------------------------------------------
-- 2) Al crear un registro se respeta el código que traiga la app si está libre; si
--    viene vacío o ya lo usa otro registro (otro dispositivo se adelantó), la base
--    asigna el siguiente. Una vez creado, el código no cambia: un dispositivo con
--    datos viejos no puede pisarlo. Para corregir uno a mano, en SQL:
--        set local bodega.permitir_cambio_codigo = 'on';
-- ------------------------------------------------------------
create or replace function public.bodega_asignar_codigo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_ocupado boolean;
begin
  if tg_op = 'UPDATE' then
    if current_setting('bodega.permitir_cambio_codigo', true) is distinct from 'on' then
      new.code := old.code;
    end if;
    return new;
  end if;

  -- El mismo candado que usa bodega_siguiente_codigo (se puede tomar dos veces
  -- dentro de la misma transacción).
  perform pg_advisory_xact_lock(hashtext('bodega_codigo:' || tg_table_name));

  if coalesce(btrim(new.code), '') = '' then
    v_ocupado := true;
  else
    execute format('select exists (select 1 from public.%I where code = $1)', tg_table_name)
      into v_ocupado using new.code;
  end if;

  if v_ocupado then
    new.code := public.bodega_siguiente_codigo(tg_table_name);
  end if;
  return new;
end;
$$;

drop trigger if exists bodega_orders_codigo on public.bodega_orders;
create trigger bodega_orders_codigo
  before insert or update of code on public.bodega_orders
  for each row execute function public.bodega_asignar_codigo();

drop trigger if exists bodega_receptions_codigo on public.bodega_receptions;
create trigger bodega_receptions_codigo
  before insert or update of code on public.bodega_receptions
  for each row execute function public.bodega_asignar_codigo();

drop trigger if exists bodega_warranties_codigo on public.bodega_warranties;
create trigger bodega_warranties_codigo
  before insert or update of code on public.bodega_warranties
  for each row execute function public.bodega_asignar_codigo();

-- ------------------------------------------------------------
-- 3) Un IMEI no puede quedar en dos pedidos en preparación a la vez.
--    Bloquea la fila de la unidad: si dos personas la asignan al mismo tiempo, la
--    segunda espera a la primera y después ve su asignación y es rechazada.
--    Mensajes (la app los traduce a un aviso):
--        BODEGA_UNIDAD_YA_ASIGNADA:<serial>
--        BODEGA_UNIDAD_NO_DISPONIBLE:<serial>
--    Solo valida filas NUEVAS: el reenvío de una fila que ya existe no se revalida.
-- ------------------------------------------------------------
create or replace function public.bodega_validar_asignacion_unidad()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_estado text;
  v_serial text;
  v_estado_pedido text;
begin
  if new.unit_id is null then
    return new;
  end if;

  if exists (select 1 from public.bodega_order_item_units where id = new.id) then
    return new;
  end if;

  select status, serial into v_estado, v_serial
    from public.bodega_units
   where id = new.unit_id
     for update;
  if not found then
    raise exception 'BODEGA_UNIDAD_NO_DISPONIBLE:%', new.unit_id;
  end if;

  select o.status into v_estado_pedido
    from public.bodega_order_items oi
    join public.bodega_orders o on o.id = oi.order_id
   where oi.id = new.order_item_id;

  -- En un pedido en preparación solo entra lo que está en bodega; a un pedido ya
  -- despachado (edición de un administrador) también puede entrar lo del local.
  if v_estado_pedido = 'en_preparacion' and v_estado <> 'en_bodega' then
    raise exception 'BODEGA_UNIDAD_NO_DISPONIBLE:%', v_serial;
  elsif v_estado_pedido = 'despachado' and v_estado not in ('en_bodega', 'en_local') then
    raise exception 'BODEGA_UNIDAD_NO_DISPONIBLE:%', v_serial;
  end if;

  if v_estado_pedido in ('en_preparacion', 'despachado') and exists (
    select 1
      from public.bodega_order_item_units x
      join public.bodega_order_items xi on xi.id = x.order_item_id
      join public.bodega_orders xo on xo.id = xi.order_id
     where x.unit_id = new.unit_id
       and x.id <> new.id
       and xo.status = 'en_preparacion'
  ) then
    raise exception 'BODEGA_UNIDAD_YA_ASIGNADA:%', v_serial;
  end if;

  return new;
end;
$$;

drop trigger if exists bodega_order_item_units_validar on public.bodega_order_item_units;
create trigger bodega_order_item_units_validar
  before insert on public.bodega_order_item_units
  for each row execute function public.bodega_validar_asignacion_unidad();
