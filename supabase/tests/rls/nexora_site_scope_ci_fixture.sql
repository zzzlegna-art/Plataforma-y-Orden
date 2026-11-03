-- Test de integración PostgreSQL AISLADO para el PR de alcance rol/sede.
-- Usar exclusivamente en servicio PostgreSQL efímero de GitHub Actions.
-- No contiene credenciales ni datos productivos. TODO se revierte.
begin;

create role anon nologin;
create role authenticated nologin;

create schema auth;
create schema nexora_internal;
create function auth.uid() returns uuid language sql stable as $auth$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$auth$;

create table public.bodega_profiles (
  id uuid primary key, role text not null, is_active boolean not null
);
create table public.nexora_staff_role_plans (
  user_id uuid primary key, planned_role text not null,
  operationally_enabled boolean not null
);
create table public.nexora_sites (
  id uuid primary key, city_id uuid not null, site_type text not null,
  parent_site_id uuid, is_active boolean not null
);
create table public.nexora_staff_sites (
  user_id uuid not null, site_id uuid not null, is_active boolean not null
);

-- IDs inventados: jamás corresponden a usuarios, sedes ni IMEI reales.
insert into public.bodega_profiles(id,role,is_active) values
 ('00000000-0000-0000-0000-000000000001','admin',true),
 ('00000000-0000-0000-0000-000000000002','bodeguero',true),
 ('00000000-0000-0000-0000-000000000003','bodeguero',true),
 ('00000000-0000-0000-0000-000000000004','bodeguero',true),
 ('00000000-0000-0000-0000-000000000005','bodeguero',false),
 ('00000000-0000-0000-0000-000000000006','bodeguero',true),
 ('00000000-0000-0000-0000-000000000007','bodeguero',true),
 ('00000000-0000-0000-0000-000000000008','bodeguero',true),
 ('00000000-0000-0000-0000-000000000009','bodeguero',true);

-- En el sistema real el CHECK impide activación comercial;
-- aquí se simulan activaciones SOLO para comprobar la futura guardia SQL.
insert into public.nexora_staff_role_plans(user_id,planned_role,operationally_enabled) values
 ('00000000-0000-0000-0000-000000000003','vendedor',true),
 ('00000000-0000-0000-0000-000000000004','encargado',true);

insert into public.nexora_sites(id,city_id,site_type,parent_site_id,is_active) values
 ('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-00000000b001','principal',null,true),
 ('00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-00000000b002','bodega','00000000-0000-0000-0000-000000000100',true),
 ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-00000000b003','bodega','00000000-0000-0000-0000-000000000100',true),
 ('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-00000000b002','bodega','00000000-0000-0000-0000-000000000100',true),
 ('00000000-0000-0000-0000-000000000300','00000000-0000-0000-0000-00000000b001','local','00000000-0000-0000-0000-000000000100',true),
 ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-00000000b002','local','00000000-0000-0000-0000-000000000200',true),
 ('00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-00000000b003','local','00000000-0000-0000-0000-000000000201',true),
 ('00000000-0000-0000-0000-000000000303','00000000-0000-0000-0000-00000000b001','local','00000000-0000-0000-0000-000000000100',true),
 ('00000000-0000-0000-0000-000000000304','00000000-0000-0000-0000-00000000b001','local','00000000-0000-0000-0000-000000000100',false);

insert into public.nexora_staff_sites(user_id,site_id,is_active) values
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000100',true),
 ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000300',true),
 ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000301',true),
 ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000100',true),
 ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000200',true),
 ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000200',false),
 ('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000304',true);

\ir ../../migrations/20261103080000_nexora_site_role_scope_basis.sql

-- Exclusivamente en ESTE PostgreSQL efímero, un puente privado para
-- simular cómo una RPC de servidor invocaría la guardia con la identidad JWT
-- del solicitante. No forma parte de ninguna migración ni del frontend.
create function public.nexora_ci_scope_probe(p_site uuid,p_capability text)
returns boolean language sql stable security definer
set search_path = pg_catalog
as $probe$
  select nexora_internal.site_role_scope_basis(p_site,p_capability);
$probe$;
revoke all on function public.nexora_ci_scope_probe(uuid,text)
  from public,anon,authenticated;
grant execute on function public.nexora_ci_scope_probe(uuid,text)
  to authenticated;

do $tests$
declare
  v_main constant uuid := '00000000-0000-0000-0000-000000000100';
  v_cali constant uuid := '00000000-0000-0000-0000-000000000200';
  v_med constant uuid := '00000000-0000-0000-0000-000000000201';
  v_cali2 constant uuid := '00000000-0000-0000-0000-000000000202';
  v_iphone constant uuid := '00000000-0000-0000-0000-000000000300';
  v_cali_store constant uuid := '00000000-0000-0000-0000-000000000301';
  v_other_store constant uuid := '00000000-0000-0000-0000-000000000303';
  v_inactive_store constant uuid := '00000000-0000-0000-0000-000000000304';
