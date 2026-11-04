-- Corrección de activación: sólo rol protegido + vínculo único a local activo.
-- No crea ni activa cuentas. No toca inventario, caja, ventas ni auditorías.
BEGIN;
CREATE OR REPLACE FUNCTION nexora_internal.activate_worker(p_user_id uuid, p_site_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_plan public.nexora_staff_role_plans%rowtype;
  v_staff public.bodega_profiles%rowtype;
  v_prepared text;
  v_count integer;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador activa trabajadores.';
  end if;
  perform pg_advisory_xact_lock(74628191,hashtext(p_user_id::text));
  select * into v_staff from public.bodega_profiles
   where id=p_user_id for update;
  select * into v_plan from public.nexora_staff_role_plans
   where user_id=p_user_id for update;
  select raw_app_meta_data->>'nexora_prepared_role' into v_prepared
   from auth.users where id=p_user_id;
  if not found or v_staff.id is null or v_plan.user_id is null or
     v_staff.role<>'bodeguero' or v_prepared not in ('encargado','vendedor')
     or v_plan.planned_role<>v_prepared or v_plan.operationally_enabled then
    raise exception 'Cuenta preparada inexistente, incompatible o ya activada.';
  end if;
  select count(*) into v_count from public.nexora_staff_sites ss
  join public.nexora_sites s on s.id=ss.site_id
  where ss.user_id=p_user_id and ss.is_active and s.is_active
    and s.site_type='local' and ss.site_id=p_site_id;
  if v_count<>1 or
     (select count(*) from public.nexora_staff_sites where user_id=p_user_id and is_active)<>1 then
    raise exception 'Asigna un único local activo al trabajador.';
  end if;
  -- Solo se valida identidad, rol y local; caja, existencias y ventas se autorizan al operar.
  update public.nexora_staff_role_plans
    set operationally_enabled=true where user_id=p_user_id;
  update public.bodega_profiles set is_active=true where id=p_user_id;
  return jsonb_build_object('userId',p_user_id,'siteId',p_site_id,
    'role',v_prepared,'activated',true);
end;
$function$;

CREATE OR REPLACE FUNCTION nexora_internal.worker_session()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_id uuid;v_role text;v_site uuid;v_site_name text;
begin
  v_id:=auth.uid();
  if v_id is null then return null; end if;
  select rp.planned_role,ss.site_id,s.name
    into v_role,v_site,v_site_name
  from public.bodega_profiles p
  join auth.users au on au.id=p.id
  join public.nexora_staff_role_plans rp on rp.user_id=p.id
  join public.nexora_staff_sites ss on ss.user_id=p.id
  join public.nexora_sites s on s.id=ss.site_id
  where p.id=v_id and p.is_active and p.role='bodeguero'
    and rp.operationally_enabled
    and rp.planned_role in ('encargado','vendedor')
    and au.raw_app_meta_data->>'nexora_prepared_role'=rp.planned_role
    and ss.is_active and s.is_active and s.site_type='local'
    and (select count(*) from public.nexora_staff_sites links
         where links.user_id=p.id and links.is_active)=1
  order by ss.created_at desc limit 1;
  if v_site is null then return null; end if;
  return jsonb_build_object('role',v_role,'siteId',v_site,'siteName',v_site_name);
end;
$function$;

CREATE OR REPLACE FUNCTION public.nexora_validate_role_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_role text;
  v_active boolean;
  v_prepared text;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador modifica los roles de Nexora.';
  end if;
  select p.role,p.is_active,au.raw_app_meta_data->>'nexora_prepared_role'
    into v_role,v_active,v_prepared
  from public.bodega_profiles p join auth.users au on au.id=p.id
  where p.id=new.user_id;
  if not found or v_role<>'bodeguero' then
    raise exception 'Selecciona una cuenta operativa no administradora.';
  end if;
  if v_prepared in ('encargado','vendedor') then
    if new.planned_role<>v_prepared then
      raise exception 'El rol debe coincidir con la identidad protegida de Auth.';
    end if;
  elsif not v_active or new.operationally_enabled then
    raise exception 'Los perfiles existentes no se convierten automáticamente en trabajadores.';
  end if;
  if tg_op='UPDATE' then
    if new.user_id is distinct from old.user_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'No cambies la identidad original del plan.';
    end if;
    if old.operationally_enabled and new.planned_role<>old.planned_role then
      raise exception 'Desactiva primero el rol si necesita cambiar el perfil.';
    end if;
  else
    new.created_by:=auth.uid();
    new.created_at:=now();
  end if;

  -- Contratación no depende de actas de inventario ni de topes de gastos.
  -- Esas verificaciones permanecen en las operaciones correspondientes.
  if new.operationally_enabled then
    if v_prepared not in ('encargado','vendedor') or
       (select count(*) from public.nexora_staff_sites ss
        join public.nexora_sites st on st.id=ss.site_id
        where ss.user_id=new.user_id and ss.is_active
          and st.is_active and st.site_type='local')<>1 or
       (select count(*) from public.nexora_staff_sites ss
        where ss.user_id=new.user_id and ss.is_active)<>1 then
      raise exception 'El trabajador necesita un único local activo asignado.';
    end if;
  end if;
  new.updated_by:=auth.uid();
  new.updated_at:=now();
  return new;
end;
$function$;
COMMIT;
