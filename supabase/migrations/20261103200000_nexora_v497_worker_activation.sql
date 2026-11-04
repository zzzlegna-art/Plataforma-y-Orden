-- Nexora V4.9.7: activacion auditable y restringida de Encargado/Vendedor.
-- NO activa ninguna cuenta ni mueve stock por el mero hecho de migrar.
-- Las cuentas preparadas siguen sin permisos legacy gracias a Auth app_metadata.
alter table public.nexora_staff_role_plans
  drop constraint nexora_staff_role_plans_operationally_enabled_check;

create table public.nexora_worker_activation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.bodega_profiles(id) on delete restrict,
  site_id uuid not null references public.nexora_sites(id) on delete restrict,
  role text not null check(role in ('encargado','vendedor')),
  action text not null check(action in ('activated','deactivated')),
  actor_id uuid not null references public.bodega_profiles(id) on delete restrict,
  occurred_at timestamptz not null default now()
);
alter table public.nexora_worker_activation_events enable row level security;
create policy nexora_worker_activation_admin_read
  on public.nexora_worker_activation_events for select to authenticated
  using ((select public.bodega_is_admin()));
revoke all on public.nexora_worker_activation_events from public,anon,authenticated;
grant select on public.nexora_worker_activation_events to authenticated;

-- Una actualización directa tampoco puede saltarse las comprobaciones.
create or replace function public.nexora_validate_role_plan()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public
as $$
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

  if new.operationally_enabled and (
    v_prepared not in ('encargado','vendedor')
    or not exists(select 1 from public.nexora_initial_inventory_approvals)
    or exists(
      select 1 from public.bodega_units u
      where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
        and not exists(
          select 1 from public.nexora_initial_unit_sites i where i.unit_id=u.id
        )
    )
    or not exists(
      select 1 from public.nexora_staff_sites ss
      join public.nexora_sites st on st.id=ss.site_id
      join public.nexora_local_initial_approvals a on a.site_id=st.id
      where ss.user_id=new.user_id and ss.is_active
        and st.is_active and st.site_type='local'
    )
  ) then
    raise exception 'Inventario inicial y sede del trabajador deben estar aprobados.';
  end if;
  if new.operationally_enabled and new.planned_role='encargado'
    and not exists(
      select 1 from public.nexora_staff_sites ss
      join public.nexora_cash_limits l on l.site_id=ss.site_id
      where ss.user_id=new.user_id and ss.is_active
    ) then
    raise exception 'Primero configura los topes de gastos del local.';
  end if;
  new.updated_by:=auth.uid();
  new.updated_at:=now();
  return new;
end;
$$;
revoke all on function public.nexora_validate_role_plan()
  from public,anon,authenticated;

