-- Nexora Multisede 2.0 · apertura excepcional Bodega 6A.
-- Separa inequívocamente "declaración administrativa" de "escaneo IMEI".
-- La migración SOLO instala controles: NO certifica un solo equipo.
alter table public.nexora_initial_inventory_approvals
  add column if not exists verification_method text not null default 'imei_scan';
alter table public.nexora_initial_inventory_approvals
  add column if not exists origin_site_id uuid references public.nexora_sites(id) on delete restrict;
alter table public.nexora_initial_inventory_approvals
  add column if not exists declaration_text text;
alter table public.nexora_initial_inventory_approvals
  add column if not exists support_note text;
alter table public.nexora_initial_inventory_approvals
  add column if not exists snapshot_fingerprint text;
alter table public.nexora_initial_inventory_approvals
  add column if not exists historical_sold_count integer;
alter table public.nexora_initial_inventory_approvals
  add column if not exists units_without_cost integer;
alter table public.nexora_initial_inventory_approvals
  add constraint nexora_initial_approval_method_check
  check (verification_method in ('imei_scan','admin_declaration_6a') and
    (verification_method = 'imei_scan' or
     (origin_site_id is not null and length(declaration_text)>=80
      and length(support_note)>=30 and length(snapshot_fingerprint)=32
      and historical_sold_count >= 0 and units_without_cost>=0)));

alter table public.nexora_initial_unit_sites
  alter column observation_id drop not null;
alter table public.nexora_initial_unit_sites
  add column if not exists verification_method text not null default 'imei_scan';
alter table public.nexora_initial_unit_sites
  add constraint nexora_initial_snapshot_method_check
  check ((verification_method='imei_scan' and observation_id is not null) or
         (verification_method='admin_declaration_6a' and observation_id is null));

comment on column public.nexora_initial_unit_sites.verification_method is
  'imei_scan = lectura por IMEI; admin_declaration_6a = certificación EXPLÍCITA por Administrador, SIN escaneo.';
comment on column public.nexora_initial_inventory_approvals.declaration_text is
  'Declaración administrativa explícita, NO prueba de escaneo individual.';

-- Preflight solo lectura bajo RLS: cliente puede obtener huella y conteos vigentes.
create function public.nexora_warehouse_6a_opening_preflight()
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
    where btrim(s.name)='Bodega 6A' and s.site_type='bodega'
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
revoke all on function public.nexora_warehouse_6a_opening_preflight() from public,anon,authenticated;
grant execute on function public.nexora_warehouse_6a_opening_preflight() to authenticated;

-- Certificación excepcional, imposible sin declaración explícita posterior.
-- NOTA: Este procedimiento NO registra escaneos; guarda evidencia por declaración.
create function nexora_internal.certify_warehouse_6a_opening(
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
      and s.site_type='bodega' and s.is_active and btrim(c.name)='Barranquilla';
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
revoke all on function nexora_internal.certify_warehouse_6a_opening(uuid,integer,integer,text,text,text)
  from public,anon,authenticated;
grant execute on function nexora_internal.certify_warehouse_6a_opening(uuid,integer,integer,text,text,text)
  to authenticated;
create function public.nexora_certify_warehouse_6a_opening(
  p_site_id uuid,p_expected_eligible integer,p_expected_sold integer,
  p_inventory_fingerprint text,p_support_note text,p_confirmation text)
returns jsonb language sql volatile security invoker set search_path=pg_catalog
as $$
  select nexora_internal.certify_warehouse_6a_opening(
    p_site_id,p_expected_eligible,p_expected_sold,
    p_inventory_fingerprint,p_support_note,p_confirmation)
$$;
revoke all on function public.nexora_certify_warehouse_6a_opening(uuid,integer,integer,text,text,text)
  from public,anon,authenticated;
grant execute on function public.nexora_certify_warehouse_6a_opening(uuid,integer,integer,text,text,text)
  to authenticated;

-- La comprobación individual sigue siendo real; ahora se identifica el método
-- del acta para NO confundir una declaración con un escaneo.
create or replace function public.nexora_initial_inventory_progress()
returns jsonb language plpgsql stable set search_path=pg_catalog,public as $$
declare
  v_total bigint;
  v_valid bigint;
  v_stale bigint;
  v_approved bigint;
  v_approved_at timestamptz;
  v_method text;
  v_certified bigint;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede consultar la aprobación inicial.';
  end if;
  select count(*) into v_total from public.bodega_units u
    where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');
  select count(*) into v_valid
    from public.nexora_imei_reconciliation r
    join public.bodega_units u on u.id=r.unit_id
    join public.nexora_sites s on s.id=r.site_id
    where r.voided_at is null and s.is_active
      and u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
      and u.status=r.status_snapshot and u.serial=r.serial_snapshot;
  select count(*) into v_stale
    from public.nexora_imei_reconciliation r
    join public.bodega_units u on u.id=r.unit_id
    join public.nexora_sites s on s.id=r.site_id
    where r.voided_at is null and
      (not s.is_active or u.status is distinct from r.status_snapshot or
       u.serial is distinct from r.serial_snapshot or
       u.status not in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso'));
  select a.unit_count,a.approved_at,a.verification_method
    into v_approved,v_approved_at,v_method
    from public.nexora_initial_inventory_approvals a limit 1;
  select count(*) into v_certified from public.nexora_initial_unit_sites
    where verification_method='admin_declaration_6a';
  return jsonb_build_object(
    'total',v_total,'verified',v_valid,'pending',greatest(0,v_total-v_valid),
    'stale',v_stale,'approved',coalesce(v_approved,0),'approvedAt',v_approved_at,
    'isApproved',v_approved_at is not null,
    'approvalMethod',v_method,'certifiedByDeclaration',v_certified,
    'ready',v_approved_at is null and v_total>0 and v_total=v_valid and v_stale=0);
end;
$$;
comment on function public.nexora_certify_warehouse_6a_opening(uuid,integer,integer,text,text,text)
is 'Acta excepcional administrativa por declaración explícita, NO por escaneo. Solo ejecutable por Administrador autenticado.';
