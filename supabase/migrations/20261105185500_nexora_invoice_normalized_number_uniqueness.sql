-- Nexora · prevención de facturas duplicadas con el mismo proveedor y número.
-- Ejemplo: FE-0091573, FE 0091573 y fe.0091573 representan la misma factura.
-- Mantiene la restricción anterior por SHA-256 y no modifica recepciones ni costos.
BEGIN;

-- Nunca fusionar ni borrar facturas históricas automáticamente. Ante duplicados
-- preexistentes la migración se detiene y exige revisión humana.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.nexora_invoice_drafts d
    WHERE d.supplier_id IS NOT NULL
      AND NULLIF(btrim(d.invoice_no),'') IS NOT NULL
      AND regexp_replace(upper(btrim(d.invoice_no)), '[^A-Z0-9]', '', 'g') <> ''
    GROUP BY d.supplier_id, regexp_replace(upper(btrim(d.invoice_no)), '[^A-Z0-9]', '', 'g')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Hay facturas con igual proveedor y número normalizado. Revisar registros antes de aplicar el índice único.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS nexora_invoice_supplier_normalized_number_uniq
ON public.nexora_invoice_drafts (
  supplier_id,
  regexp_replace(upper(btrim(invoice_no)), '[^A-Z0-9]', '', 'g')
)
WHERE supplier_id IS NOT NULL
  AND NULLIF(btrim(invoice_no),'') IS NOT NULL
  AND regexp_replace(upper(btrim(invoice_no)), '[^A-Z0-9]', '', 'g') <> '';

COMMIT;
