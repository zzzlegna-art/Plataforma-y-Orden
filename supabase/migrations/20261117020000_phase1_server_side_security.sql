-- NEXORA Phase 1: server-side role boundaries and operational invariants.
-- No data is rewritten by this migration. It adds guards to existing write paths.

CREATE OR REPLACE FUNCTION public.nexora_dashboard_order_rankings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'nexora_archive'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bodega_is_staff() THEN
    RAISE EXCEPTION 'No tienes permiso para consultar los rankings del panel.'
      USING ERRCODE = '42501';
  END IF;

  WITH order_sources AS (
    SELECT
      'operativo'::text AS source,
      'operativo:' || o.id::text AS order_key,
      o.id::text AS source_order_id,
      o.status,
      nullif(btrim(c.name), '') AS customer_name,
      CASE
        WHEN nullif(btrim(c.name), '') IS NULL THEN 'sin-cliente:operativo:' || o.id::text
        ELSE regexp_replace(lower(btrim(c.name)), '[[:space:]]+', ' ', 'g')
      END AS customer_key,
      1 AS source_priority
    FROM public.bodega_orders o
    LEFT JOIN public.bodega_customers c ON c.id = o.customer_id

    UNION ALL

    SELECT
      'historico'::text,
      'historico:' || o.source_id::text,
      o.source_id::text,
      o.status,
      nullif(btrim(c.snapshot ->> 'name'), ''),
      CASE
        WHEN nullif(btrim(c.snapshot ->> 'name'), '') IS NULL THEN 'sin-cliente:historico:' || o.source_id::text
        ELSE regexp_replace(lower(btrim(c.snapshot ->> 'name')), '[[:space:]]+', ' ', 'g')
      END,
      2
    FROM nexora_archive.orders o
    LEFT JOIN nexora_archive.customers c
      ON c.source_ref = o.source_ref
     AND c.source_id = o.source_customer_id
    WHERE o.source_ref = 'kiizldurgjtorxpzebpm'
  ),
  valid_orders AS (
    SELECT *
    FROM order_sources
    WHERE lower(btrim(coalesce(status, ''))) <> 'cancelado'
  ),
  product_lines AS (
    SELECT
      vo.order_key,
      p.name AS product_name,
      i.quantity::numeric AS quantity,
      regexp_replace(
        lower(regexp_replace(btrim(coalesce(p.name, '')), '^apple[[:space:]]+', '', 'i')),
        '[^[:alnum:]]',
        '',
        'g'
      ) AS product_key,
      vo.source_priority
    FROM valid_orders vo
    JOIN public.bodega_orders o
      ON vo.source = 'operativo'
     AND vo.source_order_id = o.id::text
    JOIN public.bodega_order_items i ON i.order_id = o.id
    JOIN public.bodega_products p ON p.id = i.product_id

    UNION ALL

    SELECT
      vo.order_key,
      p.snapshot ->> 'name',
      coalesce(nullif(i.snapshot ->> 'quantity', '')::numeric, 0),
      regexp_replace(
        lower(regexp_replace(btrim(coalesce(p.snapshot ->> 'name', '')), '^apple[[:space:]]+', '', 'i')),
        '[^[:alnum:]]',
        '',
        'g'
      ),
      vo.source_priority
    FROM valid_orders vo
    JOIN nexora_archive.orders o
      ON vo.source = 'historico'
     AND vo.source_order_id = o.source_id::text
     AND o.source_ref = 'kiizldurgjtorxpzebpm'
    JOIN nexora_archive.order_items i
      ON i.source_ref = o.source_ref
     AND i.source_order_id = o.source_id
    JOIN nexora_archive.products p
      ON p.source_ref = i.source_ref
     AND p.source_id = i.source_product_id
  ),
  product_aggregate AS (
    SELECT
      product_key,
      coalesce(
        min(product_name) FILTER (WHERE source_priority = 1),
        min(product_name) FILTER (WHERE source_priority = 2),
        'Producto sin nombre'
      ) AS product_name,
      sum(quantity) AS units,
      count(DISTINCT order_key)::integer AS orders_count
    FROM product_lines
    WHERE product_key <> ''
      AND quantity > 0
    GROUP BY product_key
  ),
  customer_order_lines AS (
    SELECT
      vo.order_key,
      vo.customer_key,
      vo.customer_name,
      vo.source_priority,
      sum(i.quantity)::numeric AS units
    FROM valid_orders vo
    JOIN public.bodega_orders o
      ON vo.source = 'operativo'
     AND vo.source_order_id = o.id::text
    JOIN public.bodega_order_items i ON i.order_id = o.id
    GROUP BY vo.order_key, vo.customer_key, vo.customer_name, vo.source_priority

    UNION ALL

    SELECT
      vo.order_key,
      vo.customer_key,
      vo.customer_name,
      vo.source_priority,
      sum(coalesce(nullif(i.snapshot ->> 'quantity', '')::numeric, 0))
    FROM valid_orders vo
    JOIN nexora_archive.orders o
      ON vo.source = 'historico'
     AND vo.source_order_id = o.source_id::text
     AND o.source_ref = 'kiizldurgjtorxpzebpm'
    JOIN nexora_archive.order_items i
      ON i.source_ref = o.source_ref
     AND i.source_order_id = o.source_id
    GROUP BY vo.order_key, vo.customer_key, vo.customer_name, vo.source_priority
  ),
  customer_aggregate AS (
    SELECT
      customer_key,
      coalesce(
        min(customer_name) FILTER (WHERE source_priority = 1),
        min(customer_name) FILTER (WHERE source_priority = 2),
        'Cliente sin nombre'
      ) AS customer_name,
      sum(units) AS units,
      count(DISTINCT order_key)::integer AS orders_count
    FROM customer_order_lines
    GROUP BY customer_key
  ),
  summary AS (
    SELECT
      count(*)::integer AS total_orders,
      count(*) FILTER (WHERE lower(btrim(coalesce(status, ''))) <> 'cancelado')::integer AS considered_orders,
      count(*) FILTER (WHERE lower(btrim(coalesce(status, ''))) = 'cancelado')::integer AS cancelled_orders,
      count(*) FILTER (WHERE source = 'operativo')::integer AS operational_orders,
      count(*) FILTER (WHERE source = 'historico')::integer AS historical_orders
    FROM order_sources
  )
  SELECT jsonb_build_object(
    'totalOrders', summary.total_orders,
    'consideredOrders', summary.considered_orders,
    'cancelledOrders', summary.cancelled_orders,
    'operationalOrders', summary.operational_orders,
    'historicalOrders', summary.historical_orders,
    'products',
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'key', ranked.product_key,
            'name', ranked.product_name,
            'value', ranked.units,
            'units', ranked.units,
            'ordersCount', ranked.orders_count
          )
          ORDER BY ranked.units DESC, ranked.orders_count DESC, ranked.product_name
        )
        FROM (
          SELECT *
          FROM product_aggregate
          ORDER BY units DESC, orders_count DESC, product_name
          LIMIT 5
        ) ranked
      ), '[]'::jsonb),
    'customers',
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'key', ranked.customer_key,
            'name', ranked.customer_name,
            'value', ranked.units,
            'units', ranked.units,
            'ordersCount', ranked.orders_count
          )
          ORDER BY ranked.units DESC, ranked.orders_count DESC, ranked.customer_name
        )
        FROM (
          SELECT *
          FROM customer_aggregate
          ORDER BY units DESC, orders_count DESC, customer_name
          LIMIT 5
        ) ranked
      ), '[]'::jsonb)
  )
  INTO v_result
  FROM summary;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.nexora_historical_order_detail(p_source_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_run_id uuid;
  v_complete boolean := false;
  v_order jsonb;
  v_customer jsonb;
  v_lines jsonb;
  v_movements jsonb;
  v_warranties jsonb;
  v_audit jsonb;
  v_related_audit jsonb;
  v_documents jsonb;
  v_related_unit_ids uuid[];
  v_related_serials text[];
  v_related_warranty_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.bodega_is_staff() THEN
    RAISE EXCEPTION 'No tienes permiso para consultar el historial de pedidos.'
      USING ERRCODE = '42501';
  END IF;

  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'Debes indicar un pedido historico.'
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
    RAISE EXCEPTION 'No existe una importacion historica disponible.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT o.snapshot, c.snapshot
  INTO v_order, v_customer
  FROM nexora_archive.orders o
  LEFT JOIN nexora_archive.customers c
    ON c.source_ref = o.source_ref
   AND c.source_id = o.source_customer_id
  WHERE o.source_ref = 'kiizldurgjtorxpzebpm'
    AND o.source_id = p_source_id
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
    ));

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'El pedido no existe en el historial verificado.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Identidades del archivo original: asociaciones, movimientos del pedido y
  -- cadenas de garantía/reemplazo. Nunca consulta unidades operativas.
  WITH RECURSIVE related_units(id) AS (
    (
      SELECT l.source_unit_id FROM nexora_archive.order_items i
      JOIN nexora_archive.order_serial_links l
        ON l.source_ref=i.source_ref AND l.source_order_item_id=i.source_id
      WHERE i.source_ref='kiizldurgjtorxpzebpm' AND i.source_order_id=p_source_id
      UNION
      SELECT m.source_unit_id FROM nexora_archive.serial_movements m
      WHERE m.source_ref='kiizldurgjtorxpzebpm' AND m.reference_type='pedido'
        AND m.reference_id=p_source_id AND m.source_unit_id IS NOT NULL
      UNION
      SELECT u.id FROM nexora_archive.warranties w
      CROSS JOIN LATERAL unnest(ARRAY[w.source_unit_id,w.source_replacement_unit_id]) u(id)
      WHERE w.source_ref='kiizldurgjtorxpzebpm' AND w.source_order_id=p_source_id
        AND u.id IS NOT NULL
    )
    UNION
    SELECT next_unit.id FROM related_units r
    JOIN nexora_archive.units original_unit
      ON original_unit.source_ref='kiizldurgjtorxpzebpm' AND original_unit.source_id=r.id
    JOIN nexora_archive.warranties w
      ON w.source_ref=original_unit.source_ref AND (
        w.source_unit_id=r.id OR w.source_replacement_unit_id=r.id
        OR lower(btrim(coalesce(w.snapshot->>'imei_manual','')))=lower(btrim(original_unit.serial))
      )
    CROSS JOIN LATERAL unnest(ARRAY[w.source_unit_id,w.source_replacement_unit_id]) next_unit(id)
    WHERE next_unit.id IS NOT NULL
  )
  SELECT coalesce(array_agg(id ORDER BY id),'{}'::uuid[])
  INTO v_related_unit_ids FROM related_units;

  SELECT coalesce(array_agg(lower(btrim(u.serial))),'{}'::text[])
  INTO v_related_serials FROM nexora_archive.units u
  WHERE u.source_ref='kiizldurgjtorxpzebpm' AND u.source_id=ANY(v_related_unit_ids);

  SELECT coalesce(array_agg(w.source_id),'{}'::uuid[])
  INTO v_related_warranty_ids FROM nexora_archive.warranties w
  WHERE w.source_ref='kiizldurgjtorxpzebpm' AND (
    w.source_order_id=p_source_id OR w.source_unit_id=ANY(v_related_unit_ids)
    OR w.source_replacement_unit_id=ANY(v_related_unit_ids)
    OR lower(btrim(coalesce(w.unit_serial,'')))=ANY(v_related_serials)
    OR lower(btrim(coalesce(w.replacement_unit_serial,'')))=ANY(v_related_serials)
    OR lower(btrim(coalesce(w.snapshot->>'imei_manual','')))=ANY(v_related_serials)
  );

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.source_id,
        'productName', coalesce(nullif(p.snapshot ->> 'name', ''), 'Producto historico'),
        'productSku', coalesce(nullif(p.snapshot ->> 'sku', ''), ''),
        'quantity', coalesce(nullif(i.snapshot ->> 'quantity', '')::numeric, 0),
        'unitPrice', coalesce(nullif(i.snapshot ->> 'unit_price', '')::numeric, 0),
        'subtotal', coalesce(nullif(i.snapshot ->> 'subtotal', '')::numeric, 0),
        'condition', i.snapshot ->> 'unit_condition',
        'color', i.snapshot ->> 'color',
        'serials',
        coalesce(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'serial', l.serial,
                'assignedAt', l.source_link_snapshot ->> 'created_at',
                'condition', l.unit_snapshot ->> 'unit_condition',
                'originalStatus', l.unit_snapshot ->> 'status',
                'receivedAt', l.unit_snapshot ->> 'received_at'
              )
              ORDER BY l.serial
            )
            FROM nexora_archive.order_serial_links l
            JOIN nexora_archive.units u
              ON u.source_ref = l.source_ref
             AND u.source_id = l.source_unit_id
            WHERE l.source_ref = i.source_ref
              AND l.source_order_item_id = i.source_id
              AND nullif(btrim(l.serial), '') IS NOT NULL
              AND lower(btrim(u.serial)) = lower(btrim(l.serial))
          ),
          '[]'::jsonb
        )
      )
      ORDER BY coalesce(p.snapshot ->> 'name', ''), i.source_id
    ),
    '[]'::jsonb
  )
  INTO v_lines
  FROM nexora_archive.order_items i
  LEFT JOIN nexora_archive.products p
    ON p.source_ref = i.source_ref
   AND p.source_id = i.source_product_id
  WHERE i.source_ref = 'kiizldurgjtorxpzebpm'
    AND i.source_order_id = p_source_id;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.source_id,
        'serial', m.serial,
        'type', m.movement_type,
        'referenceType', m.reference_type,
        'referenceId', m.reference_id,
        'quantity', coalesce(nullif(m.snapshot ->> 'quantity', '')::numeric, 0),
        'notes', m.snapshot ->> 'notes',
        'createdAt', m.occurred_at
      )
      ORDER BY m.occurred_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_movements
  FROM nexora_archive.serial_movements m
  WHERE m.source_ref='kiizldurgjtorxpzebpm' AND (
    (m.reference_type='pedido' AND m.reference_id=p_source_id)
    OR m.source_unit_id=ANY(v_related_unit_ids)
  );

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', w.source_id,
        'status', w.status,
        'unitSerial', coalesce(w.unit_serial,nullif(w.snapshot->>'imei_manual','')),
        'replacementUnitSerial', w.replacement_unit_serial,
        'reason', w.snapshot ->> 'reason',
        'diagnosis', w.snapshot ->> 'diagnostico',
        'resolution', w.snapshot ->> 'resolucion',
        'notes', w.snapshot ->> 'notes',
        'receivedAt', w.snapshot ->> 'received_at',
        'resolvedAt', w.snapshot ->> 'resolved_at',
        'events',
        coalesce(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'status', e.snapshot ->> 'status',
                'notes', e.snapshot ->> 'notes',
                'createdAt', e.occurred_at
              )
              ORDER BY e.occurred_at
            )
            FROM nexora_archive.warranty_events e
            WHERE e.source_ref = w.source_ref
              AND e.source_warranty_id = w.source_id
          ),
          '[]'::jsonb
        )
      )
      ORDER BY w.imported_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_warranties
  FROM nexora_archive.warranties w
  WHERE w.source_ref='kiizldurgjtorxpzebpm' AND w.source_id=ANY(v_related_warranty_ids);

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'occurredAt', a.occurred_at,
        'snapshot', a.snapshot
      )
      ORDER BY a.occurred_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_audit
  FROM nexora_archive.order_audit a
  WHERE a.source_ref = 'kiizldurgjtorxpzebpm'
    AND a.source_order_id = p_source_id;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'entity', a.source_entity,
        'occurredAt', a.occurred_at,
        'snapshot', a.snapshot
      )
      ORDER BY a.occurred_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_related_audit
  FROM nexora_archive.related_audit a
  WHERE a.source_ref='kiizldurgjtorxpzebpm' AND (
    a.source_entity_id=ANY(v_related_unit_ids)
    OR a.source_entity_id=ANY(v_related_warranty_ids)
    OR a.source_entity_id IN (
      SELECT p_source_id
      UNION SELECT nullif(v_order->>'customer_id','')::uuid
      UNION SELECT i.source_id FROM nexora_archive.order_items i
        WHERE i.source_ref='kiizldurgjtorxpzebpm' AND i.source_order_id=p_source_id
      UNION SELECT i.source_product_id FROM nexora_archive.order_items i
        WHERE i.source_ref='kiizldurgjtorxpzebpm' AND i.source_order_id=p_source_id
    )
  );

  SELECT coalesce(
    jsonb_agg(
      DISTINCT jsonb_build_object(
        'fileName', coalesce(d.snapshot ->> 'file_name', d.snapshot ->> 'name', 'Documento historico'),
        'storagePath', d.storage_path,
        'metadata', d.snapshot
      )
    ),
    '[]'::jsonb
  )
  INTO v_documents
  FROM nexora_archive.warranty_document_links wd
  JOIN nexora_archive.documents d
    ON d.source_ref=wd.source_ref AND d.source_id=wd.source_document_id
  WHERE wd.source_ref='kiizldurgjtorxpzebpm'
    AND wd.source_warranty_id=ANY(v_related_warranty_ids);

  RETURN jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order ->> 'id',
      'code', v_order ->> 'code',
      'status', v_order ->> 'status',
      'orderDate', v_order ->> 'order_date',
      'deliveryDate', v_order ->> 'delivery_date',
      'total', coalesce(nullif(v_order ->> 'total', '')::numeric, 0),
      'notes', v_order ->> 'notes',
      'createdAt', v_order ->> 'created_at',
      'updatedAt', v_order ->> 'updated_at'
    ),
    'customer', CASE
      WHEN v_customer IS NULL THEN NULL
      ELSE jsonb_build_object(
        'name', v_customer ->> 'name',
        'phone', v_customer ->> 'phone',
        'email', v_customer ->> 'email',
        'address', v_customer ->> 'address',
        'contactName', v_customer ->> 'contact_name',
        'taxId', v_customer ->> 'tax_id'
      )
    END,
    'lines', v_lines,
    'movements', v_movements,
    'warranties', v_warranties,
    'audit', v_audit,
    'relatedAudit', v_related_audit,
    'documents', v_documents,
    'readOnly', true,
    'source', 'Techrez'
  );
