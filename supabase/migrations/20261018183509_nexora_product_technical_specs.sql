-- Nexora: ficha técnica estructurada para celulares, tablets y relojes.
-- No altera referencias, seriales, stock, pedidos ni garantías.
alter table public.nexora_products
  add column if not exists technical_specs jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'nexora_products_technical_specs_object'
       and conrelid = 'public.nexora_products'::regclass
  ) then
    alter table public.nexora_products
      add constraint nexora_products_technical_specs_object
      check (jsonb_typeof(technical_specs) = 'object');
  end if;
end
$$;

comment on column public.nexora_products.technical_specs is
  'Especificaciones técnicas opcionales del producto; se usa para celulares, tablets y relojes.';
