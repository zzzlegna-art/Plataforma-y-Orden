-- Permite guardar los tipos de producto a través de la ruta atómica protegida.
-- La tabla ya existe; esto solo sincroniza las listas de tablas autorizadas.
CREATE OR REPLACE FUNCTION public.bodega_aplicar_cambios(p_cambios jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  -- Lista cerrada: nunca se escribe en una tabla que no esté aquí.
  c_tablas CONSTANT text[] := ARRAY[
    'bodega_categories', 'bodega_product_types', 'bodega_brands', 'bodega_products', 'bodega_customers',
    'bodega_orders', 'bodega_order_items', 'bodega_order_item_units',
    'bodega_receptions', 'bodega_reception_items', 'bodega_units', 'bodega_movements',
    'bodega_technicians', 'bodega_warranties', 'bodega_warranty_events',
    'bodega_previous_serials', 'bodega_profiles', 'bodega_audit_logs', 'bodega_settings'
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
BEGIN
  IF p_cambios IS NULL
     OR jsonb_typeof(p_cambios) <> 'object'
     OR jsonb_typeof(p_cambios -> 'pasos') <> 'array' THEN
    RAISE EXCEPTION 'BODEGA_CAMBIOS_INVALIDOS';
  END IF;

  IF coalesce(p_cambios ->> 'version', '') <> '1' THEN
    RAISE EXCEPTION 'BODEGA_CAMBIOS_VERSION:%', coalesce(p_cambios ->> 'version', '');
  END IF;

  FOR v_paso IN SELECT * FROM jsonb_array_elements(p_cambios -> 'pasos') LOOP
    v_op := v_paso ->> 'op';
    v_tabla := v_paso ->> 'tabla';

    IF v_tabla IS NULL OR NOT (v_tabla = ANY (c_tablas)) THEN
      RAISE EXCEPTION 'BODEGA_TABLA_NO_PERMITIDA:%', coalesce(v_tabla, '');
    END IF;

    IF v_op = 'upsert' THEN
      v_filas := v_paso -> 'filas';
      IF jsonb_typeof(v_filas) <> 'array' THEN
        RAISE EXCEPTION 'BODEGA_CAMBIOS_INVALIDOS';
      END IF;
      IF jsonb_array_length(v_filas) = 0 THEN
        CONTINUE;
      END IF;

      SELECT array_agg(DISTINCT k ORDER BY k) INTO v_cols
        FROM jsonb_array_elements(v_filas) r, jsonb_object_keys(r) k;

      IF v_cols IS NULL OR NOT ('id' = ANY (v_cols)) THEN
        RAISE EXCEPTION 'BODEGA_COLUMNA_NO_PERMITIDA:id';
      END IF;

      IF EXISTS (
        SELECT 1 FROM unnest(v_cols) c
        WHERE NOT EXISTS (
          SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = ('public.' || quote_ident(v_tabla))::regclass
            AND a.attnum > 0 AND NOT a.attisdropped AND a.attname = c
        )
      ) THEN
        RAISE EXCEPTION 'BODEGA_COLUMNA_NO_PERMITIDA:%', v_tabla;
      END IF;

      SELECT string_agg(format('%I', c), ', ' ORDER BY c) INTO v_cols_sql FROM unnest(v_cols) c;
      SELECT string_agg(format('%I = excluded.%I', c, c), ', ' ORDER BY c) INTO v_set_sql
        FROM unnest(v_cols) c WHERE c <> 'id';

      IF coalesce((v_paso ->> 'solo_alta')::boolean, false) OR v_set_sql IS NULL THEN
        BEGIN
          EXECUTE format(
            'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
            v_tabla, v_cols_sql, v_cols_sql, v_tabla
          ) USING v_filas;
          GET DIAGNOSTICS v_n = ROW_COUNT;
        EXCEPTION WHEN unique_violation THEN
          v_n := 0;
        END;
      ELSE
        EXECUTE format(
          'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) '
          || 'on conflict (id) do update set %s',
          v_tabla, v_cols_sql, v_cols_sql, v_tabla, v_set_sql
        ) USING v_filas;
        GET DIAGNOSTICS v_n = ROW_COUNT;
      END IF;

      v_filas_total := v_filas_total + v_n;

    ELSIF v_op = 'borrar' THEN
      v_ids := v_paso -> 'ids';
      IF jsonb_typeof(v_ids) <> 'array' THEN
        RAISE EXCEPTION 'BODEGA_CAMBIOS_INVALIDOS';
      END IF;
      IF jsonb_array_length(v_ids) = 0 THEN
        CONTINUE;
      END IF;

      EXECUTE format(
        'delete from public.%I where id = any (select (jsonb_array_elements_text($1))::uuid)',
        v_tabla
      ) USING v_ids;

      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_filas_total := v_filas_total + v_n;
    ELSE
      RAISE EXCEPTION 'BODEGA_OPERACION_NO_PERMITIDA:%', coalesce(v_op, '');
    END IF;

    v_pasos := v_pasos + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'pasos', v_pasos, 'filas', v_filas_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.nexora_guardar_con_version(p_cambios jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  paso jsonb;
  anterior jsonb;
  actual jsonb;
  normalizado jsonb;
  tabla text;
  nuevo text;
BEGIN
  IF p_cambios IS NULL OR jsonb_typeof(p_cambios -> 'pasos') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'BODEGA_CAMBIOS_INVALIDOS';
  END IF;

  PERFORM pg_advisory_xact_lock(78192346);

  FOR paso IN SELECT value FROM jsonb_array_elements(p_cambios -> 'pasos') LOOP
    tabla := paso ->> 'tabla';
    IF tabla NOT IN (
      'bodega_units', 'bodega_orders', 'bodega_order_items', 'bodega_warranties',
      'bodega_receptions', 'bodega_reception_items', 'bodega_products', 'bodega_customers',
      'bodega_order_item_units', 'bodega_categories', 'bodega_product_types', 'bodega_brands',
      'bodega_technicians', 'bodega_previous_serials', 'bodega_profiles', 'bodega_settings'
    ) THEN
      CONTINUE;
    END IF;

    IF paso ? 'esperados' AND jsonb_typeof(paso -> 'esperados') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'BODEGA_CAMBIOS_INVALIDOS';
    END IF;
    IF paso ? 'nuevos' AND jsonb_typeof(paso -> 'nuevos') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'BODEGA_CAMBIOS_INVALIDOS';
    END IF;

    FOR anterior IN SELECT value FROM jsonb_array_elements(coalesce(paso -> 'esperados', '[]'::jsonb)) LOOP
      IF anterior ->> 'id' IS NULL THEN
        RAISE EXCEPTION 'BODEGA_CAMBIOS_INVALIDOS';
      END IF;
      EXECUTE format('select to_jsonb(t) from public.%I t where id::text = $1', tabla)
        INTO actual USING anterior ->> 'id';
      EXECUTE format('select to_jsonb(jsonb_populate_record(null::public.%I, $1))', tabla)
        INTO normalizado USING anterior;
      IF actual IS NULL OR NOT actual @> (
        SELECT jsonb_object_agg(k, normalizado -> k) FROM jsonb_object_keys(anterior) AS k
      ) THEN
        RAISE EXCEPTION 'BODEGA_CONFLICTO_CONCURRENCIA';
      END IF;
    END LOOP;

    FOR nuevo IN SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(paso -> 'nuevos', '[]'::jsonb)) LOOP
      EXECUTE format('select to_jsonb(t) from public.%I t where id::text = $1', tabla)
        INTO actual USING nuevo;
      IF actual IS NOT NULL THEN
        RAISE EXCEPTION 'BODEGA_CONFLICTO_CONCURRENCIA';
      END IF;
    END LOOP;
  END LOOP;

  RETURN public.bodega_aplicar_cambios(p_cambios);
END;
$function$;
