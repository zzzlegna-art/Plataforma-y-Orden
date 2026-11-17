\set ON_ERROR_STOP on
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);

INSERT INTO public.bodega_orders(id,status,created_by)
VALUES ('40000000-0000-4000-8000-000000000003','en_preparacion',
        '00000000-0000-4000-8000-000000000002');
INSERT INTO public.bodega_order_items(id,order_id,product_id,quantity,unit_price,subtotal,unit_condition)
VALUES ('50000000-0000-4000-8000-000000000003',
        '40000000-0000-4000-8000-000000000003',
        '90000000-0000-4000-8000-000000000001',1,150,150,'nuevo');
INSERT INTO public.bodega_units(id,serial,status,product_id,unit_condition)
VALUES ('20000000-0000-4000-8000-000000000006','IMEI-UNDER-COST','en_bodega',
        '90000000-0000-4000-8000-000000000001','nuevo');
INSERT INTO public.bodega_order_item_units(id,order_item_id,unit_id)
VALUES ('60000000-0000-4000-8000-000000000003',
        '50000000-0000-4000-8000-000000000003',
        '20000000-0000-4000-8000-000000000006');
UPDATE public.bodega_units SET status='vendido'
WHERE id='20000000-0000-4000-8000-000000000006';
INSERT INTO public.bodega_movements(id,unit_id,type,reference_type,reference_id,created_by)
VALUES ('30000000-0000-4000-8000-000000000006',
        '20000000-0000-4000-8000-000000000006','salida','pedido',
        '40000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000002');
UPDATE public.bodega_orders SET status='preparado'
WHERE id='40000000-0000-4000-8000-000000000003';
UPDATE public.bodega_orders SET status='despachado'
WHERE id='40000000-0000-4000-8000-000000000003';
COMMIT;
