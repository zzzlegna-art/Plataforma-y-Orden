-- Auditoría operativa por empleado y sede, exclusivamente Administrador.
-- Solo lectura: no activa roles y no altera inventario, costos, caja o pedidos.
create function public.nexora_staff_access_audit()
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public
as $$
declare v_rows jsonb;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede consultar permisos por sede.';
  end if;

  with assignments as (
    select p.id,p.full_name,p.email,p.role as legacy_role,p.is_active as staff_active,
      rp.planned_role,rp.operationally_enabled,
      ss.site_id,ss.is_active as assignment_active,
      s.name as site_name,s.site_type,s.is_active as site_active
    from public.bodega_profiles p
    left join public.nexora_staff_role_plans rp on rp.user_id=p.id
    left join public.nexora_staff_sites ss on ss.user_id=p.id
    left join public.nexora_sites s on s.id=ss.site_id
  ), evaluated as (
    select *,
      (legacy_role='admin' and staff_active) as is_admin,
      (staff_active and coalesce(assignment_active,false) and coalesce(site_active,false)
       and site_id is not null) as valid_assignment,
      (staff_active and coalesce(assignment_active,false) and coalesce(site_active,false)
       and coalesce(operationally_enabled,false) and planned_role in ('encargado','vendedor')
       and site_type='local') as local_role_ready
    from assignments
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId',id,'fullName',coalesce(nullif(btrim(full_name),''),email),
    'email',email,'legacyRole',legacy_role,'plannedRole',planned_role,
    'staffActive',staff_active,'roleEnabled',coalesce(operationally_enabled,false),
    'siteId',site_id,'siteName',site_name,'siteType',site_type,
    'siteActive',coalesce(site_active,false),
    'assignmentActive',coalesce(assignment_active,false),
    'canReadWarehouseLegacy',is_admin or (
      legacy_role='bodeguero' and staff_active and
      not (coalesce(operationally_enabled,false) and planned_role in ('encargado','vendedor'))
    ),
    'canOperateStore',local_role_ready,
    'canOperateCash',local_role_ready and planned_role='encargado',
    'canSellRetail',local_role_ready,
    'reason',case
       when not staff_active then 'STAFF_INACTIVE'
       when legacy_role='admin' then 'ADMIN_GLOBAL'
       when planned_role is null then 'ROLE_NOT_PLANNED'
       when not valid_assignment then 'SITE_NOT_ASSIGNED'
       when not coalesce(operationally_enabled,false) then 'ROLE_NOT_ENABLED'
       when site_type<>'local' and planned_role in ('encargado','vendedor') then 'NOT_A_STORE'
       when local_role_ready then 'ROLE_READY'
       else 'NOT_AUTHORIZED'
    end
  ) order by full_name,site_name),'[]'::jsonb)
  into v_rows from evaluated;

  return jsonb_build_object(
    'checkedAt',now(),
    'operationalRoleActivationSupported',false,
    'staff',v_rows
  );
end;
$$;
revoke all on function public.nexora_staff_access_audit() from public,anon,authenticated;
grant execute on function public.nexora_staff_access_audit() to authenticated;
comment on function public.nexora_staff_access_audit() is
 'Diagnóstico administrativo por empleado/sede. No activa permisos ni autorizaciones reales.';
