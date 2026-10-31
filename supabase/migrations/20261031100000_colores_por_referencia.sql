-- Variantes por color: UNA referencia, diferentes costos y precios.
-- Columnas opcionales, registros existentes intactos y sin modificar permisos/RLS.
ALTER TABLE public.bodega_products ADD COLUMN IF NOT EXISTS color_variants jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.bodega_reception_items ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE public.bodega_units ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE public.bodega_order_items ADD COLUMN IF NOT EXISTS color text;
COMMENT ON COLUMN public.bodega_products.color_variants IS 'Colores asociados a la referencia, con costo y precio de venta sugerido por color';
COMMENT ON COLUMN public.bodega_units.color IS 'Color real del equipo por IMEI, preservado desde la recepcion';
COMMENT ON COLUMN public.bodega_order_items.color IS 'Color solicitado para la linea del pedido; NULL para lineas historicas o productos sin variantes';
