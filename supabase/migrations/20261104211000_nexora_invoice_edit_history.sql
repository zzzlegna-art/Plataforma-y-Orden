-- Auditoría interna de correcciones de factura: sin nuevas pantallas ni stock.
BEGIN;
CREATE TABLE public.nexora_invoice_edit_events (
 id bigint generated always as identity primary key,
 draft_id uuid not null references public.nexora_invoice_drafts(id) on delete restrict,
 actor_id uuid not null references public.bodega_profiles(id) on delete restrict,
 occurred_at timestamptz not null default now(),
 before_data jsonb not null,
 after_data jsonb not null
);
ALTER TABLE public.nexora_invoice_edit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY nexora_invoice_edit_events_admin_read ON public.nexora_invoice_edit_events
 FOR SELECT TO authenticated USING ((select public.bodega_is_admin()));
REVOKE ALL ON public.nexora_invoice_edit_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.nexora_invoice_edit_events TO authenticated;
CREATE FUNCTION nexora_internal.audit_invoice_draft_edit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE v_old jsonb;v_new jsonb;
BEGIN
 v_old:=jsonb_build_object('supplierName',old.supplier_name,'supplierId',old.supplier_id,
  'invoiceNo',old.invoice_no,'invoiceDate',old.invoice_date,'currency',old.currency,
  'lines',old.lines,'warnings',old.warnings,'extractedText',old.extracted_text,
  'status',old.status,'receptionId',old.reception_id);
 v_new:=jsonb_build_object('supplierName',new.supplier_name,'supplierId',new.supplier_id,
  'invoiceNo',new.invoice_no,'invoiceDate',new.invoice_date,'currency',new.currency,
  'lines',new.lines,'warnings',new.warnings,'extractedText',new.extracted_text,
  'status',new.status,'receptionId',new.reception_id);
 IF v_old IS DISTINCT FROM v_new THEN
  INSERT INTO public.nexora_invoice_edit_events(draft_id,actor_id,before_data,after_data)
  VALUES(new.id,auth.uid(),v_old,v_new);
 END IF;
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION nexora_internal.audit_invoice_draft_edit()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER nexora_invoice_edits_audit AFTER UPDATE
 ON public.nexora_invoice_drafts FOR EACH ROW
 EXECUTE FUNCTION nexora_internal.audit_invoice_draft_edit();
COMMIT;