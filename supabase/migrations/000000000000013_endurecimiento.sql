-- ============================================================
-- Nexora :: endurecimiento (integridad + permisos)
--
-- REVISAR ANTES DE APLICAR. Antes de correrla en producción:
--   1) Haz un respaldo (Supabase → Database → Backups).
--   2) Verifica que no haya duplicados (las consultas están en el PR).
-- Verificado el 2026-09-21 en producción: 0 seriales activos duplicados
-- y 0 códigos duplicados de pedidos, recepciones y garantías.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Un serial activo solo puede existir una vez.
--    Ignora mayúsculas y espacios. Las unidades 'liberado' quedan fuera:
--    su serial puede volver a entrar (se reactiva la misma unidad).
-- ------------------------------------------------------------
create unique index if not exists bodega_units_serial_activo_uniq
  on public.bodega_units (lower(btrim(serial)))
  where status <> 'liberado';

-- ------------------------------------------------------------
-- 2) Códigos únicos (PED / REC / GAR). Hoy los calcula el navegador, así que dos
--    dispositivos a la vez podían generar el mismo. Con el índice, el segundo
--    guardado falla ("No se pudieron guardar los cambios") en vez de duplicar.
--    Sustituyen a los índices comunes sobre la misma columna.
-- ------------------------------------------------------------
create unique index if not exists bodega_orders_code_uniq on public.bodega_orders (code);
create unique index if not exists bodega_receptions_code_uniq on public.bodega_receptions (code);
create unique index if not exists bodega_warranties_code_uniq on public.bodega_warranties (code);

drop index if exists public.bodega_orders_code_idx;
drop index if exists public.bodega_receptions_code_idx;
drop index if exists public.bodega_warranties_code_idx;

-- ------------------------------------------------------------
-- 3) Movimientos: solo lectura e inserción. La app nunca los edita ni los borra
--    (se guardan con "solo alta"), y son el rastro de auditoría del inventario.
-- ------------------------------------------------------------
drop policy if exists bodega_movements_all on public.bodega_movements;
drop policy if exists bodega_movements_read on public.bodega_movements;
drop policy if exists bodega_movements_insert on public.bodega_movements;

create policy bodega_movements_read on public.bodega_movements
  for select to authenticated
  using (public.bodega_is_staff());

create policy bodega_movements_insert on public.bodega_movements
  for insert to authenticated
  with check (public.bodega_is_staff());

-- ------------------------------------------------------------
-- 4) Permisos: el rol anónimo no necesita tocar ninguna tabla. La app solo opera
--    con sesión iniciada; el login usa el endpoint de Auth, no las tablas.
-- ------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- ------------------------------------------------------------
-- 5) Funciones SECURITY DEFINER: no exponerlas por RPC a usuarios anónimos.
--    is_staff / is_admin las usan las políticas RLS, así que 'authenticated'
--    conserva EXECUTE de forma explícita. handle_new_user es solo del trigger.
-- ------------------------------------------------------------
revoke execute on function public.bodega_is_admin() from public, anon;
revoke execute on function public.bodega_is_staff() from public, anon;
grant execute on function public.bodega_is_admin() to authenticated;
grant execute on function public.bodega_is_staff() to authenticated;

revoke execute on function public.bodega_handle_new_user() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 6) Índices en claves foráneas (mejoran joins y borrados en cascada).
-- ------------------------------------------------------------
create index if not exists bodega_order_items_product_idx on public.bodega_order_items (product_id);
create index if not exists bodega_products_brand_idx on public.bodega_products (brand_id);
create index if not exists bodega_products_category_idx on public.bodega_products (category_id);
create index if not exists bodega_reception_items_product_idx on public.bodega_reception_items (product_id);
create index if not exists bodega_units_reception_idx on public.bodega_units (reception_id);
create index if not exists bodega_warranties_customer_idx on public.bodega_warranties (customer_id);
create index if not exists bodega_warranties_order_idx on public.bodega_warranties (order_id);
create index if not exists bodega_warranties_product_idx on public.bodega_warranties (product_id);
create index if not exists bodega_warranties_tecnico_idx on public.bodega_warranties (tecnico_id);

-- ------------------------------------------------------------
-- 7) Trigger que marca como 'vendido' las unidades de un pedido al despacharlo.
--    YA EXISTE en producción (migración 20260920065854, aplicada fuera de este repo);
--    se incluye aquí, con el mismo comportamiento, para que las instalaciones nuevas
--    lo tengan. Se le fija search_path (aviso del linter de Supabase).
--    OJO: al pasar un pedido a 'despachado' deja 'vendido' TODAS sus unidades, sea cual
--    sea su estado actual. La app ya exige que estén en_bodega antes de despachar.
-- ------------------------------------------------------------
create or replace function public.bodega_sincronizar_unidades_despacho()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'despachado' and (old is null or old.status is distinct from new.status) then
    update public.bodega_units u
       set status = 'vendido'
      from public.bodega_order_item_units oiu
      join public.bodega_order_items oi on oi.id = oiu.order_item_id
     where oiu.unit_id = u.id
       and oi.order_id = new.id
       and u.status <> 'vendido';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bodega_sincronizar_unidades_despacho on public.bodega_orders;
create trigger trg_bodega_sincronizar_unidades_despacho
  after insert or update of status on public.bodega_orders
  for each row execute function public.bodega_sincronizar_unidades_despacho();
