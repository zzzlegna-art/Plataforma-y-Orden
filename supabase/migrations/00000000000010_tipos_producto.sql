-- ============================================================
-- Nexora :: tipos de producto administrables
--
-- El "Tipo de producto" (celular/tablet/reloj/audífono/repuesto) estaba fijo en el código:
-- agregar uno nuevo (como pasó con "audífono") requería un cambio de código. Ahora vive en una
-- tabla que se administra desde la app (Administración), sin tocar código para agregar uno.
--
-- Cada tipo define a qué grupo de clientes mayoristas pertenece (celulares o repuestos, ver
-- nexora_customers.categoria_mayorista), para que un tipo nuevo participe igual que los que ya
-- había en el filtro de compatibilidad al armar un pedido.
--
-- "repuesto" sigue siendo el único tipo sin condición nuevo/seminuevo (se entra por cantidad,
-- sin serial): eso queda igual, fijo en el código (src/lib/products.ts), no es configurable
-- por ahora. Todo tipo nuevo que se cree desde la app sí maneja nuevo/seminuevo, como celular.
--
-- Es aditiva y no cambia ningún producto existente: los 5 tipos de hoy quedan como las primeras
-- filas de la tabla, con el mismo comportamiento que ya tenían.
-- ============================================================

create table if not exists public.nexora_product_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  mayorista_group text not null check (mayorista_group in ('celulares', 'repuestos')),
  created_at timestamptz not null default now()
);

alter table public.nexora_product_types enable row level security;
grant select, insert, update, delete on public.nexora_product_types to authenticated;
drop policy if exists nexora_product_types_read on public.nexora_product_types;
create policy nexora_product_types_read on public.nexora_product_types for select to authenticated
  using (public.nexora_is_staff());
drop policy if exists nexora_product_types_write on public.nexora_product_types;
create policy nexora_product_types_write on public.nexora_product_types for all to authenticated
  using (public.nexora_is_admin()) with check (public.nexora_is_admin());

insert into public.nexora_product_types (key, name, mayorista_group) values
  ('celular', 'Celulares', 'celulares'),
  ('tablet', 'Tablets', 'celulares'),
  ('reloj', 'Relojes', 'celulares'),
  ('audifono', 'Audífonos', 'celulares'),
  ('repuesto', 'Repuestos', 'repuestos')
on conflict (key) do nothing;

-- El tipo ya no es una lista fija de 5 valores: ahora cualquier "key" que exista en
-- nexora_product_types es válido (ver el FK de abajo), y la lista se administra desde la app.
alter table public.nexora_products drop constraint if exists nexora_products_categoria_check;

do $$
begin
  alter table public.nexora_products
    add constraint nexora_products_categoria_fkey
    foreign key (categoria) references public.nexora_product_types (key);
exception
  when duplicate_object then null;
end $$;
