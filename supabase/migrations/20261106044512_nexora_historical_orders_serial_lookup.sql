-- Amplía la consulta existente; no crea tablas ni modifica datos operativos.
-- Conserva las comprobaciones de perfil activo y rol del historial protegido.
CREATE OR REPLACE FUNCTION public.nexora_historical_orders_list(p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_run_id uuid;
  v_complete boolean := false;
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.bodega_profiles p
    WHERE p.id = auth.uid()
      AND p.is_active
      AND p.role IN ('admin', 'bodeguero')
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar el historial de pedidos.'
      USING ERRCODE = '42501';
  END IF;

  IF char_length(v_search) > 120 OR char_length(coalesce(v_status, '')) > 40 THEN
    RAISE EXCEPTION 'Los filtros del historial exceden el limite permitido.'
      USING ERRCODE = '22023';
  END IF;

  SELECT r.run_id,
    (r.counts ->> 'status' = 'COMPLETE_ALL_ORDERS')
    AND (SELECT count(*) FROM nexora_archive.orders WHERE source_ref = 'kiizldurgjtorxpzebpm') = 119
    AND (SELECT count(*) FROM nexora_archive.order_items WHERE source_ref = 'kiizldurgjtorxpzebpm') = 425
    AND (SELECT count(*) FROM nexora_archive.order_serial_links WHERE source_ref = 'kiizldurgjtorxpzebpm') = 4486
  INTO v_run_id, v_complete
  FROM nexora_archive.import_runs r
  WHERE r.source_ref = 'kiizldurgjtorxpzebpm'
  ORDER BY r.imported_at DESC
  LIMIT 1;

  IF v_run_id IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'total', 0);
  END IF;

  WITH eligible AS (
    SELECT
      o.source_id,
      (v_search <> '' AND EXISTS (
        SELECT 1 FROM nexora_archive.order_serial_links sl
        JOIN nexora_archive.order_items si
          ON si.source_ref = sl.source_ref AND si.source_id = sl.source_order_item_id
        WHERE sl.source_ref = o.source_ref
          AND si.source_order_id = o.source_id
          AND lower(btrim(sl.serial)) = v_search
      )) AS matched_serial,
      o.code,
      o.status,
      o.order_date,
      o.total,
      coalesce(nullif(btrim(c.snapshot ->> 'name'), ''), 'Cliente historico') AS customer_name,
      (
        SELECT count(*)::integer
        FROM nexora_archive.order_items i
        WHERE i.source_ref = o.source_ref
          AND i.source_order_id = o.source_id
      ) AS line_count,
      (
        SELECT coalesce(sum(coalesce(nullif(i.snapshot ->> 'quantity', '')::numeric, 0)), 0)
        FROM nexora_archive.order_items i
        WHERE i.source_ref = o.source_ref
          AND i.source_order_id = o.source_id
      ) AS requested_units,
      (
        SELECT coalesce(sum(
          CASE WHEN p.snapshot ->> 'categoria' = 'repuesto' THEN
            coalesce(nullif(i.snapshot ->> 'quantity', '')::numeric, 0)
          ELSE (
            SELECT count(*)::numeric FROM nexora_archive.order_serial_links l
            JOIN nexora_archive.units u
              ON u.source_ref = l.source_ref AND u.source_id = l.source_unit_id
            WHERE l.source_ref = i.source_ref
              AND l.source_order_item_id = i.source_id
              AND nullif(btrim(l.serial), '') IS NOT NULL
              AND lower(btrim(u.serial)) = lower(btrim(l.serial))
          )
          END), 0)
        FROM nexora_archive.order_items i
        LEFT JOIN nexora_archive.products p
          ON p.source_ref = i.source_ref AND p.source_id = i.source_product_id
        WHERE i.source_ref = o.source_ref AND i.source_order_id = o.source_id
      ) AS assigned_units,
      (
        SELECT count(*)::integer
        FROM nexora_archive.order_items i
        JOIN nexora_archive.order_serial_links l
          ON l.source_ref = i.source_ref
         AND l.source_order_item_id = i.source_id
        JOIN nexora_archive.units u
          ON u.source_ref = l.source_ref
         AND u.source_id = l.source_unit_id
        WHERE i.source_ref = o.source_ref
          AND i.source_order_id = o.source_id
          AND nullif(btrim(l.serial), '') IS NOT NULL
          AND lower(btrim(u.serial)) = lower(btrim(l.serial))
      ) AS serial_count
    FROM nexora_archive.orders o
    LEFT JOIN nexora_archive.customers c
      ON c.source_ref = o.source_ref
     AND c.source_id = o.source_customer_id
    WHERE o.source_ref = 'kiizldurgjtorxpzebpm'
      AND (v_complete OR NOT EXISTS (
        SELECT 1
        FROM nexora_archive.migration_issues mi
        WHERE mi.run_id = v_run_id
          AND mi.dataset = 'orders'
          AND mi.source_id = o.source_id
          AND mi.reason = 'PENDING_SERIAL_CONFLICT_COMPONENT'
      ))
      AND (v_complete OR EXISTS (
        SELECT 1
        FROM nexora_archive.order_items i
        JOIN nexora_archive.order_serial_links l
          ON l.source_ref = i.source_ref
         AND l.source_order_item_id = i.source_id
        JOIN nexora_archive.units u
          ON u.source_ref = l.source_ref
         AND u.source_id = l.source_unit_id
        WHERE i.source_ref = o.source_ref
          AND i.source_order_id = o.source_id
          AND nullif(btrim(l.serial), '') IS NOT NULL
          AND lower(btrim(u.serial)) = lower(btrim(l.serial))
      ))
      AND (
        v_search = ''
        OR EXISTS (
        SELECT 1 FROM nexora_archive.order_serial_links sl
        JOIN nexora_archive.order_items si
          ON si.source_ref = sl.source_ref AND si.source_id = sl.source_order_item_id
        WHERE sl.source_ref = o.source_ref
          AND si.source_order_id = o.source_id
          AND lower(btrim(sl.serial)) = v_search
      )
        OR strpos(lower(o.code), v_search) > 0
        OR strpos(
          lower(coalesce(nullif(btrim(c.snapshot ->> 'name'), ''), 'Cliente historico')),
          v_search
        ) > 0
      )
      AND (v_status IS NULL OR o.status = v_status)
  )
  SELECT jsonb_build_object(
    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'sourceId', source_id,
          'matchedSerial', matched_serial,
          'code', code,
          'status', status,
          'orderDate', order_date,
          'total', total,
          'customerName', customer_name,
          'lineCount', line_count,
          'requestedUnits', requested_units,
          'assignedUnits', assigned_units,
          'serialCount', serial_count
        )
        ORDER BY order_date DESC, code DESC
      ),
      '[]'::jsonb
    ),
    'total',
    count(*)
  )
  INTO v_result
  FROM eligible;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.nexora_historical_orders_list(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexora_historical_orders_list(text,text) TO authenticated,service_role;
COMMENT ON FUNCTION public.nexora_historical_orders_list(text,text) IS
'Listado cronológico de pedidos históricos de solo lectura, con coincidencia exacta de serial para su hoja de vida. No modifica inventario.';

NOTIFY pgrst, 'reload schema';
