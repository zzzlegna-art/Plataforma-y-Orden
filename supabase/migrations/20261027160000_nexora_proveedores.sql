-- Incorporar el catálogo de proveedores ya existente, sin alterar sus referencias.
-- RLS: personal activo puede ver y mantener; solo se desactiva, nunca se elimina.
alter table public.suppliers
  add column if not exists tax_id text,
  add column if not exists contact_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists notes text,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists suppliers_name_search_idx on public.suppliers (lower(name));
alter table public.suppliers enable row level security;

drop policy if exists nexora_suppliers_read on public.suppliers;
drop policy if exists nexora_suppliers_insert on public.suppliers;
drop policy if exists nexora_suppliers_update on public.suppliers;

create policy nexora_suppliers_read on public.suppliers
  for select to authenticated using (public.bodega_is_staff());
create policy nexora_suppliers_insert on public.suppliers
  for insert to authenticated with check (public.bodega_is_staff());
create policy nexora_suppliers_update on public.suppliers
  for update to authenticated
  using (public.bodega_is_staff()) with check (public.bodega_is_staff());
-- No DELETE: mantener histórico de proveedores usados en recepciones.
revoke delete on public.suppliers from authenticated;
grant select, insert, update on public.suppliers to authenticated;