begin
  if has_function_privilege('anon',
      'nexora_internal.site_role_scope_basis(uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated',
      'nexora_internal.site_role_scope_basis(uuid,text)', 'EXECUTE')
    or has_function_privilege('anon',
      'nexora_internal.transfer_actor_scope_basis(text,uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated',
      'nexora_internal.transfer_actor_scope_basis(text,uuid,uuid)', 'EXECUTE') then
    raise exception 'ERROR: los clientes pueden ejecutar funciones privadas.';
  end if;

  -- Sesión sin autenticación: rechazo por defecto.
  perform set_config('request.jwt.claim.sub','',true);
  if nexora_internal.site_role_scope_basis(v_main,'transfers.manage')
    or nexora_internal.transfer_actor_scope_basis('create',v_main,v_cali) then
    raise exception 'ERROR: sesión anónima habilitada.';
  end if;

  -- Administrador global, con separación de caja, compras y rutas.
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  if not nexora_internal.site_role_scope_basis(v_main,'reception.cost.approve')
    or not nexora_internal.site_role_scope_basis(v_iphone,'cash.open')
    or not nexora_internal.site_role_scope_basis(v_iphone,'sales.create')
    or not nexora_internal.site_role_scope_basis(v_cali,'inventory.view')
    or not nexora_internal.site_role_scope_basis(v_cali,'inventory.imei.cost.view')
    or nexora_internal.site_role_scope_basis(v_inactive_store,'inventory.view')
    or nexora_internal.site_role_scope_basis(v_iphone,'cash.close')
    or nexora_internal.site_role_scope_basis(v_main,'cash.open')
    or nexora_internal.site_role_scope_basis(v_main,'sales.create') then
    raise exception 'ERROR: permisos de Administrador incorrectos.';
  end if;
  if not nexora_internal.transfer_actor_scope_basis('create',v_main,v_cali)
    or not nexora_internal.transfer_actor_scope_basis('create',v_cali,v_med)
    or not nexora_internal.transfer_actor_scope_basis('create',v_cali,v_cali_store)
    or not nexora_internal.transfer_actor_scope_basis('create',v_cali_store,v_cali)
    or not nexora_internal.transfer_actor_scope_basis('create',v_main,v_iphone)
    or nexora_internal.transfer_actor_scope_basis('create',v_cali,v_cali2)
    or nexora_internal.transfer_actor_scope_basis('create',v_cali_store,v_iphone)
    or nexora_internal.transfer_actor_scope_basis('create',v_cali_store,v_main)
    or nexora_internal.transfer_actor_scope_basis('create',v_med,v_cali_store)
    or nexora_internal.transfer_actor_scope_basis('create',v_main,v_inactive_store)
    or nexora_internal.transfer_actor_scope_basis('create',v_iphone,v_other_store)
    or nexora_internal.transfer_actor_scope_basis('create',v_main,v_main) then
    raise exception 'ERROR: matriz de rutas V4 incorrecta.';
  end if;
  if not nexora_internal.transfer_actor_scope_basis('dispatch',v_main,v_iphone)
    or not nexora_internal.transfer_actor_scope_basis('receive',v_main,v_iphone)
    or not nexora_internal.transfer_actor_scope_basis('return',v_main,v_iphone)
    or not nexora_internal.transfer_actor_scope_basis('cancel',v_main,v_iphone)
    or nexora_internal.transfer_actor_scope_basis('inventado',v_main,v_iphone) then
    raise exception 'ERROR: fases de traslado incorrectas.';
  end if;

  -- Bodeguero asignado a la principal: solo opera allí.
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  if not nexora_internal.site_role_scope_basis(v_main,'reception.supplier.receive')
    or nexora_internal.site_role_scope_basis(v_main,'reception.cost.approve')
    or nexora_internal.site_role_scope_basis(v_main,'sales.create')
    or not nexora_internal.site_role_scope_basis(v_cali,'inventory.view')
    or not nexora_internal.site_role_scope_basis(v_cali,'inventory.imei.cost.view')
    or nexora_internal.site_role_scope_basis(v_cali,'inventory.imei.correct')
    or not nexora_internal.transfer_actor_scope_basis('dispatch',v_main,v_cali)
    or nexora_internal.transfer_actor_scope_basis('receive',v_main,v_cali)
    or nexora_internal.site_role_scope_basis(v_cali,'transfers.manage') then
    raise exception 'ERROR: aislamiento del Bodeguero principal.';
  end if;

  -- Bodeguero regional: movimientos entre ciudades, pero no bodega de misma ciudad.
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
  if not nexora_internal.transfer_actor_scope_basis('create',v_cali,v_med)
    or not nexora_internal.transfer_actor_scope_basis('dispatch',v_cali,v_cali_store)
    or nexora_internal.transfer_actor_scope_basis('receive',v_cali,v_cali_store)
    or nexora_internal.transfer_actor_scope_basis('create',v_cali,v_cali2) then
    raise exception 'ERROR: rutas o accesos del Bodeguero regional.';
  end if;

  -- Vendedor activado SOLO en este fixture aislado: NO hereda bodeguero.
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
  if not nexora_internal.transfer_actor_scope_basis('receive',v_main,v_iphone)
    or not nexora_internal.transfer_actor_scope_basis('create',v_iphone,v_main)
    or nexora_internal.transfer_actor_scope_basis('dispatch',v_main,v_iphone)
    or nexora_internal.site_role_scope_basis(v_iphone,'cash.open')
    or not nexora_internal.site_role_scope_basis(v_iphone,'sales.create')
    or nexora_internal.site_role_scope_basis(v_cali_store,'sales.create')
    or not nexora_internal.site_role_scope_basis(v_cali_store,'inventory.view')
    or not nexora_internal.site_role_scope_basis(v_cali_store,'inventory.imei.cost.view')
    or nexora_internal.site_role_scope_basis(v_cali,'inventory.references.manage')
    or nexora_internal.site_role_scope_basis(v_iphone,'inventory.imei.correct')
    or nexora_internal.site_role_scope_basis(v_main,'reception.supplier.receive') then
    raise exception 'ERROR: Vendedor obtuvo permiso ajeno o no recibió su sede.';
  end if;

  -- Encargado activado SOLO en este fixture aislado.
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
  if not nexora_internal.site_role_scope_basis(v_cali_store,'cash.open')
    or not nexora_internal.site_role_scope_basis(v_cali_store,'cash.close')
    or not nexora_internal.site_role_scope_basis(v_cali_store,'sales.create')
    or not nexora_internal.site_role_scope_basis(v_main,'inventory.view')
    or not nexora_internal.site_role_scope_basis(v_main,'inventory.imei.cost.view')
    or nexora_internal.site_role_scope_basis(v_main,'transfers.manage')
    or not nexora_internal.site_role_scope_basis(v_cali_store,'cash.expense.record')
    or nexora_internal.site_role_scope_basis(v_cali_store,'finance.transfer.manage')
    or nexora_internal.site_role_scope_basis(v_iphone,'cash.open')
    or not nexora_internal.transfer_actor_scope_basis('create',v_cali_store,v_cali)
    or nexora_internal.transfer_actor_scope_basis('receive',v_cali,v_cali_store) = false then
    raise exception 'ERROR: permisos de Encargado fuera de su local.';
  end if;

  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
  if nexora_internal.site_role_scope_basis(v_main,'transfers.manage')
    or nexora_internal.site_role_scope_basis(v_main,'inventory.view')
    or nexora_internal.site_role_scope_basis(v_main,'inventory.imei.cost.view') then
    raise exception 'ERROR: perfil inactivo autorizado.';
  end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000007',true);
  if nexora_internal.site_role_scope_basis(v_cali,'transfers.manage')
    or nexora_internal.site_role_scope_basis(v_main,'inventory.view')
    or nexora_internal.site_role_scope_basis(v_main,'inventory.imei.cost.view') then
    raise exception 'ERROR: asignación inactiva autorizada.';
  end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000008',true);
  if nexora_internal.site_role_scope_basis(v_main,'inventory.view')
    or nexora_internal.site_role_scope_basis(v_main,'inventory.imei.cost.view') then
    raise exception 'ERROR: una asignación solo a sede inactiva no permite lectura global.';
  end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000009',true);
  if nexora_internal.site_role_scope_basis(v_cali_store,'inventory.view')
    or nexora_internal.site_role_scope_basis(v_cali_store,'inventory.imei.cost.view') then
    raise exception 'ERROR: un empleado sin sede no puede consultar costos globales.';
  end if;

  raise notice 'Nexora V4: pruebas SQL de rutas/roles pasaron (solo entorno ficticio).';
