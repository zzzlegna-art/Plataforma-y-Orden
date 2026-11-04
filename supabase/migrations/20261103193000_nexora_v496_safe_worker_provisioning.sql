-- NEXORA V4.9.6: preparación segura de cuentas Encargado/Vendedor.
-- Migración ADITIVA. No crea cuentas, no activa ventas ni cambia usuarios existentes.
-- Un usuario preparado conserva bodega_profiles.role='bodeguero' SOLO para
-- compatibilidad del esquema legacy, pero nunca recibe permisos de bodeguero.
-- La marca auth.users.raw_app_meta_data es inmutable para clientes normales.
create or replace function public.bodega_is_staff()
returns boolean language sql stable security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1 from public.bodega_profiles p
    join auth.users au on au.id=p.id
    where p.id=auth.uid() and p.is_active
      and p.role in ('admin','bodeguero')
      and coalesce(au.raw_app_meta_data->>'nexora_prepared_role','')
        not in ('encargado','vendedor')
      and not exists(
        select 1 from public.nexora_staff_role_plans rp
        where rp.user_id=p.id and rp.operationally_enabled
          and rp.planned_role in ('encargado','vendedor')
      )
  );
$$;
comment on function public.bodega_is_staff() is
  'No concede acceso legacy a cuentas Encargado/Vendedor preparadas, ni siquiera antes de activar su rol. Marca en app_metadata solo modificable desde Auth Admin.';

-- Admin puede preparar un empleado NO ACTIVO que nació con metadata protegida.
-- El sistema sigue SIN permitir el valor operationally_enabled=true.
create or replace function public.nexora_validate_role_plan()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare
  v_role text;
  v_active boolean;
  v_auth_role text;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede preparar roles multisede.';
  end if;
  select p.role,p.is_active,au.raw_app_meta_data->>'nexora_prepared_role'
  into v_role,v_active,v_auth_role
  from public.bodega_profiles p
  join auth.users au on au.id=p.id where p.id=new.user_id;
  if not found or v_role<>'bodeguero' then
    raise exception 'Selecciona un perfil de trabajador no administrador.';
  end if;
  if v_auth_role in ('encargado','vendedor') then
    if new.planned_role<>v_auth_role then
      raise exception 'El rol preparado debe coincidir con el rol protegido de Auth.';
    end if;
  elsif not v_active then
    raise exception 'Solo se preparan cuentas activas, salvo trabajadores nuevos protegidos.';
  end if;
  if tg_op='UPDATE' then
    if new.user_id is distinct from old.user_id or
       new.created_at is distinct from old.created_at or
       new.created_by is distinct from old.created_by then
      raise exception 'No puedes alterar la identidad del rol preparado.';
    end if;
    if old.operationally_enabled then
      raise exception 'No cambies un perfil activo desde planificación.';
    end if;
  else
    new.created_at:=now();
    new.created_by:=auth.uid();
  end if;
  if new.operationally_enabled then
    raise exception 'La activación requiere la función de lanzamiento validada.';
  end if;
  new.operationally_enabled:=false;
  new.updated_at:=now();
  new.updated_by:=auth.uid();
  return new;
end;
$$;
revoke all on function public.nexora_validate_role_plan()
from public,anon,authenticated;

-- Auditoría: las cuentas nuevas no se crean con privilegios activos.
-- Esta migración NO habilita todavía el inicio de sesión del trabajador.
