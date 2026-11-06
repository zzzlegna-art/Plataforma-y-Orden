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
$function$;

REVOKE ALL ON FUNCTION public.nexora_historical_order_detail(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexora_historical_order_detail(uuid) TO authenticated,service_role;
COMMENT ON FUNCTION public.nexora_historical_order_detail(uuid) IS
'Detalle histórico protegido: seriales originales, garantías manuales y cadenas de reemplazo, movimientos y auditoría relacionados. Solo lectura; sin inventario operativo.';
NOTIFY pgrst, 'reload schema';