END;
$function$;

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
  IF auth.uid() IS NULL OR NOT public.bodega_is_staff() THEN
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

CREATE OR REPLACE FUNCTION public.nexora_historical_serial_trace(p_serial text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_serial text := lower(btrim(coalesce(p_serial, '')));
  v_unit_id uuid;
  v_order_id uuid;
  v_result jsonb;
  v_events jsonb;
  v_warranties jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bodega_is_staff() THEN
    RAISE EXCEPTION 'No tienes permiso para consultar el historial de seriales.'
      USING ERRCODE = '42501';
  END IF;

  IF char_length(v_serial) < 5 OR char_length(v_serial) > 80 THEN
    RAISE EXCEPTION 'Ingresa un serial completo (5-80 caracteres).'
      USING ERRCODE = '22023';
  END IF;

  -- Las 4.486 asociaciones migradas tienen seriales unicos.
  -- Este identificador pertenece EXCLUSIVAMENTE al proyecto de origen.
  SELECT l.source_unit_id, o.source_id,
    jsonb_build_object(
      'found', true,
      'serial', l.serial,
      'source', 'Techrez',
      'readOnly', true,
      'order', jsonb_build_object(
        'sourceId', o.source_id,
        'code', o.code,
        'status', o.status,
        'orderDate', o.order_date,
        'deliveryDate', o.snapshot ->> 'delivery_date',
        'total', o.total
      ),
      'customer', jsonb_build_object(
        'name', coalesce(nullif(c.snapshot ->> 'name', ''), 'Cliente sin identificar'),
        'phone', c.snapshot ->> 'phone'
      ),
      'product', jsonb_build_object(
        'name', coalesce(nullif(p.snapshot ->> 'name', ''), 'Referencia histórica'),
        'sku', p.snapshot ->> 'sku',
        'category', p.snapshot ->> 'categoria',
        'imageUrl', CASE WHEN img.match_count = 1 THEN img.image_url ELSE NULL END,
        'imageSource', CASE WHEN img.match_count = 1 THEN 'exact_catalog_reference' ELSE NULL END
      ),
      'unit', jsonb_build_object(
        'sourceId', l.source_unit_id,
        'status', u.snapshot ->> 'status',
        'condition', u.snapshot ->> 'unit_condition',
        'color', u.snapshot ->> 'color',
        'receivedAt', u.snapshot ->> 'received_at',
        'assignedAt', l.source_link_snapshot ->> 'created_at'
      ),
      'line', jsonb_build_object(
        'sourceId', i.source_id,
        'quantity', coalesce(nullif(i.snapshot ->> 'quantity', '')::numeric, 0),
        'unitPrice', coalesce(nullif(i.snapshot ->> 'unit_price', '')::numeric, 0)
      )
    )
  INTO v_unit_id, v_order_id, v_result
  FROM nexora_archive.order_serial_links l
  JOIN nexora_archive.units u
    ON u.source_ref = l.source_ref
   AND u.source_id = l.source_unit_id
  JOIN nexora_archive.order_items i
    ON i.source_ref = l.source_ref
   AND i.source_id = l.source_order_item_id
  JOIN nexora_archive.orders o
    ON o.source_ref = i.source_ref
   AND o.source_id = i.source_order_id
  LEFT JOIN nexora_archive.customers c
    ON c.source_ref = o.source_ref
   AND c.source_id = o.source_customer_id
  LEFT JOIN nexora_archive.products p
    ON p.source_ref = i.source_ref
   AND p.source_id = i.source_product_id
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS match_count,
           max(bp.image_url) AS image_url
    FROM public.bodega_products bp
    WHERE bp.image_url IS NOT NULL
      AND btrim(bp.image_url) <> ''
      AND bp.categoria = p.snapshot ->> 'categoria'
      AND regexp_replace(
            regexp_replace(lower(bp.name), '^apple[[:space:]]+', '', 'g'),
            '[[:space:]]+', '', 'g'
          ) = regexp_replace(
            regexp_replace(lower(p.snapshot ->> 'name'), '^apple[[:space:]]+', '', 'g'),
            '[[:space:]]+', '', 'g'
          )
  ) img ON true
  WHERE l.source_ref = 'kiizldurgjtorxpzebpm'
    AND lower(btrim(l.serial)) = v_serial
    AND lower(btrim(u.serial)) = v_serial
  ORDER BY o.order_date DESC, l.source_id
  LIMIT 1;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('found', false, 'serial', btrim(p_serial), 'readOnly', true);
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.source_id,
        'occurredAt', m.occurred_at,
        'type', m.movement_type,
        'referenceType', m.reference_type,
        'referenceId', m.reference_id,
        'quantity', m.snapshot ->> 'quantity',
        'notes', m.snapshot ->> 'notes'
      ) ORDER BY m.occurred_at DESC, m.source_id
    ), '[]'::jsonb
  ) INTO v_events
  FROM nexora_archive.serial_movements m
  WHERE m.source_ref = 'kiizldurgjtorxpzebpm'
    AND (
      m.source_unit_id = v_unit_id
      OR (
        m.reference_id = v_order_id
        AND m.serial IS NOT NULL
        AND lower(btrim(m.serial)) = v_serial
      )
    );

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', w.source_id,
        'code', w.snapshot ->> 'code',
        'status', w.status,
        'reason', w.snapshot ->> 'reason',
        'receivedAt', w.snapshot ->> 'received_at',
        'resolvedAt', w.snapshot ->> 'resolved_at',
        'replacementSerial', w.replacement_unit_serial,
        'originalSerial', w.unit_serial,
        'events', coalesce(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', e.source_id,
                'status', e.snapshot ->> 'status',
                'notes', e.snapshot ->> 'notes',
                'occurredAt', e.occurred_at
              ) ORDER BY e.occurred_at
            )
            FROM nexora_archive.warranty_events e
            WHERE e.source_ref = w.source_ref
              AND e.source_warranty_id = w.source_id
          ), '[]'::jsonb
        )
      ) ORDER BY w.imported_at DESC, w.source_id
    ), '[]'::jsonb
  ) INTO v_warranties
  FROM nexora_archive.warranties w
  WHERE w.source_ref = 'kiizldurgjtorxpzebpm'
    AND (
      w.source_unit_id = v_unit_id
      OR w.source_replacement_unit_id = v_unit_id
      OR lower(btrim(coalesce(w.unit_serial, ''))) = v_serial
      OR lower(btrim(coalesce(w.replacement_unit_serial, ''))) = v_serial
      OR lower(btrim(coalesce(w.snapshot ->> 'imei_manual', ''))) = v_serial
    );

  RETURN v_result || jsonb_build_object('movements', v_events, 'warranties', v_warranties);
