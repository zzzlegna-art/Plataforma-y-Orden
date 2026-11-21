-- Remove obsolete operational money fields. Historical snapshots in nexora_archive are intentionally untouched.
-- Warranty refund agreements and their payment evidence are also preserved as warranty history.

drop trigger if exists nexora_zero_legacy_order_item_amounts on public.bodega_order_items;
drop trigger if exists nexora_zero_legacy_order_total on public.bodega_orders;
drop trigger if exists nexora_zero_legacy_product_amounts on public.bodega_products;
drop trigger if exists nexora_zero_legacy_reception_item_cost on public.bodega_reception_items;
drop trigger if exists nexora_zero_legacy_unit_cost on public.bodega_units;
drop trigger if exists nexora_zero_legacy_warranty_cost on public.bodega_warranties;

drop function if exists nexora_internal.zero_legacy_order_item_amounts();
drop function if exists nexora_internal.zero_legacy_order_total();
drop function if exists nexora_internal.zero_legacy_product_amounts();
drop function if exists nexora_internal.zero_legacy_reception_item_cost();
drop function if exists nexora_internal.zero_legacy_unit_cost();
drop function if exists nexora_internal.zero_legacy_warranty_cost();

-- Remove obsolete price/cost keys from product color variants while retaining color and image data.
update public.bodega_products p
set color_variants = coalesce((
  select jsonb_agg(v.value - 'price' - 'cost' order by v.ordinality)
  from jsonb_array_elements(p.color_variants) with ordinality as v(value, ordinality)
), '[]'::jsonb)
where jsonb_typeof(p.color_variants) = 'array'
  and p.color_variants::text ~ '"(price|cost)"';

alter table public.bodega_order_items
  drop column if exists unit_price,
  drop column if exists subtotal;

alter table public.bodega_orders
  drop column if exists total;

alter table public.bodega_products
  drop column if exists price,
  drop column if exists cost;

alter table public.bodega_reception_items
  drop column if exists cost;

alter table public.bodega_units
  drop column if exists cost;

alter table public.bodega_warranties
  drop column if exists costo;
