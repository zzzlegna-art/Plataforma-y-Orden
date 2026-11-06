-- Ranking global del panel: combina pedidos operativos de Nexora e historial importado de Techrez.
-- Cuenta pedidos preparados y despachados; excluye cancelados para no inflar el movimiento.
-- Agrupa clientes por nombre visible normalizado y productos por referencia normalizada.
-- No modifica pedidos, inventario ni historiales: es una consulta de solo lectura.

CREATE OR REPLACE FUNCTION public.nexora_dashboard_order_rankings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, nexora_archive
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
$function$;

REVOKE ALL ON FUNCTION public.nexora_dashboard_order_rankings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nexora_dashboard_order_rankings() TO authenticated;

COMMENT ON FUNCTION public.nexora_dashboard_order_rankings()
IS 'Rankings del panel basados en todos los pedidos operativos e históricos no cancelados. Solo lectura.';

NOTIFY pgrst, 'reload schema';
