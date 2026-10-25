-- Nexora: separar la preparación logística de la venta/despacho.
-- El estado "preparado" reserva unidades, pero no las marca como vendidas.
alter table public.bodega_orders drop constraint if exists bodega_orders_status_check;
alter table public.bodega_orders add constraint bodega_orders_status_check
  check (status in ('en_preparacion', 'preparado', 'despachado', 'cancelado'));
