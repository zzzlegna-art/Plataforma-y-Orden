-- Nexora: imágenes de portada del catálogo.
-- Las imágenes son públicas para poder mostrarlas en el inventario; solo el personal
-- autenticado y activo puede subirlas o eliminarlas. No modifica unidades ni movimientos.

alter table public.bodega_products
  add column if not exists image_url text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_upload on storage.objects;
create policy product_images_upload
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and public.bodega_is_staff()
  );

drop policy if exists product_images_delete on storage.objects;
create policy product_images_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.bodega_is_staff()
  );
