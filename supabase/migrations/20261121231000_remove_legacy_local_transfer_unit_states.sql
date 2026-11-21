-- NEXORA opera únicamente desde Bodega 6A.
-- No hay unidades activas en los estados en_local ni en_transito.
-- Se conserva vendido como estado histórico y de origen para garantías.
do $$
begin
  if exists (
    select 1 from public.bodega_units
    where status in ('en_local', 'en_transito')
  ) then
    raise exception 'No se pueden retirar estados antiguos: existen unidades que requieren revisión.';
  end if;
end
$$;

alter table public.bodega_units
  drop constraint if exists bodega_units_status_check;

alter table public.bodega_units
  add constraint bodega_units_status_check
  check (status = any (array[
    'en_bodega',
    'vendido',
    'en_reparacion',
    'defectuoso',
    'entregado_garantia',
    'liberado'
  ]::text[]));

create or replace function public.bodega_validar_asignacion_unidad()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
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

  -- Todos los Pedidos operativos se abastecen desde Bodega 6A.
  if v_estado_pedido in ('en_preparacion', 'despachado')
    and v_estado <> 'en_bodega' then
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
$function$;
