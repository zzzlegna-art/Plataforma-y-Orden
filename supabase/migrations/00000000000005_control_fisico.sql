-- ============================================================
-- Nexora (migración histórica) :: control físico de seriales
--
-- Permite contar físicamente los equipos de un producto y marcar, uno por uno, los que se
-- tienen en la mano (con lector de código de barras, con la cámara del celular o a mano).
--
-- Cómo funciona:
--   * Un "control" se inicia por producto: bodega_products.control_started_at guarda cuándo.
--   * Una unidad cuenta como verificada en el control en curso si su checked_at es igual o
--     posterior a ese momento. Iniciar o cerrar un control NO modifica ninguna unidad.
--   * Las marcas se guardan con funciones propias que SOLO tocan las columnas del control y
--     usan la hora del servidor. Así, un teléfono con datos viejos no puede deshacer una
--     venta al escanear (las escrituras normales suben la fila completa de la unidad).
--
-- Es aditiva: solo agrega columnas opcionales y funciones. No cambia datos existentes y la
-- app anterior sigue funcionando igual. Idempotente.
-- ============================================================

alter table public.bodega_units add column if not exists checked_at timestamptz;
alter table public.bodega_units add column if not exists checked_by uuid;
alter table public.bodega_products add column if not exists control_started_at timestamptz;
alter table public.bodega_products add column if not exists control_started_by uuid;

-- ------------------------------------------------------------
-- 1) Iniciar (o reiniciar) el control de un producto.
-- ------------------------------------------------------------
create or replace function public.bodega_control_iniciar(p_product_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_producto public.bodega_products;
begin
  update public.bodega_products
     set control_started_at = now(), control_started_by = auth.uid()
   where id = p_product_id
  returning * into v_producto;

  if not found then
    raise exception 'BODEGA_CONTROL_PRODUCTO_NO_EXISTE';
  end if;

  insert into public.bodega_audit_logs (user_id, user_email, action, entity, entity_id, details)
  values (auth.uid(), (select email from public.bodega_profiles where id = auth.uid()),
          'update', 'product', p_product_id, 'Control físico iniciado: ' || v_producto.name);

  return to_jsonb(v_producto);
end;
$$;

-- ------------------------------------------------------------
-- 2) Marcar como verificado el equipo con ese serial/IMEI (lo que se escanea).
--    La decisión se toma con los datos del servidor, no con lo que ve el dispositivo.
--    Resultados:
--      verificada       está en bodega y quedó marcada
--      fuera_de_estado  es de este producto pero el sistema dice que NO está en bodega
--                       (por ejemplo vendido): se marca igual para que la diferencia se vea
--      ya_verificada    ya estaba marcada en este control
--      otro_producto    el serial existe, pero es de otro producto (no se marca)
--      liberada         solo existe como unidad liberada (fuera del sistema)
--      no_existe        ese serial no está registrado
--    Si dos personas escanean lo mismo a la vez, solo una obtiene "verificada".
-- ------------------------------------------------------------
create or replace function public.bodega_control_marcar_serial(p_product_id uuid, p_serial text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_inicio timestamptz;
  v_serial text := lower(btrim(coalesce(p_serial, '')));
  v_unidad public.bodega_units;
  v_otro text;
begin
  select control_started_at into v_inicio from public.bodega_products where id = p_product_id;
  if not found then
    raise exception 'BODEGA_CONTROL_PRODUCTO_NO_EXISTE';
  end if;
  if v_inicio is null then
    raise exception 'BODEGA_CONTROL_NO_ACTIVO';
  end if;

  select * into v_unidad
    from public.bodega_units
   where lower(btrim(serial)) = v_serial and status <> 'liberado'
     for update;

  if not found then
    if exists (select 1 from public.bodega_units where lower(btrim(serial)) = v_serial) then
      return jsonb_build_object('resultado', 'liberada', 'serial', btrim(p_serial));
    end if;
    return jsonb_build_object('resultado', 'no_existe', 'serial', btrim(p_serial));
  end if;

  if v_unidad.product_id is distinct from p_product_id then
    select name into v_otro from public.bodega_products where id = v_unidad.product_id;
    return jsonb_build_object('resultado', 'otro_producto', 'serial', v_unidad.serial,
                              'producto', coalesce(v_otro, ''));
  end if;

  if v_unidad.checked_at is not null and v_unidad.checked_at >= v_inicio then
    return jsonb_build_object('resultado', 'ya_verificada', 'unidad', to_jsonb(v_unidad));
  end if;

  update public.bodega_units
     set checked_at = now(), checked_by = auth.uid()
   where id = v_unidad.id
  returning * into v_unidad;

  return jsonb_build_object(
    'resultado', case when v_unidad.status = 'en_bodega' then 'verificada' else 'fuera_de_estado' end,
    'unidad', to_jsonb(v_unidad));
end;
$$;

-- ------------------------------------------------------------
-- 3) Marcar o desmarcar a mano una unidad de la lista.
-- ------------------------------------------------------------
create or replace function public.bodega_control_marcar_unidad(p_unit_id uuid, p_verificada boolean)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_unidad public.bodega_units;
  v_inicio timestamptz;
begin
  select * into v_unidad from public.bodega_units where id = p_unit_id for update;
  if not found then
    raise exception 'BODEGA_CONTROL_UNIDAD_NO_EXISTE';
  end if;

  if p_verificada then
    select control_started_at into v_inicio from public.bodega_products where id = v_unidad.product_id;
    if v_inicio is null then
      raise exception 'BODEGA_CONTROL_NO_ACTIVO';
    end if;
    update public.bodega_units
       set checked_at = now(), checked_by = auth.uid()
     where id = p_unit_id
    returning * into v_unidad;
  else
    update public.bodega_units
       set checked_at = null, checked_by = null
     where id = p_unit_id
    returning * into v_unidad;
  end if;

  return to_jsonb(v_unidad);
end;
$$;

-- ------------------------------------------------------------
-- 4) Cerrar el control y dejar el resumen en la auditoría. No cambia el estado de ninguna
--    unidad: los faltantes solo se informan.
-- ------------------------------------------------------------
create or replace function public.bodega_control_finalizar(p_product_id uuid, p_resumen text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_producto public.bodega_products;
begin
  update public.bodega_products
     set control_started_at = null, control_started_by = null
   where id = p_product_id and control_started_at is not null
  returning * into v_producto;

  if not found then
    raise exception 'BODEGA_CONTROL_NO_ACTIVO';
  end if;

  insert into public.bodega_audit_logs (user_id, user_email, action, entity, entity_id, details)
  values (auth.uid(), (select email from public.bodega_profiles where id = auth.uid()),
          'confirm', 'product', p_product_id,
          left('Control físico finalizado: ' || coalesce(nullif(btrim(p_resumen), ''), v_producto.name), 2000));

  return to_jsonb(v_producto);
end;
$$;

-- Solo usuarios con sesión (igual que el resto de la app).
revoke all on function public.bodega_control_iniciar(uuid) from public, anon;
revoke all on function public.bodega_control_marcar_serial(uuid, text) from public, anon;
revoke all on function public.bodega_control_marcar_unidad(uuid, boolean) from public, anon;
revoke all on function public.bodega_control_finalizar(uuid, text) from public, anon;
grant execute on function public.bodega_control_iniciar(uuid) to authenticated;
grant execute on function public.bodega_control_marcar_serial(uuid, text) to authenticated;
grant execute on function public.bodega_control_marcar_unidad(uuid, boolean) to authenticated;
grant execute on function public.bodega_control_finalizar(uuid, text) to authenticated;
