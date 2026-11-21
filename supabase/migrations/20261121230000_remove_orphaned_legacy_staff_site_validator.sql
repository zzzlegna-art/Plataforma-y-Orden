-- Retira el validador heredado de asignaciones multisedes.
-- La tabla nexora_staff_sites conserva su trigger vigente:
-- nexora_internal.validate_staff_site_pending(), que restringe las asignaciones
-- a Bodega 6A y valida los perfiles preparados.
-- No se eliminan asignaciones ni eventos históricos.
drop function if exists public.nexora_validate_staff_site();
