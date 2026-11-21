-- Retira el perfil operativo Vendedor sin borrar el historial de auditoría.
-- La cuenta preparada nunca estuvo activa ni tuvo asignaciones de bodega.

do $$
begin
  if not exists (
    select 1 from public.bodega_profiles
    where id = '4ea87251-c322-49e9-8498-f6497baad4b4'
      and role = 'bodeguero' and is_active = false
  ) then
    raise exception 'La cuenta preparada no está en el estado esperado; se cancela la migración.';
  end if;

  if exists (
    select 1 from public.nexora_worker_activation_events
    where user_id = '4ea87251-c322-49e9-8498-f6497baad4b4'
  ) then
    raise exception 'La cuenta tiene historial de activación; se requiere revisión manual.';
  end if;
end
$$;

delete from public.nexora_staff_role_plans
where user_id = '4ea87251-c322-49e9-8498-f6497baad4b4'
  and planned_role = 'vendedor'
  and operationally_enabled = false;

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'nexora_prepared_role'
where id = '4ea87251-c322-49e9-8498-f6497baad4b4'
  and raw_app_meta_data->>'nexora_prepared_role' = 'vendedor';

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
