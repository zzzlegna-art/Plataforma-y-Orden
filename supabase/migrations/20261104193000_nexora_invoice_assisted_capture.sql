-- Lectura asistida de facturas · fuente privada, borrador revisable, sin entradas automáticas.
BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('nexora-invoices','nexora-invoices',false,10485760,
 ARRAY['application/pdf','image/jpeg','image/png']::text[])
ON CONFLICT(id) DO NOTHING;

CREATE TABLE public.nexora_invoice_drafts(
 id uuid primary key default gen_random_uuid(),
 source_path text not null unique,
 source_sha256 text not null unique check (source_sha256 ~ '^[a-f0-9]{64}$'),
 original_filename text not null check(length(original_filename) between 1 and 180),
 created_by uuid not null references public.bodega_profiles(id),
 created_at timestamptz not null default now(),
 supplier_name text not null default '',
 supplier_id uuid references public.suppliers(id),
 invoice_no text,
 invoice_date date,
 currency text not null default 'COP' check(currency in ('COP','USD','EUR','OTRA')),
 extracted_text text not null default '' check(length(extracted_text)<=35000),
 lines jsonb not null default '[]'::jsonb check(jsonb_typeof(lines)='array' and jsonb_array_length(lines)<=250),
 warnings jsonb not null default '[]'::jsonb check(jsonb_typeof(warnings)='array' and jsonb_array_length(warnings)<=100),
 status text not null default 'pending' check(status in ('pending','reviewed','prepared')),
 reviewed_by uuid references public.bodega_profiles(id),
 reviewed_at timestamptz,
 reception_id uuid unique references public.bodega_receptions(id),
 updated_by uuid references public.bodega_profiles(id),
 updated_at timestamptz not null default now(),
 check (
  (status='pending' and reviewed_at is null and reviewed_by is null and reception_id is null)
  or (status='reviewed' and reviewed_at is not null and reviewed_by is not null and reception_id is null)
  or (status='prepared' and reviewed_at is not null and reviewed_by is not null and reception_id is not null)
 )
);
CREATE UNIQUE INDEX nexora_invoice_supplier_number_uniq ON public.nexora_invoice_drafts
 (supplier_id,lower(btrim(invoice_no)))
 WHERE supplier_id IS NOT NULL AND invoice_no IS NOT NULL AND btrim(invoice_no)<>'';

ALTER TABLE public.nexora_invoice_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY nexora_invoice_drafts_read ON public.nexora_invoice_drafts
 FOR SELECT TO authenticated USING (public.bodega_is_staff());
CREATE POLICY nexora_invoice_drafts_insert ON public.nexora_invoice_drafts
 FOR INSERT TO authenticated
 WITH CHECK (public.bodega_is_staff() AND created_by=auth.uid()
    AND status='pending' AND source_path LIKE auth.uid()::text||'/%');
CREATE POLICY nexora_invoice_drafts_review ON public.nexora_invoice_drafts
 FOR UPDATE TO authenticated USING (public.bodega_is_admin())
 WITH CHECK (public.bodega_is_admin());
REVOKE ALL ON public.nexora_invoice_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.nexora_invoice_drafts TO authenticated;
GRANT UPDATE(supplier_name,supplier_id,invoice_no,invoice_date,currency,
  extracted_text,lines,warnings,updated_at,updated_by)
  ON public.nexora_invoice_drafts TO authenticated;

CREATE FUNCTION nexora_internal.invoice_draft_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
BEGIN
 IF tg_op='INSERT' THEN
  IF new.source_path NOT LIKE new.created_by::text||'/%'
     OR coalesce(new.status,'')<>'pending' THEN
   RAISE EXCEPTION 'Ruta o estado inicial de factura no autorizado.';
  END IF;
  new.updated_by:=auth.uid();
 ELSE
  IF new.id IS DISTINCT FROM old.id OR new.created_by IS DISTINCT FROM old.created_by
   OR new.created_at IS DISTINCT FROM old.created_at
   OR new.source_path IS DISTINCT FROM old.source_path
   OR new.source_sha256 IS DISTINCT FROM old.source_sha256
   OR new.original_filename IS DISTINCT FROM old.original_filename THEN
    RAISE EXCEPTION 'No se pueden modificar los documentos originales.';
  END IF;
  IF old.status='prepared' THEN
    RAISE EXCEPTION 'Una recepción preparada no se vuelve a editar.';
  END IF;
  IF new.status=old.status AND
    (new.reviewed_by IS DISTINCT FROM old.reviewed_by
     OR new.reviewed_at IS DISTINCT FROM old.reviewed_at
     OR new.reception_id IS DISTINCT FROM old.reception_id) THEN
    RAISE EXCEPTION 'El cierre requiere el procedimiento administrativo.';
  END IF;
  IF new.status<>old.status AND
    not public.bodega_is_admin() THEN
    RAISE EXCEPTION 'Solo Administrador puede validar factura.';
  END IF;
  new.updated_by:=auth.uid();
  new.updated_at:=now();
 END IF;
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION nexora_internal.invoice_draft_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER nexora_invoice_guard BEFORE INSERT OR UPDATE
 ON public.nexora_invoice_drafts FOR EACH ROW EXECUTE FUNCTION nexora_internal.invoice_draft_guard();

