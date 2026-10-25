-- Add the intermediate order state used after stock preparation is confirmed.
-- Reserved units remain in inventory; the sale confirmation records their outgoing movement.
ALTER TABLE public.bodega_orders
  DROP CONSTRAINT IF EXISTS bodega_orders_status_check;

ALTER TABLE public.bodega_orders
  ADD CONSTRAINT bodega_orders_status_check
  CHECK (status = ANY (ARRAY[
    'en_preparacion'::text,
    'preparado'::text,
    'despachado'::text,
    'cancelado'::text
  ]));
