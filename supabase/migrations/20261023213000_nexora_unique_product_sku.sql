-- Prevent duplicate product SKUs even when two sessions save concurrently.
-- Existing data was checked for duplicates after trimming and case-folding.
create unique index if not exists bodega_products_sku_normalized_uniq
  on public.bodega_products (lower(btrim(sku)))
  where nullif(btrim(sku), '') is not null;
