-- Integración real de activación con permisos legacy revocados.
\set ON_ERROR_STOP on
select set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
set role authenticated;
-- Preparar una cuenta de Vendedor sin asignación a local: prohibida su activación.
reset role;
update auth.users set raw_app_meta_data='{"nexora_prepared_role":"vendedor"}'
where id='22222222-2222-4222-8222-222222222222';
update public.bodega_profiles set is_active=false
where id='22222222-2222-4222-8222-222222222222';
set role authenticated;
insert into public.nexora_staff_role_plans(user_id,planned_role,operationally_enabled)
values('22222222-2222-4222-8222-222222222222','vendedor',false);
do $test$
declare denied boolean:=false;
begin
 begin
  perform public.nexora_activate_worker(
    '22222222-2222-4222-8222-222222222222',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 exception when others then
  if position('única sede local' in sqlerrm)>0 then denied:=true;
  else raise;end if;
 end;
 if not denied then raise exception 'Vendedor sin sede fue activado';end if;
end
$test$;

-- La prueba anterior de concurrencia vinculó temporalmente al mismo
-- Encargado con el Local B. Desactivar ese vínculo de ensayo para que
-- el positivo de activación represente una sola sede, como exige Nexora.
reset role;
update public.nexora_staff_sites set is_active=false
where user_id='11111111-1111-4111-8111-111111111111'
  and site_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
set role authenticated;

-- Encargado preparado con sede, inventario aprobado y topes.
select public.nexora_activate_worker(
 '11111111-1111-4111-8111-111111111111',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

select set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
do $test$
declare v_session jsonb;v_snapshot jsonb;
begin
 if public.bodega_is_staff() then
   raise exception 'Encargado activo recibió permisos globales de Bodeguero';
 end if;
 v_session:=public.nexora_worker_session();
 if v_session is null or v_session->>'role'<>'encargado'
    or v_session->>'siteName'<>'Local A' then
   raise exception 'La sesión de Encargado no está correctamente restringida a Local A';
 end if;
 v_snapshot:=public.nexora_worker_site_snapshot();
 if (v_snapshot->>'assignedUnits')::integer<>0 then
   raise exception 'El portal inventó stock en el local';
 end if;
end
$test$;

select set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select public.nexora_deactivate_worker(
 '11111111-1111-4111-8111-111111111111');

select set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
do $test$
begin
 if public.nexora_worker_session() is not null then
   raise exception 'Trabajador desactivado conserva acceso';
 end if;
end
$test$;
select set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
do $test$
begin
 if (select count(*) from public.nexora_worker_activation_events
     where user_id='11111111-1111-4111-8111-111111111111')<>2 then
   raise exception 'Faltan eventos auditados de alta y baja';
 end if;
 if (select count(*) from public.nexora_staff_role_plans
     where operationally_enabled)<>0 then
   raise exception 'Un trabajador quedó activado después del ensayo';
 end if;
end
$test$;

select 'OK: solo Administrador activa, sede única, sin stock ficticio y baja auditada' result;