CREATE POLICY nexora_invoice_document_read ON storage.objects
FOR SELECT TO authenticated
USING(bucket_id='nexora-invoices' AND public.bodega_is_staff());
CREATE POLICY nexora_invoice_document_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK(bucket_id='nexora-invoices' AND public.bodega_is_staff()
  AND (storage.foldername(name))[1]=auth.uid()::text
  AND storage.extension(name) IN ('pdf','jpg','jpeg','png'));
CREATE POLICY nexora_invoice_document_cleanup ON storage.objects
FOR DELETE TO authenticated
USING(bucket_id='nexora-invoices' AND public.bodega_is_staff()
  AND (storage.foldername(name))[1]=auth.uid()::text
  AND NOT EXISTS(SELECT 1 FROM public.nexora_invoice_drafts d WHERE d.source_path=name));

-- Validación solo por Administrador. La lectura OCR es una propuesta, no un costo aprobado.
CREATE FUNCTION nexora_internal.finalize_invoice_draft(p_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE v public.nexora_invoice_drafts%rowtype; v_line jsonb; v_code text;v_receipt uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.bodega_is_admin() THEN
  RAISE EXCEPTION 'Solo Administrador puede revisar y preparar facturas.';
 END IF;
 IF p_action NOT IN ('approve','prepare') THEN
  RAISE EXCEPTION 'Acción de factura inválida.';
 END IF;
 SELECT * INTO v FROM public.nexora_invoice_drafts WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada.';END IF;
 IF v.supplier_id IS NULL OR nullif(btrim(v.invoice_no),'') IS NULL
   OR jsonb_array_length(v.lines)=0 THEN
  RAISE EXCEPTION 'Completa proveedor, número y referencias antes de validar.';
 END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(v.lines) LOOP
   IF jsonb_typeof(v_line)<>'object'
    OR nullif(v_line->>'productId','') IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.bodega_products prod
      WHERE prod.id=(v_line->>'productId')::uuid AND prod.is_active)
    OR coalesce((v_line->>'quantity')::numeric,0)<=0
    OR floor((v_line->>'quantity')::numeric)<>(v_line->>'quantity')::numeric
    OR coalesce((v_line->>'unitCost')::numeric,0)<=0 THEN
      RAISE EXCEPTION 'Cada referencia y costo debe ser revisado por Administrador.';
   END IF;
 END LOOP;
 IF p_action='approve' THEN
  IF v.status<>'pending' THEN RAISE EXCEPTION 'Factura ya revisada.';END IF;
  UPDATE public.nexora_invoice_drafts SET status='reviewed',
    reviewed_by=auth.uid(),reviewed_at=now()
    WHERE id=v.id;
  RETURN jsonb_build_object('id',v.id,'status','reviewed');
 END IF;
 IF v.status='prepared' THEN
  RETURN jsonb_build_object('id',v.id,'status','prepared','receptionId',v.reception_id);
 END IF;
 IF v.status<>'reviewed' THEN RAISE EXCEPTION 'Revisa y aprueba primero la factura.';END IF;
 PERFORM pg_advisory_xact_lock(67230183);
 SELECT 'REC-'||lpad((coalesce(max(substring(code from '^REC-([0-9]+)$')::integer),0)+1)::text,5,'0')
 INTO v_code FROM public.bodega_receptions
 WHERE code ~ '^REC-[0-9]+$';
 INSERT INTO public.bodega_receptions(
  code,reference,status,notes,supplier_id,created_by,received_at)
 VALUES(v_code,v.invoice_no,'captura',
  'Factura asistida '||v.id::text||'. Verificar físicamente IMEI y cantidades antes de confirmar.',
  v.supplier_id,auth.uid(),now())
 RETURNING id INTO v_receipt;
 UPDATE public.nexora_invoice_drafts SET status='prepared',reception_id=v_receipt WHERE id=v.id;
 RETURN jsonb_build_object('id',v.id,'status','prepared','receptionId',v_receipt,'receptionCode',v_code);
END $$;
REVOKE ALL ON FUNCTION nexora_internal.finalize_invoice_draft(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION nexora_internal.finalize_invoice_draft(uuid,text) TO authenticated;
CREATE FUNCTION public.nexora_invoice_finalize(p_id uuid,p_action text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public
AS $$ SELECT nexora_internal.finalize_invoice_draft(p_id,p_action); $$;
REVOKE ALL ON FUNCTION public.nexora_invoice_finalize(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nexora_invoice_finalize(uuid,text) TO authenticated;
COMMIT;