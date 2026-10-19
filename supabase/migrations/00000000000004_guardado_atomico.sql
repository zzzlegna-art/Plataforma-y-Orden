-- ============================================================
-- Nexora :: guardado atómico (una sola transacción por operación)
--
-- Hoy la app guarda tabla por tabla, cada una en una llamada distinta. Si algo falla a
-- la mitad (corte de red, un rechazo de la base), queda un estado a medias: por ejemplo
-- una recepción "confirmada" sin sus unidades. Esta función recibe TODOS los cambios de
-- una operación en una sola llamada y los aplica juntos: o se guarda todo o no se guarda
-- nada.
--
-- Qué NO cambia:
--   * Las reglas de negocio siguen en la app; esto solo cambia cómo viaja lo que guarda.
--   * Los permisos por rol (RLS) son los mismos: la función corre con los permisos de
--     quien la llama (SECURITY INVOKER), igual que las llamadas por tabla de hoy.
--   * Los triggers (códigos, IMEI, despacho) se ejecutan igual, dentro de la transacción.
--
-- Compatibilidad: la app usa esta función si existe y, si no, guarda como hasta ahora.
-- Para APAGARLA sin reconstruir nada (la app vuelve sola al modo anterior):
--     alter function public.nexora_aplicar_cambios(jsonb) rename to nexora_aplicar_cambios_off;
-- Para volver a encenderla:
--     alter function public.nexora_aplicar_cambios_off(jsonb) rename to nexora_aplicar_cambios;
--
-- Formato de p_cambios:
--   { "version": 1,
--     "pasos": [ { "op": "upsert", "tabla": "nexora_units", "solo_alta": false, "filas": [ {...} ] },
--                { "op": "borrar", "tabla": "nexora_order_item_units", "ids": ["uuid", ...] } ] }
-- Los pasos se aplican en el orden recibido (la app respeta las referencias entre tablas).
-- Los errores de formato empiezan con NEXORA_CAMBIOS_ / NEXORA_TABLA_ / NEXORA_COLUMNA_ /
-- NEXORA_OPERACION_ (la app entonces vuelve al guardado por tablas).
-- ============================================================

create or replace function public.nexora_aplicar_cambios(p_cambios jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  -- Lista cerrada: nunca se escribe en una tabla que no esté aquí.
  c_tablas constant text[] := array[
    'nexora_categories', 'nexora_brands', 'nexora_products', 'nexora_customers',
    'nexora_orders', 'nexora_order_items', 'nexora_order_item_units',
    'nexora_receptions', 'nexora_reception_items', 'nexora_units', 'nexora_movements',
    'nexora_technicians', 'nexora_warranties', 'nexora_warranty_events',
    'nexora_previous_serials', 'nexora_profiles', 'nexora_audit_logs', 'nexora_settings'
  ];
  v_paso jsonb;
  v_op text;
  v_tabla text;
  v_filas jsonb;
  v_ids jsonb;
  v_cols text[];
  v_cols_sql text;
  v_set_sql text;
  v_n bigint;
  v_pasos integer := 0;
  v_filas_total bigint := 0;
begin
  if p_cambios is null
     or jsonb_typeof(p_cambios) <> 'object'
     or jsonb_typeof(p_cambios -> 'pasos') <> 'array' then
    raise exception 'NEXORA_CAMBIOS_INVALIDOS';
  end if;

  if coalesce(p_cambios ->> 'version', '') <> '1' then
    raise exception 'NEXORA_CAMBIOS_VERSION:%', coalesce(p_cambios ->> 'version', '');
  end if;

  for v_paso in select * from jsonb_array_elements(p_cambios -> 'pasos') loop
    v_op := v_paso ->> 'op';
    v_tabla := v_paso ->> 'tabla';

    if v_tabla is null or not (v_tabla = any (c_tablas)) then
      raise exception 'NEXORA_TABLA_NO_PERMITIDA:%', coalesce(v_tabla, '');
    end if;

    if v_op = 'upsert' then
      v_filas := v_paso -> 'filas';
      if jsonb_typeof(v_filas) <> 'array' then
        raise exception 'NEXORA_CAMBIOS_INVALIDOS';
      end if;
      if jsonb_array_length(v_filas) = 0 then
        continue;
      end if;

      -- Columnas = todas las claves presentes en las filas (igual que un upsert por
      -- tabla: lo que no se envía conserva su valor o su valor por defecto).
      select array_agg(distinct k order by k) into v_cols
        from jsonb_array_elements(v_filas) r, jsonb_object_keys(r) k;

      if v_cols is null or not ('id' = any (v_cols)) then
        raise exception 'NEXORA_COLUMNA_NO_PERMITIDA:id';
      end if;

      -- Cada columna debe existir de verdad en la tabla (evita cualquier inyección).
      if exists (
        select 1 from unnest(v_cols) c
         where not exists (
           select 1 from pg_attribute a
            where a.attrelid = ('public.' || quote_ident(v_tabla))::regclass
              and a.attnum > 0 and not a.attisdropped and a.attname = c
         )
      ) then
        raise exception 'NEXORA_COLUMNA_NO_PERMITIDA:%', v_tabla;
      end if;

      select string_agg(format('%I', c), ', ' order by c) into v_cols_sql from unnest(v_cols) c;
      select string_agg(format('%I = excluded.%I', c, c), ', ' order by c) into v_set_sql
        from unnest(v_cols) c where c <> 'id';

      if coalesce((v_paso ->> 'solo_alta')::boolean, false) or v_set_sql is null then
        -- Bitácoras (solo se agregan). Se usa un INSERT simple y NO "on conflict": con
        -- "on conflict" la base exige además permiso de LECTURA sobre la tabla, y un
        -- bodeguero no puede leer la auditoría (solo el administrador). Si las filas ya
        -- existen (reintento tras un corte de red) se ignora el paso, como hace hoy el
        -- guardado por tablas.
        begin
          execute format(
            'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
            v_tabla, v_cols_sql, v_cols_sql, v_tabla
          ) using v_filas;
          get diagnostics v_n = row_count;
        exception when unique_violation then
          v_n := 0;
        end;
      else
        execute format(
          'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) '
          || 'on conflict (id) do update set %s',
          v_tabla, v_cols_sql, v_cols_sql, v_tabla, v_set_sql
        ) using v_filas;
        get diagnostics v_n = row_count;
      end if;

      v_filas_total := v_filas_total + v_n;

    elsif v_op = 'borrar' then
      v_ids := v_paso -> 'ids';
      if jsonb_typeof(v_ids) <> 'array' then
        raise exception 'NEXORA_CAMBIOS_INVALIDOS';
      end if;
      if jsonb_array_length(v_ids) = 0 then
        continue;
      end if;

      execute format(
        'delete from public.%I where id = any (select (jsonb_array_elements_text($1))::uuid)',
        v_tabla
      ) using v_ids;

      get diagnostics v_n = row_count;
      v_filas_total := v_filas_total + v_n;

    else
      raise exception 'NEXORA_OPERACION_NO_PERMITIDA:%', coalesce(v_op, '');
    end if;

    v_pasos := v_pasos + 1;
  end loop;

  return jsonb_build_object('ok', true, 'pasos', v_pasos, 'filas', v_filas_total);
end;
$$;

-- Solo usuarios con sesión (igual que el resto de la app).
revoke all on function public.nexora_aplicar_cambios(jsonb) from public, anon;
grant execute on function public.nexora_aplicar_cambios(jsonb) to authenticated;
