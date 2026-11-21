-- Retira el perfil operativo Vendedor sin borrar el historial de auditoría.
-- Solo elimina cuentas preparadas que nunca fueron activadas.

do $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select au.id
    from auth.users au
    join public.bodega_profiles p on p.id = au.id
    join public.nexora_staff_role_plans rp on rp.user_id = au.id
    where au.raw_app_meta_data->>'nexora_prepared_role' = 'vendedor'
      and p.role = 'bodeguero'
      and p.is_active = false
      and rp.planned_role = 'vendedor'
      and rp.operationally_enabled = false
  loop
    if exists (
      select 1 from public.nexora_worker_activation_events
      where user_id = v_user_id
    ) then
      raise exception 'Una cuenta preparada con perfil Vendedor tiene historial de activación; se requiere revisión manual.';
    end if;

    delete from public.nexora_staff_role_plans
    where user_id = v_user_id
      and planned_role = 'vendedor'
      and operationally_enabled = false;

    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'nexora_prepared_role'
    where id = v_user_id
      and raw_app_meta_data->>'nexora_prepared_role' = 'vendedor';
  end loop;
end
$$;

alter table public.nexora_staff_role_plans
  drop constraint if exists nexora_staff_role_plans_planned_role_check;

alter table public.nexora_staff_role_plans
  add constraint nexora_staff_role_plans_planned_role_check
  check (planned_role = any (array['bodeguero'::text, 'encargado'::text]));

do $$
declare
  r record;
  v_definition text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prokind = 'f'
      and (
        (n.nspname = 'public' and p.proname in ('bodega_is_staff', 'nexora_validate_role_plan'))
        or
        (n.nspname = 'nexora_internal' and p.proname in (
          'guard_prepared_worker_profile',
          'worker_session',
          'activate_worker',
          'deactivate_worker',
          'audit_worker_enabled_change',
          'validate_staff_site_pending'
        ))
      )
  loop
    v_definition := pg_get_functiondef(r.oid);
    v_definition := regexp_replace(
      v_definition,
      '''encargado''[[:space:]]*,[[:space:]]*''vendedor''',
      '''encargado''',
      'g'
    );
    v_definition := replace(v_definition, 'Encargado/Vendedor', 'Encargado');
    v_definition := replace(v_definition, 'Encargado o Vendedor', 'Encargado');
    v_definition := replace(v_definition, 'encargado/vendedor', 'encargado');
    v_definition := replace(v_definition, 'v_role not in (''encargado'')', 'v_role is distinct from ''encargado''');
    v_definition := replace(v_definition, 'v_prepared not in (''encargado'')', 'v_prepared is distinct from ''encargado''');
    execute v_definition;
  end loop;
end
$$;
