-- Garantías: trazabilidad del acuerdo de devolución de dinero, sin alterar stock.
-- Aplicada en destino como versión 20261106063124. Los casos previos mantienen valores nulos.
ALTER TABLE public.bodega_warranties
  ADD COLUMN IF NOT EXISTS reembolso_acordado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reembolso_monto numeric(14,2),
  ADD COLUMN IF NOT EXISTS reembolso_metodo text,
  ADD COLUMN IF NOT EXISTS reembolso_referencia text,
  ADD COLUMN IF NOT EXISTS reembolso_pagado_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.bodega_warranties'::regclass AND conname='bodega_warranties_reembolso_pago_valido') THEN
    ALTER TABLE public.bodega_warranties ADD CONSTRAINT bodega_warranties_reembolso_pago_valido
    CHECK (
      (reembolso_monto IS NULL OR reembolso_monto > 0)
      AND (
        reembolso_pagado_at IS NULL OR (
          reembolso_acordado
          AND status = 'devuelto'
          AND reembolso_monto > 0
          AND nullif(btrim(reembolso_metodo), '') IS NOT NULL
          AND nullif(btrim(reembolso_referencia), '') IS NOT NULL
        )
      )
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS bodega_warranties_imei_manual_abierto_uniq
  ON public.bodega_warranties (lower(btrim(imei_manual)))
  WHERE imei_manual IS NOT NULL AND status IN ('recibido','en_servicio_tecnico','reenvio_pendiente');
CREATE UNIQUE INDEX IF NOT EXISTS bodega_warranties_unit_abierta_uniq
  ON public.bodega_warranties (unit_id)
  WHERE unit_id IS NOT NULL AND status IN ('recibido','en_servicio_tecnico','reenvio_pendiente');

COMMENT ON COLUMN public.bodega_warranties.reembolso_acordado
IS 'Reembolso acordado: NO implica pago realizado.';
COMMENT ON COLUMN public.bodega_warranties.reembolso_pagado_at
IS 'Fecha de confirmación manual del pago efectivo, documentado con monto, método y referencia.';
