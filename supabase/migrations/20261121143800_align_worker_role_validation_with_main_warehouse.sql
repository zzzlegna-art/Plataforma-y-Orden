create or replace function public.nexora_validate_role_plan()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_role text;
  v_active boolean;
  v_prepared text;
  v_root constant uuid := 'cf03b83a-a23f-4bd2-a778-2c071fa9df2e';
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador modifica los roles de Nexora.';
  end if;

  select p.role, p.is_active, au.raw_app_meta_data->>'nexora_prepared_role'
    into v_role, v_active, v_prepared
  from public.bodega_profiles p
  join auth.users au on au.id = p.id
  where p.id = new.user_id;

  if not found or v_role <> 'bodeguero' then
    raise exception 'Selecciona una cuenta operativa no administradora.';
  end if;

  if v_prepared in ('encargado', 'vendedor') then
    if new.planned_role <> v_prepared then
      raise exception 'El rol debe coincidir con la identidad protegida de Auth.';
    end if;
  elsif not v_active or new.operationally_enabled then
    raise exception 'Los perfiles existentes no se convierten automáticamente en trabajadores.';
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'No cambies la identidad original del plan.';
    end if;
    if old.operationally_enabled and new.planned_role <> old.planned_role then
      raise exception 'Desactiva primero el rol si necesita cambiar el perfil.';
    end if;
  else
    new.created_by := auth.uid();
    new.created_at := now();
  end if;

  -- La única ubicación operativa autorizada es Bodega 6A.
  -- La validación debe coincidir con nexora_internal.activate_worker().
  if new.operationally_enabled then
    if v_prepared not in ('encargado', 'vendedor')
       or (
         select count(*)
         from public.nexora_staff_sites ss
         join public.nexora_sites st on st.id = ss.site_id
         where ss.user_id = new.user_id
           and ss.is_active
           and ss.site_id = v_root
           and st.is_active
           and st.site_type = 'principal'
           and st.name = 'Bodega 6A'
       ) <> 1
       or (
         select count(*)
         from public.nexora_staff_sites ss
         where ss.user_id = new.user_id and ss.is_active
       ) <> 1 then
      raise exception 'El trabajador necesita una única asignación activa a Bodega 6A.';
    end if;
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$function$;
