-- NEXORA V4.9.6: prueba de seguridad con perfiles ficticios.
\set ON_ERROR_STOP on
reset role;
-- Reutiliza el usuario bodeguero de ensayo (no modifica una cuenta real).
update auth.users set raw_app_meta_data=
  '{"nexora_prepared_role":"encargado"}'::jsonb
where id='11111111-1111-4111-8111-111111111111';
-- Reproduce una cuenta preparada sin activar, con perfil legacy existente.
update public.nexora_staff_role_plans
 set operationally_enabled=false
where user_id='11111111-1111-4111-8111-111111111111';

-- Incluso si accidentalmente estuviera activa como 'bodeguero',
-- la marca SOLO de Auth Admin le quita todos los permisos legacy.
select set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
do $verify$
begin
 if public.bodega_is_staff() then
   raise exception 'Fuga crítica: trabajador preparado heredó permisos de Bodega';
 end if;
end
$verify$;

-- Un trabajador ordinario ajeno a la preparación sigue pudiendo operar
-- exclusivamente bajo la política legacy, sin romper el sistema existente.
select set_config('test.uid','22222222-2222-4222-8222-222222222222',false);
do $verify$
begin
 if not public.bodega_is_staff() then
   raise exception 'Bodeguero normal perdió permisos durante la transición';
 end if;
end
$verify$;

select set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
do $verify$
declare denied boolean:=false;
begin
 begin
   update public.bodega_profiles set role='admin'
   where id='11111111-1111-4111-8111-111111111111';
 exception when others then
   if position('no pueden heredar Administrador' in sqlerrm)>0
     then denied:=true;
   else raise; end if;
 end;
 if not denied then
   raise exception 'Cuenta preparada elevada a Administrador';
 end if;
end
$verify$;
update public.bodega_profiles set is_active=false
where id='11111111-1111-4111-8111-111111111111';

do $verify$
declare denied boolean:=false;
begin
 begin
   update public.bodega_profiles set is_active=true
   where id='11111111-1111-4111-8111-111111111111';
 exception when others then
   if position('Primero activa el perfil operativo' in sqlerrm)>0
      then denied:=true;
   else raise; end if;
 end;
 if not denied then
   raise exception 'Se reactivó cuenta pendiente sin autorización';
 end if;
end
$verify$;

select 'OK: Encargado/Vendedor preparado no es Bodeguero ni Administrador' as result;
