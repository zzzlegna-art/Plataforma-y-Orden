-- Retira los dos directorios auxiliares que nacieron con el esquema de multisedes.
-- La búsqueda operativa y la hoja de vida completa de seriales permanecen en /seriales.
drop function if exists public.nexora_inventory_reference_summary(text, integer, integer);
drop function if exists public.nexora_inventory_imei_directory(text, uuid, text, integer, integer);
