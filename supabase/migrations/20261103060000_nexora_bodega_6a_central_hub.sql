-- Nexora Multisede 2.0 · Corrección de origen empresarial.
-- REGLA EXPLÍCITA DEL PROPIETARIO: Bodega 6A es la ÚNICA sede principal.
-- iPhone America es un local dependiente; no es centro de distribución.
-- No crea/elimina sedes, no modifica seriales, pedidos, costos, movimientos, caja ni ventas.
-- Una única migración transaccional para conservar UUID y asociaciones existentes.
do $$
declare
  v_root constant uuid := 'cf03b83a-a23f-4bd2-a778-2c071fa9df2e';
  v_store constant uuid := 'd1ee58e6-de76-4f66-8561-b882c9b831af';
  v_city uuid;
  v_root_city uuid;
  v_count integer;
begin
  -- Evita migrar con inventario ya aprobado o transferencias activas.
  if exists(select 1 from public.nexora_initial_inventory_approvals)
    or exists(select 1 from public.nexora_initial_unit_sites)
    or exists(select 1 from public.nexora_retail_sales)
    or exists(select 1 from public.nexora_transfer_lines)
    or exists(select 1 from public.nexora_unit_custody) then
    raise exception 'La jerarquía ya tiene operaciones multisede; requiere migración asistida.';
  end if;
  select count(*)::integer into v_count from public.nexora_sites;
  if v_count <> 2 then
    raise exception 'La red cambió: se esperaban exactamente dos sedes históricas.';
  end if;
  select s.city_id into v_root_city
  from public.nexora_sites s join public.nexora_cities c on c.id=s.city_id
  where s.id=v_root and btrim(s.name)='Bodega 6A'
    and s.site_type='bodega' and s.parent_site_id=v_store
    and s.is_active and btrim(c.name)='Barranquilla';
  if v_root_city is null then
    raise exception 'Bodega 6A no coincide con la sede de origen histórica esperada.';
  end if;
  select s.city_id into v_city from public.nexora_sites s
  where s.id=v_store and btrim(s.name)='iPhone America'
    and s.site_type='principal' and s.parent_site_id is null and s.is_active;
  if v_city is distinct from v_root_city then
    raise exception 'El local iPhone America no coincide con la ciudad de Bodega 6A.';
  end if;
  -- La restricción única impide dos principales a la vez. Primero se
  -- reclasifica el local, luego se promueve 6A como raíz de la red.
  -- La jerarquía intermedia solo existe dentro de esta transacción.
  execute 'alter table public.nexora_sites disable trigger nexora_validate_site_hierarchy_trigger';
  update public.nexora_sites set
    site_type='local',parent_site_id=v_root,updated_at=now()
    where id=v_store;
  if not found then raise exception 'No se pudo reclasificar el local dependiente.'; end if;
  update public.nexora_sites set
    site_type='principal',parent_site_id=null,updated_at=now()
    where id=v_root;
  if not found then raise exception 'No se pudo establecer Bodega 6A como principal.'; end if;
  execute 'alter table public.nexora_sites enable trigger nexora_validate_site_hierarchy_trigger';
  if (select count(*) from public.nexora_sites where site_type='principal')<>1
     or not exists(select 1 from public.nexora_sites
       where id=v_root and name='Bodega 6A' and site_type='principal' and parent_site_id is null)
     or not exists(select 1 from public.nexora_sites
       where id=v_store and name='iPhone America' and site_type='local' and parent_site_id=v_root)
     or exists(select 1 from public.nexora_sites s where s.id<>v_root
       and s.parent_site_id is distinct from v_root) then
    raise exception 'La jerarquía final no coincide con el origen Bodega 6A.';
  end if;
end;
$$;

