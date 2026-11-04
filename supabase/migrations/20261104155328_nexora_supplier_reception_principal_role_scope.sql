-- Nexora V4: las compras a proveedores se reciben exclusivamente en sede principal.
-- Administrador: acceso global a la operación de recepción central.
-- Bodeguero: requiere asignación ACTIVA a la sede principal ACTIVA.
-- Encargado/Vendedor: nunca están autorizados, aunque su perfil legacy sea bodeguero.
-- Esta regla no altera las confirmaciones de traslados entre sedes.
create or replace function public.nexora_supplier_reception_access()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.nexora_sites principal
      where principal.site_type='principal' and principal.is_active
    )
    and (
      public.bodega_is_admin()
      or (
        public.bodega_is_staff()
        and exists (
          select 1 from public.nexora_staff_sites assigned
          join public.nexora_sites principal on principal.id=assigned.site_id
          where assigned.user_id=auth.uid()
            and assigned.is_active
            and principal.is_active
            and principal.site_type='principal'
        )
      )
    );
$$;
revoke all on function public.nexora_supplier_reception_access() from public, anon, authenticated;
grant execute on function public.nexora_supplier_reception_access() to authenticated;
comment on function public.nexora_supplier_reception_access() is
  'Acceso de proveedor exclusivamente a Bodega 6A/sede principal: Admin o Bodeguero con asignación activa. No se usa para traslados intersede.';

drop policy if exists bodega_receptions_all on public.bodega_receptions;
create policy bodega_receptions_all on public.bodega_receptions
  for all to authenticated
  using ((select public.nexora_supplier_reception_access()))
  with check ((select public.nexora_supplier_reception_access()));

drop policy if exists bodega_reception_items_all on public.bodega_reception_items;
create policy bodega_reception_items_all on public.bodega_reception_items
  for all to authenticated
  using ((select public.nexora_supplier_reception_access()))
  with check ((select public.nexora_supplier_reception_access()));

-- No se pueden crear unidades por la API desde sedes no autorizadas.
-- Administrador conserva sus tareas autorizadas, sin modificar costos históricos.
drop policy if exists bodega_units_insert on public.bodega_units;
create policy bodega_units_insert on public.bodega_units
  for insert to authenticated
  with check ((select public.nexora_supplier_reception_access()));

drop policy if exists nexora_invoice_drafts_insert on public.nexora_invoice_drafts;
create policy nexora_invoice_drafts_insert on public.nexora_invoice_drafts
  for insert to authenticated
  with check (
    (select public.nexora_supplier_reception_access())
    and created_by=(select auth.uid())
    and status='pending'
    and source_path like (select auth.uid())::text||'/%'
  );

drop policy if exists nexora_invoice_drafts_read on public.nexora_invoice_drafts;
create policy nexora_invoice_drafts_read on public.nexora_invoice_drafts
  for select to authenticated
  using ((select public.nexora_supplier_reception_access()));

-- Los documentos de factura obedecen la misma sede/rol que su registro.
drop policy if exists nexora_invoice_document_insert on storage.objects;
create policy nexora_invoice_document_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id='nexora-invoices'
    and (select public.nexora_supplier_reception_access())
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and storage.extension(name) in ('pdf','jpg','jpeg','png')
  );
drop policy if exists nexora_invoice_document_read on storage.objects;
create policy nexora_invoice_document_read on storage.objects
  for select to authenticated
  using (
    bucket_id='nexora-invoices'
    and (select public.nexora_supplier_reception_access())
  );
drop policy if exists nexora_invoice_document_cleanup on storage.objects;
create policy nexora_invoice_document_cleanup on storage.objects
  for delete to authenticated
  using (
    bucket_id='nexora-invoices'
    and (select public.nexora_supplier_reception_access())
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and not exists (
      select 1 from public.nexora_invoice_drafts d where d.source_path=objects.name
    )
  );