END;
$function$;

-- Bodegueros may consult technicians, but only administrators may manage them.
DROP POLICY IF EXISTS bodega_technicians_all ON public.bodega_technicians;
DROP POLICY IF EXISTS bodega_technicians_read ON public.bodega_technicians;
DROP POLICY IF EXISTS bodega_technicians_insert ON public.bodega_technicians;
DROP POLICY IF EXISTS bodega_technicians_update ON public.bodega_technicians;
DROP POLICY IF EXISTS bodega_technicians_delete ON public.bodega_technicians;

CREATE POLICY bodega_technicians_read
  ON public.bodega_technicians FOR SELECT TO authenticated
  USING (public.bodega_is_staff());
CREATE POLICY bodega_technicians_insert
  ON public.bodega_technicians FOR INSERT TO authenticated
  WITH CHECK (public.bodega_is_admin());
CREATE POLICY bodega_technicians_update
  ON public.bodega_technicians FOR UPDATE TO authenticated
  USING (public.bodega_is_admin())
  WITH CHECK (public.bodega_is_admin());
CREATE POLICY bodega_technicians_delete
  ON public.bodega_technicians FOR DELETE TO authenticated
  USING (public.bodega_is_admin());

-- A movement written through the Data API must be attributed to the caller.
DROP POLICY IF EXISTS bodega_movements_insert ON public.bodega_movements;
CREATE POLICY bodega_movements_insert
  ON public.bodega_movements FOR INSERT TO authenticated
  WITH CHECK (
    public.bodega_is_staff()
    AND created_by = (SELECT auth.uid())
  );

