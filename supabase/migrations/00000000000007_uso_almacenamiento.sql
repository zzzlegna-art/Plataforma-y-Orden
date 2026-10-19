-- ============================================================
-- Nexora (migración histórica) :: uso de almacenamiento
--
-- Un solo número por parte, para mostrar en Administración cuánto se lleva usado del plan
-- gratuito de Supabase (1 GB de archivos, 500 MB de base de datos): así se puede avisar antes
-- de llegar al límite, en vez de encontrarlo cuando algo deja de funcionar.
--
-- Es aditiva: solo agrega una función de lectura. No cambia nada existente.
-- ============================================================

create or replace function public.bodega_uso_almacenamiento()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_documentos_bytes bigint;
  v_documentos_count bigint;
begin
  if not public.bodega_is_staff() then
    raise exception 'BODEGA_SIN_PERMISO';
  end if;

  select coalesce(sum(size_bytes), 0), count(*)
    into v_documentos_bytes, v_documentos_count
    from public.bodega_documents;

  return jsonb_build_object(
    'documentos_bytes', v_documentos_bytes,
    'documentos_count', v_documentos_count,
    'base_datos_bytes', pg_database_size(current_database())
  );
end;
$$;

revoke all on function public.bodega_uso_almacenamiento() from public, anon;
grant execute on function public.bodega_uso_almacenamiento() to authenticated;
