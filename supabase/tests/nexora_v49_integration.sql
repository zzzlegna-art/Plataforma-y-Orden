-- Pruebas de integración de ambas migraciones V4.9 en PostgreSQL efímero.
-- Resultados reales de SQL, no simulaciones en el navegador.
\set ON_ERROR_STOP on

select set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('test.admin','true',false);

insert into public.bodega_profiles(id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.nexora_sites(id,name,site_type,is_active)
values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Local A','local',true),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Local B','local',true);

-- No hay aprobaciones iniciales automáticas ni límites predeterminados.
do $$
begin
 if (select count(*) from public.nexora_local_initial_approvals) <> 0 then
   raise exception 'Actas locales automáticas: falla';
 end if;
 if (select count(*) from public.nexora_cash_limits) <> 0 then
   raise exception 'Límites monetarios inventados: falla';
 end if;
 if (select count(*) from public.nexora_cash_limit_events) <> 0 then
   raise exception 'Eventos monetarios ficticios: falla';
 end if;
end $$;

-- Sin acta global debe negarse la firma local.
do $$
declare denied boolean := false;
begin
  begin
    perform public.nexora_approve_local_initial(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','APROBAR','Conteo físico de ejemplo, local vacío');
  exception when others then
    if position('acta central aprobada' in sqlerrm)>0 then denied:=true; else raise; end if;
  end;
  if not denied then raise exception 'Se permitió una firma local sin acta central'; end if;
end $$;

-- Aun existiendo la sede, la caja no puede abrirse sin su propia acta.
do $$
declare denied boolean := false;
begin
  begin
    insert into public.nexora_cash_sessions(site_id)
      values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  exception when others then
    if position('sin aprobacion administrativa' in sqlerrm)>0 then denied:=true; else raise; end if;
  end;
  if not denied then raise exception 'Se abrió caja antes de aprobar el local'; end if;
end $$;

insert into public.nexora_initial_inventory_approvals(id)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd');

-- No Administrador no puede firmar ni configurar límites.
select set_config('test.admin','false',false);
do $$
declare denied boolean := false;
begin
  begin
    perform public.nexora_approve_local_initial(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','APROBAR','Conteo físico de ejemplo, local vacío');
  exception when others then
    if position('Solo Administrador' in sqlerrm)>0 then denied:=true; else raise; end if;
  end;
  if not denied then raise exception 'No admin aprobó inventario'; end if;
  denied:=false;
  begin
    perform public.nexora_set_cash_limits('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',3000,5000);
  exception when others then
    if position('Solo Administrador' in sqlerrm)>0 then denied:=true; else raise; end if;
  end;
  if not denied then raise exception 'No admin configuró límites'; end if;
end $$;

select set_config('test.admin','true',false);
select public.nexora_approve_local_initial(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','APROBAR','Local verificado físicamente sin unidades');
select public.nexora_approve_local_initial(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','APROBAR','Local vacío revisado por el Administrador');

-- Firma repetida no permitida.
do $$
declare denied boolean := false;
begin
  begin
    perform public.nexora_approve_local_initial(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','APROBAR','Segundo intento de firma del local');
  exception when others then
    if position('ya tiene su acta inicial' in sqlerrm)>0 then denied:=true; else raise; end if;
  end;
  if not denied then raise exception 'Se permitió duplicar el acta local'; end if;
end $$;

-- Después de la firma sí es técnicamente posible registrar una sesión;
-- esto NO habilita el POS ni roles operativos (protegidos por otras RPC).
insert into public.nexora_cash_sessions(id,site_id)
values
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','cccccccc-cccc-4ccc-8ccc-cccccccccccc');

-- Sin topes, gasto rechazado.
do $$
declare denied boolean := false;
begin
  begin
    insert into public.nexora_cash_expenses(session_id,amount)
    values ('ffffffff-ffff-4fff-8fff-ffffffffffff',1);
  exception when others then
    if position('debe configurar los topes' in sqlerrm)>0 then denied:=true; else raise; end if;
  end;
  if not denied then raise exception 'Gasto permitido sin límites configurados'; end if;
end $$;

-- Límites del Administrador: 3.000 por gasto, 5.000 diarios.
select public.nexora_set_cash_limits('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',3000,5000);
insert into public.nexora_cash_expenses(session_id,amount)
values
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',2500),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',2000);

do $$
declare denied boolean := false;
begin
  begin
    insert into public.nexora_cash_expenses(session_id,amount)
    values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',3001);
  exception when others then
    if position('limite por operacion' in sqlerrm)>0 then denied:=true; else raise; end if;
  end;
  if not denied then raise exception 'Gasto superior al límite individual permitido'; end if;

  denied:=false;
  begin
    insert into public.nexora_cash_expenses(session_id,amount)
    values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',501);
  exception when others then
    if position('limite diario' in sqlerrm)>0 then denied:=true; else raise; end if;
  end;
  if not denied then raise exception 'Gasto superior al límite diario permitido'; end if;
end $$;

-- El Administrador puede dejar ambos topes en cero: bloquea nuevos gastos.
select public.nexora_set_cash_limits('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',0,0);
do $$
declare denied boolean := false;
begin
  begin
    insert into public.nexora_cash_expenses(session_id,amount)
    values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',1);
  exception when others then
    if position('limite por operacion' in sqlerrm)>0 then denied:=true; else raise; end if;
  end;
  if not denied then raise exception 'Topes en cero permitieron un nuevo gasto'; end if;

  if (select count(*) from public.nexora_cash_limit_events
       where site_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') <> 2 then
    raise exception 'No se registraron ambas actualizaciones de límites';
  end if;
  if (select count(*) from public.nexora_cash_expenses
       where session_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') <> 2 then
    raise exception 'Se alteró la cantidad de gastos válidos';
  end if;
end $$;

-- Verificación de privilegios y RLS, sin exponer escritura por REST.
do $$
begin
  if not (select relrowsecurity from pg_class
          where oid='public.nexora_cash_limits'::regclass) then
    raise exception 'Falta RLS de topes';
  end if;
  if not (select relrowsecurity from pg_class
          where oid='public.nexora_local_initial_approvals'::regclass) then
    raise exception 'Falta RLS de aprobaciones';
  end if;
  if has_table_privilege('anon','public.nexora_cash_limits','SELECT') then
    raise exception 'Anon puede leer topes';
  end if;
  if has_table_privilege('authenticated','public.nexora_cash_limits','INSERT') then
    raise exception 'Usuarios autenticados pueden escribir directamente límites';
  end if;
  if has_table_privilege('authenticated','public.nexora_local_initial_approvals','INSERT') then
    raise exception 'Usuarios autenticados pueden firmar por INSERT directo';
  end if;
end $$;

select 'OK: migraciones V4.9, permisos, firmas, topes y auditoría' as resultado;