-- Conservar el acta 6A: el centro de distribución ahora es de tipo principal,
-- NO de tipo bodega regional. No se firma ningún acta en esta migración.
create or replace function public.nexora_warehouse_6a_opening_preflight()
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog
as $$
declare
  v_site uuid;
  v_site_count integer;
  v_eligible integer;
  v_sold integer;
  v_other integer;
  v_no_cost integer;
  v_scans integer;
  v_mapped integer;
  v_approvals integer;
  v_custody integer;
  v_transfers integer;
  v_fp text;
  v_allowed boolean;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede preparar el acta de Bodega 6A.';
  end if;
  select count(*)::integer,(array_agg(s.id))[1]
    into v_site_count,v_site
    from public.nexora_sites s join public.nexora_cities c on c.id=s.city_id
    where btrim(s.name)='Bodega 6A' and s.site_type='principal' and s.parent_site_id is null
      and s.is_active and btrim(c.name)='Barranquilla';
  select count(*) filter(where status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso'))::integer,
    count(*) filter(where status='vendido')::integer,
    count(*) filter(where status not in
      ('en_bodega','en_local','en_transito','en_reparacion','defectuoso','vendido'))::integer,
    count(*) filter(where status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
      and (cost is null or cost<=0))::integer
    into v_eligible,v_sold,v_other,v_no_cost from public.bodega_units;
  select count(*)::integer into v_scans from public.nexora_imei_reconciliation where voided_at is null;
  select count(*)::integer into v_mapped from public.nexora_initial_unit_sites;
  select count(*)::integer into v_approvals from public.nexora_initial_inventory_approvals;
  select count(*)::integer into v_custody from public.nexora_unit_custody;
  select count(*)::integer into v_transfers from public.nexora_transfer_lines
    where state in ('prepared','in_transit','return_pending');
  select md5(coalesce(string_agg(u.id::text||'|'||u.serial||'|'||u.status,',' order by u.id::text),''))
    into v_fp from public.bodega_units u
    where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');
  v_allowed := v_site_count=1 and v_eligible>0 and v_other=0
    and (select count(*) from public.bodega_units where status='en_bodega')=v_eligible
    and v_scans=0 and v_mapped=0 and v_approvals=0 and v_custody=0 and v_transfers=0;
  return jsonb_build_object(
    'scope','warehouse_6a_declaration_preflight',
    'siteId',v_site,'siteName',case when v_site_count=1 then 'Bodega 6A' else null end,
    'eligible',v_eligible,'soldHistorical',v_sold,'otherHistorical',v_other,
    'withoutValidCost',v_no_cost,
    'activeImeiScans',v_scans,'mappedUnits',v_mapped,'priorApprovals',v_approvals,
    'custodyRows',v_custody,'inFlightTransferLines',v_transfers,
    'inventoryFingerprint',v_fp,'canCertify',v_allowed,'snapshotAt',now(),
    'physicalPresenceIndependentlyVerified',false);
end;
$$;

create or replace function nexora_internal.certify_warehouse_6a_opening(
  p_site_id uuid,p_expected_eligible integer,p_expected_sold integer,
  p_inventory_fingerprint text,p_support_note text,p_confirmation text)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog
as $$
declare
  v_site_count integer;
  v_eligible integer;
  v_sold integer;
  v_no_cost integer;
  v_other integer;
  v_scans integer;
  v_mapped integer;
  v_approved integer;
  v_custody integer;
  v_transfers integer;
  v_fp text;
  v_approval uuid;
  v_inserted integer;
  v_statement constant text :=
    'Declaro bajo mi responsabilidad administrativa que los equipos elegibles registrados constituyen el inventario físico actual de Bodega 6A, que he revisado sus registros y que autorizo su apertura excepcional sin escaneo individual; los equipos vendidos son solamente historial y los costos faltantes no se presumen.';
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede firmar el acta excepcional.';
  end if;
  if p_confirmation is distinct from 'CERTIFICO BODEGA 6A'
    or p_support_note is null or length(btrim(p_support_note))<30
    or length(btrim(p_support_note))>1000 then
    raise exception 'Falta confirmación explícita y soporte administrativo suficiente.';
  end if;
  if p_site_id is null or p_expected_eligible is null or p_expected_eligible<1
    or p_expected_sold is null or p_expected_sold<0
    or p_inventory_fingerprint is null or length(p_inventory_fingerprint)<>32 then
    raise exception 'Faltan los datos verificados del corte de inventario.';
  end if;
  -- Misma disciplina de bloqueos que la aprobación normal; no se permite carrera.
  lock table public.nexora_initial_inventory_approvals in exclusive mode;
  lock table public.bodega_units in share mode;
  lock table public.nexora_imei_reconciliation in share mode;
  lock table public.nexora_sites in share mode;
  lock table public.nexora_initial_unit_sites in share mode;
  lock table public.nexora_unit_custody in share mode;
  lock table public.nexora_transfer_lines in share mode;
  select count(*)::integer into v_site_count
    from public.nexora_sites s join public.nexora_cities c on c.id=s.city_id
    where s.id=p_site_id and btrim(s.name)='Bodega 6A'
      and s.site_type='principal' and s.parent_site_id is null and s.is_active and btrim(c.name)='Barranquilla';
  select count(*) filter(where status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso'))::integer,
    count(*) filter(where status='vendido')::integer,
    count(*) filter(where status not in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso','vendido'))::integer,
    count(*) filter(where status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
      and (cost is null or cost<=0))::integer
    into v_eligible,v_sold,v_other,v_no_cost from public.bodega_units;
  select count(*)::integer into v_scans from public.nexora_imei_reconciliation where voided_at is null;
  select count(*)::integer into v_mapped from public.nexora_initial_unit_sites;
  select count(*)::integer into v_approved from public.nexora_initial_inventory_approvals;
  select count(*)::integer into v_custody from public.nexora_unit_custody;
  select count(*)::integer into v_transfers from public.nexora_transfer_lines
    where state in ('prepared','in_transit','return_pending');
  select md5(coalesce(string_agg(u.id::text||'|'||u.serial||'|'||u.status,',' order by u.id::text),''))
    into v_fp from public.bodega_units u
    where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');
  if v_site_count<>1 or v_eligible<>p_expected_eligible or v_sold<>p_expected_sold
    or v_eligible=0 or v_other<>0 or
    (select count(*) from public.bodega_units where status='en_bodega')<>v_eligible
    or v_fp<>p_inventory_fingerprint or v_scans<>0 or v_mapped<>0 or
    v_approved<>0 or v_custody<>0 or v_transfers<>0 then
    raise exception 'Acta bloqueada: sede, IMEI, estados, huella o historial cambiaron. Actualiza el corte, revisa y firma nuevamente.';
  end if;
  insert into public.nexora_initial_inventory_approvals
    (approved_by,unit_count,verification_method,origin_site_id,
     declaration_text,support_note,snapshot_fingerprint,historical_sold_count,units_without_cost)
  values
    (auth.uid(),v_eligible,'admin_declaration_6a',p_site_id,
     v_statement,btrim(p_support_note),v_fp,v_sold,v_no_cost)
  returning id into v_approval;
  insert into public.nexora_initial_unit_sites
    (unit_id,site_id,observation_id,approval_id,serial_snapshot,status_snapshot,
     cost_snapshot,verification_method)
    select u.id,p_site_id,null,v_approval,u.serial,u.status,u.cost,'admin_declaration_6a'
    from public.bodega_units u
    where u.status='en_bodega' order by u.id;
  get diagnostics v_inserted = row_count;
  if v_inserted<>v_eligible then
    raise exception 'La certificación es incompleta. Toda la transacción fue revertida.';
  end if;
  return jsonb_build_object('scope','warehouse_6a_admin_declaration',
    'approvalId',v_approval,'approvedCount',v_inserted,'historicalSold',v_sold,
    'siteId',p_site_id,'withoutValidCost',v_no_cost,
    'method','admin_declaration_6a','individualImeiScans',0,
    'approvedAt',now(),'inventoryFingerprint',v_fp,
    'salesEnabled',false,'costsValidated',false);
end;
$$;

comment on function public.nexora_warehouse_6a_opening_preflight()
  is 'Bodega 6A principal en Barranquilla: prevalidación de declaración, sin escanear ni aprobar.';
comment on function nexora_internal.certify_warehouse_6a_opening(uuid,integer,integer,text,text,text)
  is 'Firma administrativa explícita, Bodega 6A como sede principal, sin escaneos ficticios.';

-- Endurece futuras redes: no se permite reemplazar 6A como raíz
-- sin una migración administrativa nueva, pero sí añadir locales/regionales.
create or replace function public.nexora_validate_site_hierarchy()
returns trigger language plpgsql set search_path=pg_catalog,public
as $$
declare
  parent_kind text;
  parent_city uuid;
  parent_active boolean;
  v_root constant uuid := 'cf03b83a-a23f-4bd2-a778-2c071fa9df2e';
begin
  if tg_op='UPDATE' then
    if new.id is distinct from old.id
      or new.city_id is distinct from old.city_id
      or new.site_type is distinct from old.site_type
      or new.parent_site_id is distinct from old.parent_site_id
      or new.created_at is distinct from old.created_at then
      raise exception 'La estructura de una sede no puede cambiar después de crearla.';
    end if;
    if old.is_active and not new.is_active and exists(
      select 1 from public.nexora_sites s
      where s.parent_site_id=old.id and s.is_active) then
      raise exception 'Desactiva primero los puntos dependientes.';
    end if;
  end if;
  if new.site_type='principal' then
    if new.id<>v_root or new.parent_site_id is not null
      or btrim(new.name)<>'Bodega 6A' then
      raise exception 'Bodega 6A es la única sede principal y de origen de Nexora.';
    end if;
  else
    select s.site_type,s.city_id,s.is_active
      into parent_kind,parent_city,parent_active
      from public.nexora_sites s
      where s.id=new.parent_site_id;
    if not found or not parent_active then
      raise exception 'Selecciona una sede de origen activa.';
    end if;
    if new.site_type='bodega' and
      (parent_kind<>'principal' or new.parent_site_id<>v_root) then
      raise exception 'Las bodegas regionales dependen directamente de Bodega 6A.';
    end if;
    if new.site_type='local' and
       (parent_kind not in ('principal','bodega') or parent_city<>new.city_id) then
      raise exception 'El local debe depender de Bodega 6A o una bodega de su misma ciudad.';
    end if;
  end if;
  new.updated_at:=now();
  return new;
end;
$$;
comment on function public.nexora_validate_site_hierarchy()
  is 'Origen principal fijo Bodega 6A. Regionales dependen de 6A; locales dependen de 6A o regional de su ciudad.';
