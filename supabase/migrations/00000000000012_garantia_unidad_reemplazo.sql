-- ============================================================
-- Bodega 6A :: unidad de reemplazo elegida en el diagnóstico de garantía
--
-- Cuando el diagnóstico resuelve "cambio", ahora se pide en ese momento el serial del equipo
-- que se entregará al cliente y queda guardado en el caso. Antes solo se pedía al entregar y,
-- en las garantías previas (sin producto en el sistema), nunca había unidades para elegir.
-- ============================================================

alter table public.bodega_warranties
  add column if not exists replacement_unit_id uuid references public.bodega_units(id) on delete set null;
