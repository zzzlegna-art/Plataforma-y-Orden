-- El perfil Encargado deja de existir. Se conserva la auditoría histórica.
-- El helper de personal vuelve a depender únicamente de los perfiles válidos actuales.
CREATE OR REPLACE FUNCTION public.bodega_is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.bodega_profiles p
    WHERE p.id = auth.uid() AND p.is_active AND p.role IN ('admin', 'bodeguero')
  );
$function$;

CREATE OR REPLACE FUNCTION nexora_internal.validate_staff_site_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_is_active boolean;
  v_profile_role text;
  v_root CONSTANT uuid := 'cf03b83a-a23f-4bd2-a778-2c071fa9df2e';
BEGIN
  IF auth.uid() IS NULL OR NOT public.bodega_is_admin() THEN
    RAISE EXCEPTION 'Solo Administrador puede gestionar el personal de Bodega 6A.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.site_id IS DISTINCT FROM OLD.site_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Una asignación no puede cambiar de persona ni de bodega.';
    END IF;
  ELSE
    NEW.created_by := auth.uid();
  END IF;
  IF NEW.is_active THEN
    SELECT p.is_active, p.role INTO v_is_active, v_profile_role
    FROM public.bodega_profiles p WHERE p.id = NEW.user_id;
    IF NOT FOUND OR NOT v_is_active OR v_profile_role NOT IN ('admin', 'bodeguero') THEN
      RAISE EXCEPTION 'La asignación requiere una cuenta activa de Administrador o Bodeguero.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.nexora_sites s
      WHERE s.id = NEW.site_id AND s.id = v_root AND s.is_active
        AND s.site_type = 'principal' AND s.name = 'Bodega 6A'
    ) THEN
      RAISE EXCEPTION 'El personal solo puede vincularse a Bodega 6A.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.nexora_staff_sites ss
      WHERE ss.user_id = NEW.user_id AND ss.is_active
        AND ss.id IS DISTINCT FROM NEW.id AND ss.site_id <> v_root
    ) THEN
      RAISE EXCEPTION 'El trabajador conserva una asignación activa fuera de Bodega 6A.';
    END IF;
  END IF;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS nexora_01_prepared_worker_profile_guard ON public.bodega_profiles;
DROP FUNCTION IF EXISTS nexora_internal.guard_prepared_worker_profile();

-- Políticas exclusivas de la sesión Encargado; las políticas administrativas permanecen.
DROP POLICY IF EXISTS nexora_cities_worker_read ON public.nexora_cities;
DROP POLICY IF EXISTS nexora_sites_worker_read ON public.nexora_sites;

-- Desvincular primero los triggers que auditaban los planes Encargado.
DROP TRIGGER IF EXISTS nexora_02_worker_enabled_audit ON public.nexora_staff_role_plans;
DROP TRIGGER IF EXISTS nexora_guard_staff_role_plan ON public.nexora_staff_role_plans;
DROP TRIGGER IF EXISTS nexora_role_plan_audit ON public.nexora_staff_role_plans;

DROP FUNCTION IF EXISTS public.nexora_activate_worker(uuid, uuid);
DROP FUNCTION IF EXISTS public.nexora_deactivate_worker(uuid);
DROP FUNCTION IF EXISTS public.nexora_worker_session();
DROP FUNCTION IF EXISTS public.nexora_worker_site_snapshot();
DROP FUNCTION IF EXISTS nexora_internal.activate_worker(uuid, uuid);
DROP FUNCTION IF EXISTS nexora_internal.deactivate_worker(uuid);
DROP FUNCTION IF EXISTS nexora_internal.worker_session();
DROP FUNCTION IF EXISTS nexora_internal.worker_site_snapshot();
DROP FUNCTION IF EXISTS nexora_internal.audit_worker_enabled_change();
DROP FUNCTION IF EXISTS nexora_internal.audit_role_plan();
DROP FUNCTION IF EXISTS public.nexora_validate_role_plan();

-- El plan operativo deja de existir; la bitácora de eventos no se elimina.
DROP TABLE IF EXISTS public.nexora_staff_role_plans;
DROP TABLE IF EXISTS public.nexora_worker_activation_events;

-- Eliminar el marcador Auth residual sin borrar ni desactivar las cuentas.
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) - 'nexora_prepared_role'
WHERE raw_app_meta_data->>'nexora_prepared_role' = 'encargado';
