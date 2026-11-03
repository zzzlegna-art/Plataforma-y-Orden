-- Nexora Multisede V4: fundamento de alcance por rol y sede.
-- Esta funcion NO autoriza operaciones finales y no esta vinculada a RPC,
-- RLS, ventas, caja, traslados ni movimientos de inventario.
-- El contrato es una CONDICION NECESARIA (nunca suficiente):
-- identidad valida + rol efectivo + sede asignada + capacidad contemplada.
-- Los controles de IMEI, actas, costos, rutas y estados siguen en cada RPC.
-- Encargado/Vendedor continuan desactivados por las restricciones existentes.

create or replace function nexora_internal.site_role_scope_basis(
  p_site_id uuid, p_capability text
)
returns boolean language plpgsql stable security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_legacy_role text;
  v_planned_role text;
  v_role_enabled boolean := false;
  v_effective_role text;
  v_site_type text;
begin
  -- Nunca aceptar identificadores de usuario, rol o permisos desde el cliente.
  if v_actor is null or p_site_id is null or p_capability is null then
    return false;
  end if;
  if p_capability not in (
    'inventory.references.manage','inventory.imei.correct','inventory.adjust.authorize',
    'transfers.manage','transfers.edit.before_dispatch','transfers.cancel',
    'warranties.manage','reception.supplier.receive',
    'reception.substitution.approve','reception.invoice.edit',
    'reception.cost.approve','reception.shortage.close',
    'reception.extra.approve','reception.supplier.credit.manage',
    'cash.open','cash.close','cash.reopen','cash.expense.record',
    'sales.cancel','sales.refund.authorize','reports.view','finance.transfer.manage'
  ) then
    return false;
  end if;

  select s.site_type into v_site_type from public.nexora_sites s
  where s.id=p_site_id and s.is_active;
  if v_site_type is null then
    return false;
  end if;

  select p.role,rp.planned_role,coalesce(rp.operationally_enabled,false)
    into v_legacy_role,v_planned_role,v_role_enabled
  from public.bodega_profiles p
  left join public.nexora_staff_role_plans rp on rp.user_id=p.id
  where p.id=v_actor and p.is_active;

  if v_legacy_role='admin' then
    v_effective_role:='admin';
  elsif v_legacy_role='bodeguero' then
    if v_role_enabled and v_planned_role in ('encargado','vendedor') then
      v_effective_role:=v_planned_role;
    else
      v_effective_role:='bodeguero';
    end if;
  else
    return false;
  end if;

  -- El Administrador tiene alcance global. Para cualquier otro rol,
  -- la vinculación a ESTA sede debe continuar activa en el servidor.
  if v_effective_role<>'admin' and not exists (
    select 1 from public.nexora_staff_sites ss
    where ss.user_id=v_actor and ss.site_id=p_site_id and ss.is_active
  ) then
    return false;
  end if;

  -- La matriz sigue el Plan Maestro V4; no concede nuevas credenciales:
  -- nadie externo puede ejecutar esta funcion en el esquema interno.
  if p_capability in (
    'transfers.manage','transfers.edit.before_dispatch','transfers.cancel'
  ) then
    return v_effective_role in ('admin','bodeguero','encargado','vendedor');
  end if;

  if p_capability='inventory.imei.correct' or p_capability='warranties.manage' then
    return v_effective_role in ('admin','bodeguero');
  end if;

  if p_capability in ('reception.supplier.receive','reception.substitution.approve') then
    return v_site_type='principal'
      and v_effective_role in ('admin','bodeguero');
  end if;

  if p_capability in (
    'reception.invoice.edit','reception.cost.approve',
    'reception.shortage.close','reception.extra.approve',
    'reception.supplier.credit.manage'
  ) then
    return v_site_type='principal' and v_effective_role='admin';
  end if;

  if p_capability='cash.open' then
    return v_site_type='local' and v_effective_role in ('admin','encargado');
  end if;
  if p_capability in ('cash.close','cash.expense.record') then
    return v_site_type='local' and v_effective_role='encargado';
  end if;
  if p_capability='cash.reopen' then
    return v_site_type='local' and v_effective_role='admin';
  end if;
  if p_capability='reports.view' then
    return v_effective_role='admin'
      or (v_effective_role='encargado' and v_site_type='local');
  end if;
  if p_capability in ('sales.cancel','sales.refund.authorize') then
    return v_site_type='local' and v_effective_role='admin';
  end if;

  -- Restantes capacidades reconocidas: solo Administrador.
  return v_effective_role='admin';
end;
$$;

-- Fundamento privado sin acceso REST: un PR posterior debe integrar este
-- requisito con controles transaccionales y pruebas de rol antes de activarlo.
revoke all on function nexora_internal.site_role_scope_basis(uuid,text)
  from public,anon,authenticated;

comment on function nexora_internal.site_role_scope_basis(uuid,text) is
  'Base privada de alcance rol/sede del Plan Maestro V4; condicion necesaria, no permiso final. Nunca habilita roles, POS ni movimientos por si sola.';

-- Traslados: comprueba la sede de responsabilidad en cada ETAPA, sin
-- modificar la función ejecutora existente ni su restricción de Administrador.
-- El destino no requiere que el despachador sea empleado del receptor:
-- el receptor verifica su PROPIA sede al aceptar el manifiesto.
create or replace function nexora_internal.transfer_actor_scope_basis(
  p_action text, p_origin uuid, p_destination uuid
)
returns boolean language plpgsql stable security definer
set search_path = pg_catalog
as $
declare
  v_responsible_site uuid;
begin
  if auth.uid() is null or p_action is null
     or p_origin is null or p_destination is null
     or p_origin=p_destination then
    return false;
  end if;
  if p_action not in ('create','dispatch','receive','return','cancel') then
    return false;
  end if;
  -- Matriz del Plan Maestro V4, página 5:
  -- principal → bodega regional directa;
  -- bodega regional → bodega de otra ciudad;
  -- principal/bodega → local dependiente de la misma ciudad;
  -- local → su bodega matriz de la misma ciudad.
  -- Cualquier traslado local → local, bodega → principal o ruta
  -- no reconocida se rechaza. El alcance en sedes ajenas sigue
  -- pendiente de la decisión empresarial prevista en la página 28.
  if not exists (
    select 1 from public.nexora_sites o
    join public.nexora_sites d on d.id=p_destination
    where o.id=p_origin and o.is_active and d.is_active
      and (
        (o.site_type='principal' and d.site_type='bodega'
          and d.parent_site_id=o.id)
        or (o.site_type='bodega' and d.site_type='bodega'
          and o.city_id<>d.city_id)
        or (o.site_type in ('principal','bodega') and d.site_type='local'
          and d.parent_site_id=o.id and o.city_id=d.city_id)
        or (o.site_type='local' and d.site_type in ('principal','bodega')
          and o.parent_site_id=d.id and o.city_id=d.city_id)
      )
  ) then
    return false;
  end if;

  v_responsible_site:=case
    when p_action='receive' then p_destination
    else p_origin
  end;
  return nexora_internal.site_role_scope_basis(
    v_responsible_site,'transfers.manage'
  );
end;
$;
revoke all on function nexora_internal.transfer_actor_scope_basis(text,uuid,uuid)
  from public,anon,authenticated;

comment on function nexora_internal.transfer_actor_scope_basis(text,uuid,uuid) is
  'Alcance preparatorio de traslados por etapa y rutas del Plan V4: principal->regional, regional->regional de otra ciudad, bodega->local dependiente y local->bodega matriz. Origen: create/dispatch/return/cancel; destino: receive. No vinculado a execute_transfer.';