create function nexora_internal.activate_worker(p_user_id uuid,p_site_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public
as $$
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
  join public.nexora_local_initial_approvals a on a.site_id=s.id
  where ss.user_id=p_user_id and ss.is_active and s.is_active
    and s.site_type='local' and ss.site_id=p_site_id;
  if v_count<>1 or
     (select count(*) from public.nexora_staff_sites where user_id=p_user_id and is_active)<>1 then
    raise exception 'Asigna una única sede local activa y aprobada al trabajador.';
  end if;
  -- El trigger valida de nuevo global, inventario por IMEI, sede y topes.
  update public.nexora_staff_role_plans
    set operationally_enabled=true where user_id=p_user_id;
  update public.bodega_profiles set is_active=true where id=p_user_id;
  insert into public.nexora_worker_activation_events
    (user_id,site_id,role,action,actor_id)
    values(p_user_id,p_site_id,v_prepared,'activated',auth.uid());
  return jsonb_build_object('userId',p_user_id,'siteId',p_site_id,
    'role',v_prepared,'activated',true);
end;
$$;
revoke all on function nexora_internal.activate_worker(uuid,uuid)
  from public,anon,authenticated;
grant execute on function nexora_internal.activate_worker(uuid,uuid) to authenticated;
create function public.nexora_activate_worker(p_user_id uuid,p_site_id uuid)
returns jsonb language sql volatile security invoker
set search_path=pg_catalog,public
as $$
 select nexora_internal.activate_worker(p_user_id,p_site_id);
$$;
revoke all on function public.nexora_activate_worker(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.nexora_activate_worker(uuid,uuid) to authenticated;

create function nexora_internal.deactivate_worker(p_user_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public
as $$
declare v_role text;v_site uuid;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador desactiva trabajadores.';
  end if;
  perform pg_advisory_xact_lock(74628191,hashtext(p_user_id::text));
  select au.raw_app_meta_data->>'nexora_prepared_role'
    into v_role from auth.users au where au.id=p_user_id;
  if v_role not in ('encargado','vendedor') then
    raise exception 'No es una cuenta multisede preparada.';
  end if;
  select ss.site_id into v_site from public.nexora_staff_sites ss
    where ss.user_id=p_user_id and ss.is_active limit 1;
  if v_site is null then
    raise exception 'No se encontró el vínculo de sede para auditar la desactivación.';
  end if;
  update public.bodega_profiles set is_active=false where id=p_user_id;
  update public.nexora_staff_role_plans set operationally_enabled=false
    where user_id=p_user_id;
  if not found then raise exception 'No existe el plan del trabajador.'; end if;
  insert into public.nexora_worker_activation_events
    (user_id,site_id,role,action,actor_id)
    values(p_user_id,v_site,v_role,'deactivated',auth.uid());
  return jsonb_build_object('userId',p_user_id,'activated',false);
end;
$$;
revoke all on function nexora_internal.deactivate_worker(uuid)
  from public,anon,authenticated;
grant execute on function nexora_internal.deactivate_worker(uuid) to authenticated;
create function public.nexora_deactivate_worker(p_user_id uuid)
returns jsonb language sql volatile security invoker
set search_path=pg_catalog,public
as $$ select nexora_internal.deactivate_worker(p_user_id); $$;
revoke all on function public.nexora_deactivate_worker(uuid)
  from public,anon,authenticated;
grant execute on function public.nexora_deactivate_worker(uuid) to authenticated;

-- El usuario preparado sólo puede ver su propio perfil básico. Las
-- políticas legacy continúan denegando productos, IMEI, pedidos y auditoría.
create policy nexora_worker_profile_self_read on public.bodega_profiles
  for select to authenticated using(id=(select auth.uid()));

create function nexora_internal.worker_session()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public
as $$
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
  join public.nexora_local_initial_approvals a on a.site_id=s.id
  where p.id=v_id and p.is_active and p.role='bodeguero'
    and rp.operationally_enabled
    and rp.planned_role in ('encargado','vendedor')
    and au.raw_app_meta_data->>'nexora_prepared_role'=rp.planned_role
    and ss.is_active and s.is_active and s.site_type='local'
  order by ss.created_at desc limit 1;
  if v_site is null then return null; end if;
  return jsonb_build_object('role',v_role,'siteId',v_site,'siteName',v_site_name);
end;
$$;
revoke all on function nexora_internal.worker_session()
  from public,anon,authenticated;
grant execute on function nexora_internal.worker_session() to authenticated;
create function public.nexora_worker_session()
returns jsonb language sql stable security invoker set search_path=pg_catalog,public
as $$ select nexora_internal.worker_session(); $$;
revoke all on function public.nexora_worker_session() from public,anon,authenticated;
grant execute on function public.nexora_worker_session() to authenticated;

-- Información del propio local; jamás se descargan 3.171 IMEI o costos
-- ajenos. Los totales no otorgan permisos para editar inventario legacy.
create function nexora_internal.worker_site_snapshot()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public
as $$
declare v_worker jsonb;v_site uuid;v_units integer;v_ready integer;v_cash text;
begin
  v_worker:=nexora_internal.worker_session();
  if v_worker is null then
    raise exception 'Trabajador sin perfil y sede operativa autorizados.';
  end if;
  v_site:=(v_worker->>'siteId')::uuid;
  select count(*),count(*) filter(where u.cost is not null and u.cost>=0)
    into v_units,v_ready
    from public.nexora_unit_custody c
    join public.bodega_units u on u.id=c.unit_id
    where c.site_id=v_site and c.custody_status='at_site'
      and u.status in ('en_local','en_bodega');
  select cs.state into v_cash from public.nexora_cash_sessions cs
    where cs.site_id=v_site
      and cs.business_date=(now() at time zone 'America/Bogota')::date
    order by cs.opened_at desc limit 1;
  return v_worker||jsonb_build_object(
    'assignedUnits',v_units,'unitsWithRealCost',v_ready,
    'cashState',coalesce(v_cash,'not_opened'),
    'businessDate',(now() at time zone 'America/Bogota')::date
  );
end;
$$;
revoke all on function nexora_internal.worker_site_snapshot()
  from public,anon,authenticated;
grant execute on function nexora_internal.worker_site_snapshot() to authenticated;
create function public.nexora_worker_site_snapshot()
returns jsonb language sql stable security invoker set search_path=pg_catalog,public
as $$select nexora_internal.worker_site_snapshot();$$;
revoke all on function public.nexora_worker_site_snapshot() from public,anon,authenticated;
grant execute on function public.nexora_worker_site_snapshot() to authenticated;