end;
$tests$;

-- Prueba de extremo de sesión PostgreSQL real, bajo role authenticated
-- y con el puente ficticio ejecutado con SECURITY DEFINER. La lectura
-- global no debe convertirse en permiso de gestión de una sede ajena.
set local role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003',true);
do $api$
declare
  v_warehouse constant uuid := '00000000-0000-0000-0000-000000000200';
  v_own_store constant uuid := '00000000-0000-0000-0000-000000000300';
begin
  if not public.nexora_ci_scope_probe(v_warehouse,'inventory.view')
    or not public.nexora_ci_scope_probe(v_warehouse,'inventory.imei.cost.view')
    or public.nexora_ci_scope_probe(v_warehouse,'transfers.manage')
    or public.nexora_ci_scope_probe(v_warehouse,'inventory.imei.correct')
    or not public.nexora_ci_scope_probe(v_own_store,'sales.create') then
    raise exception 'Error de aislamiento al invocar la guardia con rol authenticated real.';
  end if;
end;
$api$;

select set_config('request.jwt.claim.sub','',true);
do $api$
begin
  if public.nexora_ci_scope_probe(
    '00000000-0000-0000-0000-000000000200',
    'inventory.imei.cost.view') then
    raise exception 'La guardia permitió leer costos sin JWT.';
  end if;
end;
$api$;
reset role;

rollback;
