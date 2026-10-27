-- Vincular proveedor registrado a cada recepción, sin reescribir las anteriores.
alter table public.bodega_receptions
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
create index if not exists bodega_receptions_supplier_id_idx
  on public.bodega_receptions(supplier_id);