-- Admin-only unit fields and protected re-entry/release transitions.
CREATE OR REPLACE FUNCTION public.nexora_guard_unit_sensitive_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.bodega_is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.serial IS DISTINCT FROM OLD.serial
     OR NEW.previous_serials IS DISTINCT FROM OLD.previous_serials THEN
    RAISE EXCEPTION 'NEXORA_ADMIN_REQUIRED_UNIT_IDENTITY'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'liberado' AND OLD.status IS DISTINCT FROM NEW.status
     AND NOT EXISTS (
       SELECT 1
       FROM public.bodega_warranties w
       WHERE (
           w.unit_id = OLD.id
           OR (
             w.unit_id IS NULL
             AND LOWER(BTRIM(COALESCE(w.imei_manual, ''))) = LOWER(BTRIM(OLD.serial))
           )
         )
         AND w.status = 'reenvio_pendiente'
         AND w.resolucion = 'cambio'
         AND w.customer_id IS NULL
         AND w.order_id IS NULL
         AND NULLIF(BTRIM(w.cliente_manual), '') IS NULL
     ) THEN
    RAISE EXCEPTION 'NEXORA_ADMIN_REQUIRED_UNIT_RELEASE'
      USING ERRCODE = '42501';
  END IF;

  -- Any move from a non-stock state back into stock must be backed by a
  -- confirmed reception or an active warranty return workflow.
  IF NEW.status IN ('en_bodega', 'en_local')
     AND OLD.status NOT IN ('en_bodega', 'en_local')
     AND NOT (
       NEW.status = 'en_bodega'
       AND (
         (
           NEW.reception_id IS NOT NULL
           AND NEW.reception_id IS DISTINCT FROM OLD.reception_id
           AND EXISTS (
             SELECT 1
             FROM public.bodega_receptions r
             WHERE r.id = NEW.reception_id
               AND r.status = 'confirmada'
           )
         )
         OR EXISTS (
           SELECT 1
           FROM public.bodega_warranties w
           WHERE (
               w.unit_id = OLD.id
               OR (
                 w.unit_id IS NULL
                 AND LOWER(BTRIM(COALESCE(w.imei_manual, ''))) = LOWER(BTRIM(OLD.serial))
               )
             )
             AND (
               w.status = 'recibido'
               OR (
                 w.status = 'reenvio_pendiente'
                 AND w.resolucion IN ('reparado', 'sin_falla')
               )
             )
         )
       )
     ) THEN
    RAISE EXCEPTION 'NEXORA_WARRANTY_OR_RECEPTION_REQUIRED_STOCK_REENTRY'
      USING ERRCODE = '42501';
  END IF;

  -- A non-admin may mark a unit sold only inside an active order preparation
  -- or the atomic retail POS transaction (which inserts its sale row first).
  IF NEW.status = 'vendido'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NOT EXISTS (
       SELECT 1 FROM public.bodega_order_item_units a
       JOIN public.bodega_order_items i ON i.id = a.order_item_id
       JOIN public.bodega_orders o ON o.id = i.order_id
       WHERE a.unit_id = OLD.id AND o.status = 'en_preparacion'
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.nexora_retail_sales r WHERE r.unit_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'NEXORA_UNIT_SALE_REQUIRES_ORDER_OR_POS'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS nexora_guard_unit_sensitive_changes ON public.bodega_units;
CREATE TRIGGER nexora_guard_unit_sensitive_changes
BEFORE UPDATE ON public.bodega_units
FOR EACH ROW
EXECUTE FUNCTION public.nexora_guard_unit_sensitive_changes();

-- Preserve the order state machine and admin-only post-dispatch edits.
CREATE OR REPLACE FUNCTION public.nexora_guard_order_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- Even administrators must not skip physical preparation before dispatch.
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'despachado'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status <> 'preparado' THEN
    RAISE EXCEPTION 'NEXORA_ORDER_MUST_BE_PREPARED_BEFORE_DISPATCH'
      USING ERRCODE = '23514';
  END IF;

  IF auth.uid() IS NULL OR public.bodega_is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'en_preparacion' THEN
      RAISE EXCEPTION 'NEXORA_INVALID_INITIAL_ORDER_STATUS'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('despachado', 'cancelado') THEN
    IF TO_JSONB(NEW) IS DISTINCT FROM TO_JSONB(OLD) THEN
      RAISE EXCEPTION 'NEXORA_ADMIN_REQUIRED_CLOSED_ORDER_EDIT'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'NEXORA_ADMIN_REQUIRED_ORDER_CANCELLATION'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'en_preparacion'
     AND NEW.status NOT IN ('en_preparacion', 'preparado') THEN
    RAISE EXCEPTION 'NEXORA_INVALID_ORDER_TRANSITION'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'preparado'
     AND NEW.status NOT IN ('preparado', 'en_preparacion', 'despachado') THEN
    RAISE EXCEPTION 'NEXORA_INVALID_ORDER_TRANSITION'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS nexora_guard_order_row ON public.bodega_orders;
CREATE TRIGGER nexora_guard_order_row
BEFORE INSERT OR UPDATE ON public.bodega_orders
FOR EACH ROW
EXECUTE FUNCTION public.nexora_guard_order_row();

-- After dispatch, order lines are editable only by an administrator.
-- While prepared, Bodega may adjust only price/subtotal, as in the domain actions.
CREATE OR REPLACE FUNCTION public.nexora_guard_order_item_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR public.bodega_is_admin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_order_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END;
  SELECT o.status INTO v_status
  FROM public.bodega_orders o
  WHERE o.id = v_order_id;

  IF v_status IN ('despachado', 'cancelado') THEN
    RAISE EXCEPTION 'NEXORA_ADMIN_REQUIRED_ORDER_LINE_EDIT'
      USING ERRCODE = '42501';
  END IF;

  IF v_status = 'preparado' THEN
    IF TG_OP <> 'UPDATE' THEN
      RAISE EXCEPTION 'NEXORA_PREPARED_ORDER_LINE_LOCKED'
        USING ERRCODE = '42501';
    END IF;
    IF ROW(NEW.order_id, NEW.product_id, NEW.quantity, NEW.unit_condition, NEW.color)
       IS DISTINCT FROM
       ROW(OLD.order_id, OLD.product_id, OLD.quantity, OLD.unit_condition, OLD.color) THEN
      RAISE EXCEPTION 'NEXORA_PREPARED_ORDER_LINE_LOCKED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS nexora_guard_order_item_row ON public.bodega_order_items;
CREATE TRIGGER nexora_guard_order_item_row
BEFORE INSERT OR UPDATE OR DELETE ON public.bodega_order_items
FOR EACH ROW
EXECUTE FUNCTION public.nexora_guard_order_item_row();

-- A physical unit may belong to only one active/current order assignment.
-- Production preflight found zero duplicate unit_id values before this index was prepared.
CREATE UNIQUE INDEX IF NOT EXISTS bodega_order_item_units_unit_id_uidx
  ON public.bodega_order_item_units(unit_id)
  WHERE unit_id IS NOT NULL;

-- Assignments may be added during the preparation transaction (automatic spare-part
-- serialization). Any such addition is validated at commit against sold unit + exit movement.
CREATE OR REPLACE FUNCTION public.nexora_guard_order_assignment_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR public.bodega_is_admin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT o.status INTO v_status
    FROM public.bodega_orders o
    JOIN public.bodega_order_items i ON i.order_id = o.id
    WHERE i.id = OLD.order_item_id;
    IF v_status IN ('preparado', 'despachado', 'cancelado') THEN
      RAISE EXCEPTION 'NEXORA_ORDER_ASSIGNMENT_LOCKED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT o.id, o.status INTO v_order_id, v_status
    FROM public.bodega_orders o
    JOIN public.bodega_order_items i ON i.order_id = o.id
    WHERE i.id = NEW.order_item_id;
    IF v_status IN ('preparado', 'despachado', 'cancelado') THEN
      RAISE EXCEPTION 'NEXORA_ORDER_ASSIGNMENT_LOCKED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS nexora_guard_order_assignment_row ON public.bodega_order_item_units;
CREATE TRIGGER nexora_guard_order_assignment_row
BEFORE INSERT OR UPDATE OR DELETE ON public.bodega_order_item_units
FOR EACH ROW
EXECUTE FUNCTION public.nexora_guard_order_assignment_row();

CREATE OR REPLACE FUNCTION public.nexora_validate_prepared_order_assignments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_status text;
BEGIN
  -- Trusted server-side maintenance may run without a user JWT. Administrators
  -- are still subject to the same stock and assignment invariants as Bodega.
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;

  IF TG_TABLE_NAME = 'bodega_orders' THEN
    v_order_id := COALESCE(NEW.id, OLD.id);
    v_status := COALESCE(NEW.status, OLD.status);
  ELSIF TG_TABLE_NAME = 'bodega_order_items' THEN
    v_order_id := COALESCE(NEW.order_id, OLD.order_id);
    SELECT o.status INTO v_status FROM public.bodega_orders o WHERE o.id = v_order_id;
  ELSE
    SELECT i.order_id INTO v_order_id
    FROM public.bodega_order_items i
    WHERE i.id = COALESCE(NEW.order_item_id, OLD.order_item_id);
    SELECT o.status INTO v_status FROM public.bodega_orders o WHERE o.id = v_order_id;
  END IF;

  IF v_order_id IS NULL THEN RETURN NULL; END IF;

  IF v_status IN ('en_preparacion', 'preparado', 'despachado') AND EXISTS (
    SELECT 1 FROM public.bodega_order_items i
    LEFT JOIN public.bodega_order_item_units a ON a.order_item_id = i.id
    WHERE i.order_id = v_order_id
    GROUP BY i.id, i.quantity
    HAVING COUNT(a.id) > i.quantity
  ) THEN
    RAISE EXCEPTION 'NEXORA_ORDER_LINE_OVERASSIGNED' USING ERRCODE = '23514';
  END IF;

  IF v_status IN ('preparado', 'despachado')
     AND NOT EXISTS (SELECT 1 FROM public.bodega_order_items i WHERE i.order_id = v_order_id) THEN
    RAISE EXCEPTION 'NEXORA_PREPARED_ORDER_EMPTY' USING ERRCODE = '23514';
  END IF;

  IF v_status IN ('preparado', 'despachado') AND EXISTS (
    SELECT 1 FROM public.bodega_order_items i
    LEFT JOIN public.bodega_order_item_units a ON a.order_item_id = i.id
    WHERE i.order_id = v_order_id
    GROUP BY i.id, i.quantity
    HAVING COUNT(a.id) < i.quantity
  ) THEN
    RAISE EXCEPTION 'NEXORA_PREPARED_ORDER_INCOMPLETE' USING ERRCODE = '23514';
  END IF;

  IF v_status IN ('preparado', 'despachado') AND EXISTS (
    SELECT 1
    FROM public.bodega_order_item_units a
    JOIN public.bodega_order_items i ON i.id = a.order_item_id
    LEFT JOIN public.bodega_units u ON u.id = a.unit_id
    WHERE i.order_id = v_order_id
      AND (
        u.id IS NULL OR u.status <> 'vendido'
        OR u.product_id IS DISTINCT FROM i.product_id
        OR (i.unit_condition IS NOT NULL AND u.unit_condition IS DISTINCT FROM i.unit_condition)
        OR (i.color IS NOT NULL AND LOWER(BTRIM(COALESCE(u.color, ''))) <> LOWER(BTRIM(i.color)))
        OR NOT EXISTS (
          SELECT 1 FROM public.bodega_movements m
          WHERE m.unit_id = u.id AND m.type = 'salida'
            AND m.reference_type = 'pedido' AND m.reference_id = v_order_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'NEXORA_PREPARED_ORDER_WITHOUT_PHYSICAL_EXIT' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS nexora_validate_prepared_order_assignments ON public.bodega_orders;
CREATE CONSTRAINT TRIGGER nexora_validate_prepared_order_assignments
AFTER INSERT OR UPDATE OF status ON public.bodega_orders
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
WHEN (NEW.status IN ('preparado', 'despachado'))
EXECUTE FUNCTION public.nexora_validate_prepared_order_assignments();

DROP TRIGGER IF EXISTS nexora_validate_prepared_assignment_insert ON public.bodega_order_item_units;
CREATE CONSTRAINT TRIGGER nexora_validate_prepared_assignment_insert
AFTER INSERT OR UPDATE OR DELETE ON public.bodega_order_item_units
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.nexora_validate_prepared_order_assignments();

DROP TRIGGER IF EXISTS nexora_validate_prepared_order_items ON public.bodega_order_items;
CREATE CONSTRAINT TRIGGER nexora_validate_prepared_order_items
AFTER INSERT OR UPDATE OR DELETE ON public.bodega_order_items
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.nexora_validate_prepared_order_assignments();

-- Invoice/dispatch must respect the same cost floor as confirmarVentaPedido().
CREATE OR REPLACE FUNCTION public.nexora_validate_order_dispatch_pricing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.status = 'despachado' AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
       FROM public.bodega_order_items i
       JOIN public.bodega_order_item_units a ON a.order_item_id = i.id
       JOIN public.bodega_units u ON u.id = a.unit_id
       JOIN public.bodega_products p ON p.id = i.product_id
       LEFT JOIN LATERAL (
         SELECT NULLIF(v.variant->>'cost', '')::numeric AS cost
         FROM jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(p.color_variants) = 'array' THEN p.color_variants
             ELSE '[]'::jsonb
           END
         ) AS v(variant)
         WHERE LOWER(BTRIM(COALESCE(v.variant->>'color', '')))
             = LOWER(BTRIM(COALESCE(i.color, '')))
         LIMIT 1
       ) color_cost ON TRUE
       WHERE i.order_id = NEW.id
         AND i.unit_price < COALESCE(u.cost, color_cost.cost, p.cost, 0)
     ) THEN
    RAISE EXCEPTION 'NEXORA_ORDER_PRICE_BELOW_UNIT_COST'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS nexora_validate_order_dispatch_pricing ON public.bodega_orders;
CREATE CONSTRAINT TRIGGER nexora_validate_order_dispatch_pricing
AFTER UPDATE OF status ON public.bodega_orders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW.status = 'despachado')
EXECUTE FUNCTION public.nexora_validate_order_dispatch_pricing();

-- A cancelled order may not leave a unit marked sold by that order without a return.
CREATE OR REPLACE FUNCTION public.nexora_validate_order_cancellation_returns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
       FROM public.bodega_movements salida
       JOIN public.bodega_units u ON u.id = salida.unit_id
       WHERE salida.type = 'salida'
         AND salida.reference_type = 'pedido'
         AND salida.reference_id = NEW.id
         AND u.status = 'vendido'
         AND NOT EXISTS (
           SELECT 1
           FROM public.bodega_movements devolucion
           WHERE devolucion.unit_id = salida.unit_id
             AND devolucion.type = 'devolucion'
             AND devolucion.reference_type = 'pedido'
             AND devolucion.reference_id = NEW.id
         )
     ) THEN
    RAISE EXCEPTION 'NEXORA_ORDER_CANNOT_CANCEL_WITHOUT_PHYSICAL_RETURN'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS nexora_validate_order_cancellation_returns ON public.bodega_orders;
CREATE CONSTRAINT TRIGGER nexora_validate_order_cancellation_returns
AFTER UPDATE OF status ON public.bodega_orders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW.status = 'cancelado')
EXECUTE FUNCTION public.nexora_validate_order_cancellation_returns();

-- Refund payment evidence is administrator-only; agreeing a refund remains part of
-- the normal warranty workflow.
CREATE OR REPLACE FUNCTION public.nexora_guard_warranty_refund_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.bodega_is_admin()
     AND ROW(NEW.reembolso_monto, NEW.reembolso_metodo, NEW.reembolso_referencia, NEW.reembolso_pagado_at)
         IS DISTINCT FROM
         ROW(OLD.reembolso_monto, OLD.reembolso_metodo, OLD.reembolso_referencia, OLD.reembolso_pagado_at) THEN
    RAISE EXCEPTION 'NEXORA_ADMIN_REQUIRED_REFUND_PAYMENT'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS nexora_guard_warranty_refund_payment ON public.bodega_warranties;
CREATE TRIGGER nexora_guard_warranty_refund_payment
BEFORE UPDATE ON public.bodega_warranties
FOR EACH ROW
EXECUTE FUNCTION public.nexora_guard_warranty_refund_payment();
