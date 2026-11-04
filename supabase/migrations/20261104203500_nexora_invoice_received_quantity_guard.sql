-- Una factura asistida compara unidades físicas antes de confirmar la recepción.
-- No afecta recepciones manuales existentes ni crea stock por leer PDF/foto.
BEGIN;
CREATE FUNCTION nexora_internal.check_invoice_reception_quantities()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE
  v_invoice public.nexora_invoice_drafts%rowtype;
  v_mismatch integer;
BEGIN
 IF new.status<>'confirmada' OR old.status='confirmada' THEN RETURN new;END IF;
 SELECT * INTO v_invoice FROM public.nexora_invoice_drafts d
  WHERE d.reception_id=new.id AND d.status='prepared' LIMIT 1;
 IF NOT FOUND THEN RETURN new;END IF;
 WITH expected AS (
  SELECT (line->>'productId')::uuid AS product_id,
    sum((line->>'quantity')::integer) expected_count
  FROM jsonb_array_elements(v_invoice.lines) line GROUP BY 1
 ), received AS (
  SELECT product_id,count(*) actual_count FROM public.bodega_reception_items
   WHERE reception_id=new.id GROUP BY product_id
 ), diff AS (
  SELECT coalesce(e.product_id,r.product_id) product_id,
    coalesce(e.expected_count,0) expected_count,coalesce(r.actual_count,0) actual_count
  FROM expected e FULL JOIN received r ON r.product_id=e.product_id
 )
 SELECT count(*) INTO v_mismatch FROM diff WHERE expected_count<>actual_count;
 IF v_mismatch>0 AND NOT public.bodega_is_admin() THEN
   RAISE EXCEPTION 'Las cantidades físicas difieren de la factura. Solo Administrador puede cerrar con diferencias.';
 END IF;
 RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION nexora_internal.check_invoice_reception_quantities()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER nexora_invoice_reception_quantity_guard
 BEFORE UPDATE OF status ON public.bodega_receptions
 FOR EACH ROW EXECUTE FUNCTION nexora_internal.check_invoice_reception_quantities();
COMMIT;