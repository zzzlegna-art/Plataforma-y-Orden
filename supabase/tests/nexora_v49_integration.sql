-- CI Postgres 17: integración real contra la migración original de caja
-- y las dos migraciones V4.9. No hay datos ni credenciales de producción.
\set ON_ERROR_STOP on

-- Solo entidades falsas en una instancia efímera.
insert into auth.users(id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
insert into public.bodega_profiles(id,role,email) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin','admin@example.invalid'),
 ('11111111-1111-4111-8111-111111111111','bodeguero','manager@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','bodeguero','other@example.invalid');
insert into public.nexora_cities(id,name) values
 ('99999999-9999-4999-8999-999999999999','Ciudad de prueba');
insert into public.nexora_sites(id,city_id,name,site_type,parent_site_id) values
 ('77777777-7777-4777-8777-777777777777',
  '99999999-9999-4999-8999-999999999999','Bodega central','principal',null),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '99999999-9999-4999-8999-999999999999','Local A','local',
  '77777777-7777-4777-8777-777777777777'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '99999999-9999-4999-8999-999999999999','Local B','local',
  '77777777-7777-4777-8777-777777777777');

-- Rol de Encargado ACTIVADO solo en datos de prueba para comprobar el futuro flujo;
-- en producción sigue deshabilitado hasta completar los demás controles.
insert into public.nexora_staff_role_plans(user_id,planned_role,operationally_enabled)
values ('11111111-1111-4111-8111-111111111111','encargado',true);
insert into public.nexora_staff_sites(user_id,site_id)
values ('11111111-1111-4111-8111-111111111111',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

select set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
set role authenticated;

-- Ningún local ni monto debe venir pre-aprobado.
do $$
begin
 if (select count(*) from public.nexora_local_initial_approvals)<>0 then
   raise exception 'Firma local automática';
 end if;
 if (select count(*) from public.nexora_cash_limits)<>0 then
   raise exception 'Montos predeterminados no autorizados';
 end if;
end $$;

-- La aprobación local requiere primero el acta global.
do $$
declare denied boolean:=false;
begin
 begin
   perform public.nexora_approve_local_initial(
     'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','APROBAR',
     'Conteo físico de prueba: cero unidades iniciales');
 exception when others then
   if position('acta central aprobada' in sqlerrm)>0 then denied:=true;
   else raise; end if;
 end;
 if not denied then raise exception 'Se permitió firma sin acta global'; end if;
end $$;

-- La caja tampoco puede abrirse antes de la aprobación global.
do $$
declare denied boolean:=false;
begin
 begin
  perform public.nexora_cash_operation(
   'open','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',10000,null);
 exception when others then
  if position('Aprueba primero' in sqlerrm)>0 then denied:=true;
  else raise; end if;
 end;
 if not denied then raise exception 'Caja abierta sin acta global'; end if;
end $$;

reset role;
-- Acta global ficticia y una unidad inventada exclusivamente en CI.
-- No se simula que las unidades de los locales hayan sido escaneadas.
insert into public.bodega_units(id) values
 ('66666666-6666-4666-8666-666666666666');
insert into public.nexora_initial_inventory_approvals
 (id,approved_by,unit_count) values
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1);
insert into public.nexora_initial_unit_sites
 (unit_id,site_id,approval_id,serial_snapshot,status_snapshot) values
 ('66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','TEST-SERIAL','en_bodega');

set role authenticated;
-- Incluso con la global, la apertura de un local sin su acta queda bloqueada.
do $$
declare denied boolean:=false;
begin
 begin
  perform public.nexora_cash_operation(
   'open','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',10000,null);
 exception when others then
  if position('sin aprobacion administrativa' in sqlerrm)>0 then denied:=true;
  else raise; end if;
 end;
 if not denied then raise exception 'Caja abierta sin acta local'; end if;
end $$;

