\set ON_ERROR_STOP on

-- Worker roles must not reach legacy historical RPCs, while the legacy Bodega
-- roles continue through the same endpoints.
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
DO $$
BEGIN
  BEGIN PERFORM public.nexora_historical_orders_list(NULL,NULL); RAISE EXCEPTION 'worker unexpectedly reached historical order list';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN PERFORM public.nexora_historical_order_detail('90000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'worker unexpectedly reached historical order detail';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN PERFORM public.nexora_historical_serial_trace('SERIAL-12345'); RAISE EXCEPTION 'worker unexpectedly reached historical serial trace';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN PERFORM public.nexora_dashboard_order_rankings(); RAISE EXCEPTION 'worker unexpectedly reached historical rankings';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
RESET ROLE;
COMMIT;

BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $$
BEGIN
  BEGIN PERFORM public.nexora_historical_orders_list(repeat('x',121),NULL); RAISE EXCEPTION 'bodeguero did not pass historical list role gate';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN PERFORM public.nexora_historical_order_detail(NULL); RAISE EXCEPTION 'bodeguero did not pass historical detail role gate';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN PERFORM public.nexora_historical_serial_trace(''); RAISE EXCEPTION 'bodeguero did not pass historical serial role gate';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  IF (SELECT count(*) FROM public.bodega_technicians) <> 1 THEN
    RAISE EXCEPTION 'bodeguero lost technician read access';
  END IF;
  BEGIN
    INSERT INTO public.bodega_technicians(id,nombre,activo)
    VALUES ('10000000-0000-4000-8000-000000000002','No autorizado',true);
    RAISE EXCEPTION 'bodeguero unexpectedly created a technician';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    INSERT INTO public.bodega_movements(id,unit_id,type,reference_type,created_by)
    VALUES ('30000000-0000-4000-8000-000000000001',NULL,'ajuste','manual',
      '00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'movement accepted forged created_by';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  INSERT INTO public.bodega_movements(id,unit_id,type,reference_type,created_by)
  VALUES ('30000000-0000-4000-8000-000000000002',NULL,'ajuste','manual',
    '00000000-0000-4000-8000-000000000002');
END $$;

-- Sensitive unit identity fields and manual release are administrator-only.
INSERT INTO public.bodega_units(id,serial,status)
VALUES ('20000000-0000-4000-8000-000000000001','IMEI-UNIT-1','en_bodega');
DO $$
BEGIN
  BEGIN
    UPDATE public.bodega_units SET serial='IMEI-CHANGED' WHERE id='20000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'bodeguero unexpectedly corrected a serial';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    UPDATE public.bodega_units SET status='liberado' WHERE id='20000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'bodeguero unexpectedly released a unit';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;

-- A no-customer inventory warranty is the one legitimate Bodega release path.
INSERT INTO public.bodega_warranties(id,unit_id,status,resolucion)
VALUES ('70000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001','reenvio_pendiente','cambio');
UPDATE public.bodega_units SET status='liberado'
WHERE id='20000000-0000-4000-8000-000000000001';

-- Reception confirmation is the legitimate Bodega re-entry path for a released unit.
INSERT INTO public.bodega_receptions(id,status)
VALUES ('80000000-0000-4000-8000-000000000001','confirmada');
UPDATE public.bodega_units
SET status='en_bodega', reception_id='80000000-0000-4000-8000-000000000001'
WHERE id='20000000-0000-4000-8000-000000000001';

-- Bodegueros may manage warranty cases but cannot register payment evidence.
INSERT INTO public.bodega_warranties(id,unit_id,status,resolucion)
VALUES ('70000000-0000-4000-8000-000000000002',NULL,'devuelto','sin_falla');
DO $$
BEGIN
  BEGIN
    UPDATE public.bodega_warranties
    SET reembolso_monto=100,reembolso_metodo='transferencia',reembolso_referencia='REF-1',
        reembolso_pagado_at=now()
    WHERE id='70000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'bodeguero unexpectedly registered refund payment';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;

-- A normal order preparation remains valid: assignments, unit exit and order status
-- are saved in one transaction and validated together at commit.
INSERT INTO public.bodega_orders(id,status,created_by)
VALUES ('40000000-0000-4000-8000-000000000001','en_preparacion',
        '00000000-0000-4000-8000-000000000002');
INSERT INTO public.bodega_order_items(id,order_id,product_id,quantity,unit_price,subtotal,unit_condition)
VALUES ('50000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        '90000000-0000-4000-8000-000000000001',1,200,200,'nuevo');
INSERT INTO public.bodega_units(id,serial,status,product_id,unit_condition)
VALUES ('20000000-0000-4000-8000-000000000002','IMEI-ORDER-1','en_bodega',
        '90000000-0000-4000-8000-000000000001','nuevo');
INSERT INTO public.bodega_order_item_units(id,order_item_id,unit_id)
VALUES ('60000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002');

-- The same IMEI cannot be assigned to a second order, even through direct table writes.
INSERT INTO public.bodega_orders(id,status,created_by)
VALUES ('40000000-0000-4000-8000-000000000002','en_preparacion',
        '00000000-0000-4000-8000-000000000002');
INSERT INTO public.bodega_order_items(id,order_id,product_id,quantity,unit_price,subtotal,unit_condition)
VALUES ('50000000-0000-4000-8000-000000000002',
        '40000000-0000-4000-8000-000000000002',
        '90000000-0000-4000-8000-000000000001',1,200,200,'nuevo');
DO $phase1$
BEGIN
  BEGIN
    INSERT INTO public.bodega_order_item_units(id,order_item_id,unit_id)
    VALUES ('60000000-0000-4000-8000-000000000002',
            '50000000-0000-4000-8000-000000000002',
            '20000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'the same IMEI was assigned to two orders';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $phase1$;

UPDATE public.bodega_units SET status='vendido'
WHERE id='20000000-0000-4000-8000-000000000002';
INSERT INTO public.bodega_movements(id,unit_id,type,reference_type,reference_id,created_by)
VALUES ('30000000-0000-4000-8000-000000000003',
        '20000000-0000-4000-8000-000000000002','salida','pedido',
        '40000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002');
UPDATE public.bodega_orders SET status='preparado'
WHERE id='40000000-0000-4000-8000-000000000001';

-- In prepared state, only price edits are allowed; assignment edits and quantity
-- changes are blocked. Bodega may then confirm the invoice/dispatch.
UPDATE public.bodega_order_items SET unit_price=210,subtotal=210
WHERE id='50000000-0000-4000-8000-000000000001';
DO $$
BEGIN
  BEGIN
    UPDATE public.bodega_order_items SET quantity=2
    WHERE id='50000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'bodeguero unexpectedly changed prepared quantity';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    DELETE FROM public.bodega_order_item_units
    WHERE id='60000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'bodeguero unexpectedly removed prepared assignment';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
UPDATE public.bodega_orders SET status='despachado'
WHERE id='40000000-0000-4000-8000-000000000001';
DO $$
BEGIN
  BEGIN
    UPDATE public.bodega_orders SET notes='forged post-dispatch edit'
    WHERE id='40000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'bodeguero unexpectedly edited dispatched order';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
RESET ROLE;
COMMIT;

-- Administrator can complete the physical return and cancel the order.
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
UPDATE public.bodega_units SET status='en_bodega'
WHERE id='20000000-0000-4000-8000-000000000002';
INSERT INTO public.bodega_movements(id,unit_id,type,reference_type,reference_id,created_by)
VALUES ('30000000-0000-4000-8000-000000000004',
        '20000000-0000-4000-8000-000000000002','devolucion','pedido',
        '40000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001');
UPDATE public.bodega_orders SET status='cancelado'
WHERE id='40000000-0000-4000-8000-000000000001';
UPDATE public.bodega_warranties
SET reembolso_monto=100,reembolso_metodo='transferencia',
    reembolso_referencia='REF-ADMIN',reembolso_pagado_at=now()
WHERE id='70000000-0000-4000-8000-000000000002';
INSERT INTO public.bodega_technicians(id,nombre,activo)
VALUES ('10000000-0000-4000-8000-000000000003','Técnico administrador',true);
COMMIT;

RESET ROLE;
SELECT 'phase1_security_integration_ok' AS result;
