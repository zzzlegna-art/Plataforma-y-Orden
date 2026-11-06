-- Ejecutar como administrador SQL después de completar el archivo histórico.
-- Solo lectura: verifica la consulta usada por la plataforma, incluidos seriales
-- manuales y cadenas de reemplazo, sin alterar órdenes, unidades ni sesiones.
BEGIN READ ONLY;
SELECT set_config('request.jwt.claim.sub', (
  SELECT id::text FROM public.bodega_profiles
  WHERE is_active AND role='admin' ORDER BY id LIMIT 1
), true);

DO $verify_history$
DECLARE missing bigint;
BEGIN
  WITH details AS MATERIALIZED (
    SELECT public.nexora_historical_order_detail(o.source_id) payload
    FROM nexora_archive.orders o WHERE o.source_ref='kiizldurgjtorxpzebpm'
  ), visible AS (
    SELECT DISTINCT w->>'id' id FROM details d
    CROSS JOIN LATERAL jsonb_array_elements(d.payload->'warranties') w
  )
  SELECT count(*) INTO missing FROM nexora_archive.warranties w
  WHERE w.source_ref='kiizldurgjtorxpzebpm'
    AND NOT EXISTS(SELECT 1 FROM visible v WHERE v.id=w.source_id::text);
  IF missing<>0 THEN RAISE EXCEPTION 'Garantías archivadas no visibles: %',missing; END IF;

  IF has_function_privilege('anon','public.nexora_historical_order_detail(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Acceso anónimo indebido al detalle';
  END IF;
  IF (SELECT count(*) FROM nexora_archive.orders WHERE source_ref='kiizldurgjtorxpzebpm')<>119 THEN
    RAISE EXCEPTION 'El conjunto histórico esperado no está completo';
  END IF;
END $verify_history$;
ROLLBACK;
