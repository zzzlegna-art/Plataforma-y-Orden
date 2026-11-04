-- Nexora: permitir asignar local a cuentas Encargado/Vendedor protegidas e inactivas.
-- Se creó y probó en Supabase productivo; no muta cuentas ni asignaciones existentes.
BEGIN;
CREATE OR REPLACE FUNCTION nexora_internal.validate_staff_site_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_is_active boolean;
  v_profile_role text;
  v_marker text;
  v_plan_role text;
  v_enabled boolean;
  v_prepared boolean;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede gestionar el personal de las sedes.';
  end if;
  if tg_op='UPDATE' then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.site_id is distinct from old.site_id
      or new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by then
      raise exception 'Una asignación no puede cambiar de persona ni de sede.';
    end if;
  else
    new.created_by:=auth.uid();
  end if;
  if new.is_active then
    select p.is_active,p.role,au.raw_app_meta_data->>'nexora_prepared_role',
           rp.planned_role,rp.operationally_enabled
      into v_is_active,v_profile_role,v_marker,v_plan_role,v_enabled
    from public.bodega_profiles p
      left join auth.users au on au.id=p.id
      left join public.nexora_staff_role_plans rp on rp.user_id=p.id
    where p.id=new.user_id;
    if not found then
      raise exception 'No existe el empleado seleccionado.';
    end if;
    v_prepared := not v_is_active
      and v_profile_role='bodeguero'
      and v_marker in ('encargado','vendedor')
      and v_plan_role=v_marker
      and v_enabled is false;
    if not v_is_active and not coalesce(v_prepared,false) then
      raise exception 'El usuario debe estar activo o ser un Encargado/Vendedor pendiente válido.';
    end if;
    if not exists (
      select 1 from public.nexora_sites s where s.id=new.site_id
        and s.is_active and (not coalesce(v_prepared,false) or s.site_type='local')
    ) then
      raise exception 'Selecciona un local activo para el trabajador pendiente.';
    end if;
    -- Impedir dos locales simultáneos para una cuenta todavía pendiente.
    if coalesce(v_prepared,false) and exists(
      select 1 from public.nexora_staff_sites ss
      where ss.user_id=new.user_id and ss.is_active
        and ss.id is distinct from new.id
    ) then
      raise exception 'La cuenta pendiente debe estar vinculada a un solo local.';
    end if;
  end if;
  new.updated_by:=auth.uid();
  new.updated_at:=now();
  return new;
end
$function$;
REVOKE ALL ON FUNCTION nexora_internal.validate_staff_site_pending()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS nexora_staff_sites_validate ON public.nexora_staff_sites;
CREATE TRIGGER nexora_staff_sites_validate
 BEFORE INSERT OR UPDATE ON public.nexora_staff_sites
 FOR EACH ROW EXECUTE FUNCTION nexora_internal.validate_staff_site_pending();
COMMIT;
