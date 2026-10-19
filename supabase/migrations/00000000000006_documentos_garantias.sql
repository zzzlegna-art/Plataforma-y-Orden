-- ============================================================
-- Nexora :: documentos de garantías
--
-- Guarda los PDF/fotos que el proveedor manda al recibir un lote de garantías (la hoja de
-- "relación" con varios IMEI). Un mismo archivo puede quedar enlazado a varias garantías (las
-- de un mismo lote), por eso son dos tablas: el documento en sí, y el enlace con cada
-- garantía.
--
-- Es aditiva: crea un bucket y dos tablas nuevas. No toca nada existente.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Espacio de almacenamiento. Privado: solo se accede con sesión (ver políticas abajo).
--    50 MB por archivo alcanza de sobra para un PDF o foto escaneada.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'warranty-documents',
  'warranty-documents',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists nexora_warranty_docs_storage_read on storage.objects;
create policy nexora_warranty_docs_storage_read
  on storage.objects for select to authenticated
  using (bucket_id = 'warranty-documents' and public.nexora_is_staff());
drop policy if exists nexora_warranty_docs_storage_insert on storage.objects;
create policy nexora_warranty_docs_storage_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'warranty-documents' and public.nexora_is_staff());
drop policy if exists nexora_warranty_docs_storage_delete on storage.objects;
create policy nexora_warranty_docs_storage_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'warranty-documents' and public.nexora_is_staff());

-- ------------------------------------------------------------
-- 2) El documento (un archivo subido).
-- ------------------------------------------------------------
create table if not exists public.nexora_documents (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  file_name text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid references public.nexora_profiles(id),
  created_at timestamptz not null default now()
);

alter table public.nexora_documents enable row level security;
grant select, insert, delete on public.nexora_documents to authenticated;
drop policy if exists nexora_documents_all on public.nexora_documents;
create policy nexora_documents_all on public.nexora_documents for all to authenticated
  using (public.nexora_is_staff()) with check (public.nexora_is_staff());

-- ------------------------------------------------------------
-- 3) Enlace documento ↔ garantía (varios a varios: un documento puede cubrir todo un lote).
-- ------------------------------------------------------------
create table if not exists public.nexora_warranty_documents (
  id uuid primary key default gen_random_uuid(),
  warranty_id uuid not null references public.nexora_warranties(id) on delete cascade,
  document_id uuid not null references public.nexora_documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (warranty_id, document_id)
);

create index if not exists nexora_warranty_documents_warranty_idx on public.nexora_warranty_documents(warranty_id);
create index if not exists nexora_warranty_documents_document_idx on public.nexora_warranty_documents(document_id);

alter table public.nexora_warranty_documents enable row level security;
grant select, insert, delete on public.nexora_warranty_documents to authenticated;
drop policy if exists nexora_warranty_documents_all on public.nexora_warranty_documents;
create policy nexora_warranty_documents_all on public.nexora_warranty_documents for all to authenticated
  using (public.nexora_is_staff()) with check (public.nexora_is_staff());
