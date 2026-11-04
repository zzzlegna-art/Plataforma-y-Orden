-- Nexora V4, prueba SQL con datos INVENTADOS y PostgreSQL efímero.
-- Ensaya el TRIGGER real, no el ejecutor de traslados completo.
-- 20 en tránsito → 15 recibidos → 5 "No llegó" → 1 retorno posterior.
begin;

create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema nexora_internal;
create function auth.uid() returns uuid language sql stable as $auth$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$auth$;

create table public.bodega_profiles (
  id uuid primary key,role text not null,is_active boolean not null
);
create function public.bodega_is_admin()
returns boolean language sql stable as $admin$
  select exists (
    select 1 from public.bodega_profiles p
    where p.id=auth.uid() and p.role='admin' and p.is_active
  )
$admin$;

create table public.nexora_initial_unit_sites (unit_id uuid primary key);
create table public.nexora_transfers (id uuid primary key);
create table public.nexora_transfer_lines (
  id uuid primary key,
  transfer_id uuid not null references public.nexora_transfers(id),
  unit_id uuid not null references public.nexora_initial_unit_sites(unit_id),
  serial_snapshot text not null,
  state text not null,
  received_at timestamptz,
  returned_at timestamptz
);

insert into public.bodega_profiles(id,role,is_active)
values('00000000-0000-0000-0000-000000000001','admin',true);
insert into public.nexora_transfers(id)
values('00000000-0000-0000-0000-000000000100');

insert into public.nexora_initial_unit_sites(unit_id)
select format('00000000-0000-0000-0001-%s',lpad(i::text,12,'0'))::uuid
from generate_series(1,20) i;

insert into public.nexora_transfer_lines
  (id,transfer_id,unit_id,serial_snapshot,state)
select format('00000000-0000-0000-0002-%s',lpad(i::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000100'::uuid,
  format('00000000-0000-0000-0001-%s',lpad(i::text,12,'0'))::uuid,
  'IMEI-'||lpad(i::text,4,'0'),'in_transit'
from generate_series(1,20) i;

\ir ../../migrations/20261104182506_nexora_transfer_missing_observations.sql

do $test$
declare v_count int;
begin
  if has_table_privilege('anon','public.nexora_transfer_missing_observations','SELECT')
    or has_table_privilege('authenticated','public.nexora_transfer_missing_observations','INSERT')
    or has_table_privilege('authenticated','public.nexora_transfer_missing_observations','UPDATE')
    or has_table_privilege('authenticated','public.nexora_transfer_missing_observations','DELETE')
    or has_function_privilege('authenticated','nexora_internal.log_missing_transfer_line()','EXECUTE')
    or has_function_privilege('anon','nexora_internal.log_missing_transfer_line()','EXECUTE') then
    raise exception 'Permisos inseguros sobre observaciones de faltantes.';
  end if;
  if not (
    select c.relrowsecurity from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='nexora_transfer_missing_observations'
  ) then
    raise exception 'RLS debe estar habilitada sobre el historial.';
  end if;
end;
$test$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);

-- Simulación de la misma transición de líneas que ejecuta el RPC actual.
update public.nexora_transfer_lines set state='received',received_at=now()
where serial_snapshot <= 'IMEI-0015';
update public.nexora_transfer_lines set state='return_pending'
where state='in_transit';

do $test$
declare
  v_missing integer;
  v_incorrect integer;
begin
  select count(*) into v_missing from public.nexora_transfer_missing_observations;
  select count(*) into v_incorrect from public.nexora_transfer_missing_observations
  where serial_snapshot not in ('IMEI-0016','IMEI-0017','IMEI-0018','IMEI-0019','IMEI-0020')
    or observation<>'No llegó'
    or reported_by<>'00000000-0000-0000-0000-000000000001'::uuid;
  if v_missing<>5 or v_incorrect<>0 then
    raise exception '20 → 15 → 5 mal registrado: total %, incorrectos %',v_missing,v_incorrect;
  end if;
  if (select count(*) from public.nexora_transfer_lines where state='received')<>15
    or (select count(*) from public.nexora_transfer_lines where state='return_pending')<>5 then
    raise exception 'Estados de manifiesto incompatibles con 15/5.';
  end if;
end;
$test$;

-- Repetir estado no crea un segundo incidente para el mismo IMEI.
update public.nexora_transfer_lines set state='return_pending' where state='return_pending';
-- Retorno comprobado: el incidente NO se elimina ni se acredita retorno ficticio.
update public.nexora_transfer_lines set state='returned',returned_at=now()
where serial_snapshot='IMEI-0016';
do $test$
begin
  if (select count(*) from public.nexora_transfer_missing_observations)<>5
    or (select count(*) from public.nexora_transfer_lines where state='return_pending')<>4
    or (select count(*) from public.nexora_transfer_lines where state='returned')<>1 then
    raise exception 'La devolución física no debe borrar el reporte histórico.';
  end if;
end;
$test$;

-- Sesión nula: la transición a faltante debe fallar por completo.
insert into public.nexora_initial_unit_sites(unit_id)
values('00000000-0000-0000-0001-000000000021');
insert into public.nexora_transfer_lines
  (id,transfer_id,unit_id,serial_snapshot,state)
values('00000000-0000-0000-0002-000000000021',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0001-000000000021','IMEI-0021','in_transit');
select set_config('request.jwt.claim.sub','',true);
do $test$
begin
  begin
    update public.nexora_transfer_lines set state='return_pending'
    where serial_snapshot='IMEI-0021';
    raise exception 'La operación anónima se ejecutó cuando debía fallar.';
  exception when others then
    if sqlerrm not like '%No se puede registrar faltante sin usuario autenticado%' then
      raise;
    end if;
  end;
  if exists(select 1 from public.nexora_transfer_missing_observations
     where serial_snapshot='IMEI-0021')
     or (select state from public.nexora_transfer_lines
         where serial_snapshot='IMEI-0021')<>'in_transit' then
    raise exception 'La sesión inválida creó observaciones o cambió custodia.';
  end if;
end;
$test$;

rollback;
