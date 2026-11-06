-- Hoja de vida del IMEI de Techrez: lectura exacta desde el archivo historico privado.
-- No agrega unidades al inventario, no actualiza existencias ni vincula UUID operativos.
CREATE OR REPLACE FUNCTION public.nexora_historical_serial_trace(p_serial text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
      w.source_order_id = v_order_id
      OR w.source_unit_id = v_unit_id
      OR w.source_replacement_unit_id = v_unit_id
      OR lower(btrim(coalesce(w.unit_serial, ''))) = v_serial
      OR lower(btrim(coalesce(w.replacement_unit_serial, ''))) = v_serial
      OR lower(btrim(coalesce(w.snapshot ->> 'imei_manual', ''))) = v_serial
    );

  RETURN v_result || jsonb_build_object('movements', v_events, 'warranties', v_warranties);
END;
$function$;

REVOKE ALL ON FUNCTION public.nexora_historical_serial_trace(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nexora_historical_serial_trace(text) TO authenticated, service_role;
COMMENT ON FUNCTION public.nexora_historical_serial_trace(text) IS
'Consulta de solo lectura del historial Techrez por IMEI exacto; requiere admin o bodeguero activo. Sin escrituras sobre inventario.';
NOTIFY pgrst, 'reload schema';