-- El usuario no administrador no firma ni configura montos.
select set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
do $$
declare denied boolean:=false;
begin
 begin
   perform public.nexora_approve_local_initial(
     'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','APROBAR',
     'Intento de un Encargado no autorizado');
 exception when others then
   if position('Solo Administrador' in sqlerrm)>0 then denied:=true;
   else raise; end if;
 end;
 if not denied then raise exception 'Usuario no administrador aprobó un local'; end if;
 denied:=false;
 begin
  perform public.nexora_set_cash_limits(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',3000,5000);
 exception when others then
  if position('Solo Administrador' in sqlerrm)>0 then denied:=true;
  else raise; end if;
 end;
 if not denied then raise exception 'Usuario no administrador definió montos'; end if;
end $$;

-- Admin firma dos locales, ambos explícitamente con 0 equipos; no inventa stock.
select set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select public.nexora_approve_local_initial(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','APROBAR',
 'Local A vacío: inventario inicial revisado');
select public.nexora_approve_local_initial(
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','APROBAR',
 'Local B vacío: inventario inicial revisado');

-- Firma duplicada rechazada.
do $$
declare denied boolean:=false;
begin
 begin
  perform public.nexora_approve_local_initial(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','APROBAR',
    'Segundo intento de firma del local');
 exception when others then
  if position('ya tiene su acta inicial' in sqlerrm)>0 then denied:=true;
  else raise; end if;
 end;
 if not denied then raise exception 'Acta duplicada permitida'; end if;
end $$;

-- Abrir caja vía RPC original de Nexora, con Encargado de prueba asignado.
select public.nexora_cash_operation(
 'open','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',10000,null);

-- Gastos ejecutados únicamente por el Encargado, utilizando la RPC original.
select set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
do $$
declare denied boolean:=false;
begin
 begin
  perform public.nexora_cash_operation(
   'expense','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,'Primer gasto del local');
 exception when others then
  if position('debe configurar los topes' in sqlerrm)>0 then denied:=true;
  else raise; end if;
 end;
 if not denied then raise exception 'Se admitió gasto sin topes'; end if;
end $$;

select set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select public.nexora_set_cash_limits(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',3000,5000);

select set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
select public.nexora_cash_operation(
 'expense','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2500,'Mensajería local');
select public.nexora_cash_operation(
 'expense','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2000,'Material de limpieza');

do $$
declare denied boolean:=false;
begin
 begin
  perform public.nexora_cash_operation(
   'expense','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',3001,'Gasto por encima del máximo unitario');
 exception when others then
  if position('limite por operacion' in sqlerrm)>0 then denied:=true;
  else raise; end if;
 end;
 if not denied then raise exception 'Se excedió máximo por gasto'; end if;
 denied:=false;
 begin
  perform public.nexora_cash_operation(
   'expense','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',501,'Gasto por encima del total diario');
 exception when others then
  if position('limite diario' in sqlerrm)>0 then denied:=true;
  else raise; end if;
 end;
 if not denied then raise exception 'Se excedió máximo diario'; end if;

 -- Un Encargado no puede ni insertar límites directamente ni leerlos con RLS.
 if has_table_privilege('authenticated','public.nexora_cash_limits','INSERT') then
   raise exception 'Encargado puede insertar límites sin RPC';
 end if;
 if (select count(*) from public.nexora_cash_limits)<>0 then
   raise exception 'Encargado leyó límites protegidos';
 end if;
end $$;

select set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select public.nexora_set_cash_limits(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',0,0);
-- El Administrador puede bloquear por completo nuevos gastos con tope cero.
select set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
do $$
declare denied boolean:=false;
begin
 begin
  perform public.nexora_cash_operation(
   'expense','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,'Gasto bloqueado por cero');
 exception when others then
  if position('limite por operacion' in sqlerrm)>0 then denied:=true;
  else raise; end if;
 end;
 if not denied then raise exception 'Tope cero permitió gasto'; end if;
end $$;

-- El Encargado puede cerrar caja: efectivo 10.000 - gastos 4.500 = 5.500.
select public.nexora_cash_operation(
 'close','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',5500,null);

select set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
do $$
begin
 if (select count(*) from public.nexora_cash_limit_events
     where site_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')<>2 then
  raise exception 'Falta auditoría de modificación de topes';
 end if;
 if (select count(*) from public.nexora_cash_expenses)<>2 then
  raise exception 'Cantidad incorrecta de gastos registrados';
 end if;
 if (select sum(amount) from public.nexora_cash_expenses)<>4500 then
  raise exception 'Gastos contabilizados incorrectamente';
 end if;
 if not exists(select 1 from public.nexora_cash_sessions
   where site_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
   and state='closed' and closing_difference=0 and closing_expected_cash=5500) then
  raise exception 'Arqueo de caja inconsistente';
 end if;
 if (select count(*) from public.nexora_local_initial_approvals)<>2 then
  raise exception 'Actas locales incorrectas';
 end if;
 if has_table_privilege('authenticated','public.nexora_local_initial_approvals','INSERT') then
  raise exception 'Insert directo de actas habilitado';
 end if;
end $$;

select 'OK: base original caja + V4.9, firma local, roles, gastos, RLS y arqueo' as result;
