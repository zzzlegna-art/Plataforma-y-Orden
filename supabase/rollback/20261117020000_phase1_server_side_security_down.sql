-- Rollback for 20261117020000_phase1_server_side_security.sql.
-- Run only if the Phase 1 migration must be reverted.

DROP INDEX IF EXISTS public.bodega_order_item_units_unit_id_uidx;
DROP TRIGGER IF EXISTS nexora_guard_unit_sensitive_changes ON public.bodega_units;
DROP TRIGGER IF EXISTS nexora_guard_order_row ON public.bodega_orders;
DROP TRIGGER IF EXISTS nexora_guard_order_item_row ON public.bodega_order_items;
DROP TRIGGER IF EXISTS nexora_guard_order_assignment_row ON public.bodega_order_item_units;
DROP TRIGGER IF EXISTS nexora_validate_prepared_order_assignments ON public.bodega_orders;
DROP TRIGGER IF EXISTS nexora_validate_prepared_assignment_insert ON public.bodega_order_item_units;
DROP TRIGGER IF EXISTS nexora_validate_order_cancellation_returns ON public.bodega_orders;
DROP TRIGGER IF EXISTS nexora_guard_warranty_refund_payment ON public.bodega_warranties;

DROP FUNCTION IF EXISTS public.nexora_guard_unit_sensitive_changes();
DROP FUNCTION IF EXISTS public.nexora_guard_order_row();
DROP FUNCTION IF EXISTS public.nexora_guard_order_item_row();
DROP FUNCTION IF EXISTS public.nexora_guard_order_assignment_row();
DROP FUNCTION IF EXISTS public.nexora_validate_prepared_order_assignments();
DROP FUNCTION IF EXISTS public.nexora_validate_order_cancellation_returns();
DROP FUNCTION IF EXISTS public.nexora_guard_warranty_refund_payment();

DROP POLICY IF EXISTS bodega_technicians_read ON public.bodega_technicians;
DROP POLICY IF EXISTS bodega_technicians_insert ON public.bodega_technicians;
DROP POLICY IF EXISTS bodega_technicians_update ON public.bodega_technicians;
DROP POLICY IF EXISTS bodega_technicians_delete ON public.bodega_technicians;
CREATE POLICY bodega_technicians_all
  ON public.bodega_technicians FOR ALL TO authenticated
  USING (public.bodega_is_staff())
  WITH CHECK (public.bodega_is_staff());

DROP POLICY IF EXISTS bodega_movements_insert ON public.bodega_movements;
CREATE POLICY bodega_movements_insert
  ON public.bodega_movements FOR INSERT TO authenticated
  WITH CHECK (public.bodega_is_staff());

CREATE OR REPLACE FUNCTION public.nexora_dashboard_order_rankings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'nexora_archive'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.bodega_profiles p
    WHERE p.id = auth.uid()
      AND p.is_active
      AND p.role IN ('admin', 'bodeguero')
  ) THEN
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
$function$
;

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
$function$
;

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
$function$
;

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
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.bodega_profiles p
    WHERE p.id = auth.uid()
      AND p.is_active
      AND p.role IN ('admin', 'bodeguero')
  ) THEN
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
$function$
;
