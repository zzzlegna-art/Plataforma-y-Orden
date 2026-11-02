-- Nexora Multisede 2.0: frontera de acceso legacy y preparación verificable.
-- No activa Encargado/Vendedor, no crea sedes, no modifica IMEI ni caja.
-- Todos los datos del asistente son de solo lectura y exigidos al Administrador.

-- La base legacy protege escrituras masivas mediante bodega_is_staff().
-- Evitar que un eventual rol operativo de local, almacenado como 'bodeguero'
-- en la tabla histórica, herede sus permisos si se habilita en el futuro.
-- Con operationally_enabled obligado a false hoy, el comportamiento actual
-- para admin y bodeguero permanece intacto.
create or replace function public.bodega_is_staff()
returns boolean language sql stable security definer
set search_path = pg_catalog,public
as $$
  select exists(
    select 1 from public.bodega_profiles p
    where p.id=auth.uid() and p.is_active and p.role in ('admin','bodeguero')
      and not exists (
        select 1 from public.nexora_staff_role_plans rp
        where rp.user_id=p.id and rp.operationally_enabled
          and rp.planned_role in ('encargado','vendedor')
      )
  );
$$;
comment on function public.bodega_is_staff() is
  'La operación legacy solo corresponde a admin/bodeguero. Un Encargado/Vendedor activado nunca hereda escrituras legacy aunque su perfil histórico sea bodeguero.';

create function public.nexora_launch_readiness()
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public
as $$
declare
  v_cities bigint;
  v_principal bigint;
  v_warehouses bigint;
  v_stores bigint;
  v_active_assignments bigint;
  v_plans bigint;
  v_manager_plans bigint;
  v_enabled_managers bigint;
  v_approved boolean;
  v_eligible bigint;
  v_mapped bigint;
  v_unmapped bigint;
  v_cash_open bigint;
  v_retail_sales bigint;
  v_store_details jsonb;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede consultar el centro de preparación.';
  end if;

  select count(*) into v_cities from public.nexora_cities;
  select count(*) filter(where site_type='principal' and is_active),
         count(*) filter(where site_type='bodega' and is_active),
         count(*) filter(where site_type='local' and is_active)
    into v_principal,v_warehouses,v_stores from public.nexora_sites;
  select count(*) into v_active_assignments from public.nexora_staff_sites s
    join public.bodega_profiles p on p.id=s.user_id
    join public.nexora_sites n on n.id=s.site_id
    where s.is_active and p.is_active and n.is_active;
  select count(*), count(*) filter(where planned_role='encargado'),
         count(*) filter(where planned_role='encargado' and operationally_enabled)
    into v_plans,v_manager_plans,v_enabled_managers
    from public.nexora_staff_role_plans;

  select exists(select 1 from public.nexora_initial_inventory_approvals)
    into v_approved;
  select count(*) into v_eligible from public.bodega_units u
    where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');
  select count(*) into v_mapped from public.nexora_initial_unit_sites i
    join public.bodega_units u on u.id=i.unit_id
    where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');
  v_unmapped:=greatest(0,v_eligible-v_mapped);

  select count(*) into v_cash_open from public.nexora_cash_sessions
    where state='open' and business_date=(now() at time zone 'America/Bogota')::date;
  select count(*) into v_retail_sales from public.nexora_retail_sales;

  select coalesce(jsonb_agg(jsonb_build_object(
    'siteId',s.id,
    'name',s.name,
    'assignedStaff',(
      select count(*) from public.nexora_staff_sites ss
      join public.bodega_profiles bp on bp.id=ss.user_id
      where ss.site_id=s.id and ss.is_active and bp.is_active
    ),
    'managerPlanned',exists(
      select 1 from public.nexora_staff_sites ss
      join public.nexora_staff_role_plans rp on rp.user_id=ss.user_id
      join public.bodega_profiles bp on bp.id=ss.user_id
      where ss.site_id=s.id and ss.is_active and bp.is_active
        and rp.planned_role='encargado'
    ),
    'managerEnabled',exists(
      select 1 from public.nexora_staff_sites ss
      join public.nexora_staff_role_plans rp on rp.user_id=ss.user_id
      join public.bodega_profiles bp on bp.id=ss.user_id
      where ss.site_id=s.id and ss.is_active and bp.is_active
        and rp.planned_role='encargado' and rp.operationally_enabled
    )
  ) order by s.name),'[]'::jsonb) into v_store_details
  from public.nexora_sites s where s.site_type='local' and s.is_active;

  return jsonb_build_object(
    'checkedAt',now(),
    'roleActivationAvailable',false,
    'salesAvailable',false,
    'cities',v_cities,
    'principals',v_principal,
    'warehouses',v_warehouses,
    'stores',v_stores,
    'activeAssignments',v_active_assignments,
    'plannedRoles',v_plans,
    'plannedManagers',v_manager_plans,
    'enabledManagers',v_enabled_managers,
    'initialApproved',v_approved,
    'legacyEligibleUnits',v_eligible,
    'mappedUnits',v_mapped,
    'unmappedUnits',v_unmapped,
    'openCashSessions',v_cash_open,
    'retailSales',v_retail_sales,
    'storeDetails',v_store_details,
    'steps',jsonb_build_array(
      jsonb_build_object('key','cities','ready',v_cities>0,'current',v_cities),
      jsonb_build_object('key','principal','ready',v_principal=1,'current',v_principal),
      jsonb_build_object('key','warehouses','ready',v_warehouses>0,'current',v_warehouses),
      jsonb_build_object('key','stores','ready',v_stores>0,'current',v_stores),
      jsonb_build_object('key','staff','ready',v_active_assignments>0,'current',v_active_assignments),
      jsonb_build_object('key','rolePlans','ready',v_plans>0,'current',v_plans),
      jsonb_build_object('key','reconciliation','ready',v_approved and v_unmapped=0,
        'current',v_mapped,'total',v_eligible),
      jsonb_build_object('key','roleActivation','ready',false,'current',v_enabled_managers)
    )
  );
end;
$$;
revoke all on function public.nexora_launch_readiness() from public,anon,authenticated;
grant execute on function public.nexora_launch_readiness() to authenticated;
comment on function public.nexora_launch_readiness() is
  'Diagnóstico de preparación para Administrador; no activa roles, vende ni modifica inventario.';
