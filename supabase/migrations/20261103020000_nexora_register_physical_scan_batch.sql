-- Nexora Multisede 2.0 · Cotejo físico por lotes de escáner.
-- Escribirá únicamente evidencias de IMEI REALMENTE escaneados por un Administrador.
-- Atómico: cualquier serial incorrecto/duplicado revierte el lote completo.
-- No altera bodega_units, su ubicación comercial, ventas o traslados.
create function public.nexora_register_physical_scan_batch(
  p_site_id uuid,
  p_serials text[],
  p_notes text default null
) returns jsonb
language plpgsql volatile security invoker
set search_path=pg_catalog
as $$
declare
  v_input_count integer;
  v_found_count integer;
  v_inserted integer;
  v_results jsonb;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede registrar un lote de conteo físico.';
  end if;
  if exists (select 1 from public.nexora_initial_inventory_approvals) then
    raise exception 'El inventario inicial ya está aprobado y no puede volver a cotejarse.';
  end if;
  if p_site_id is null or not exists (
    select 1 from public.nexora_sites where id=p_site_id and is_active
  ) then
    raise exception 'Selecciona una sede activa y verificada.';
  end if;
  v_input_count := coalesce(array_length(p_serials,1),0);
  if v_input_count<1 or v_input_count>50 or array_ndims(p_serials)<>1 then
    raise exception 'Escanea entre 1 y 50 IMEI por lote.';
  end if;
  if p_notes is not null and length(btrim(p_notes))>500 then
    raise exception 'Las notas del conteo superan 500 caracteres.';
  end if;
  if exists (
    select 1 from unnest(p_serials) as item(serial)
    where serial is null or length(btrim(serial))=0 or length(btrim(serial))>160
  ) then
    raise exception 'El lote contiene un IMEI vacío o demasiado largo.';
  end if;
  if (select count(distinct lower(btrim(serial)))
      from unnest(p_serials) as item(serial)) <> v_input_count then
    raise exception 'Existen IMEI repetidos dentro del lote: no se guardó ninguno.';
  end if;

  select count(*)::integer into v_found_count
  from unnest(p_serials) as scan(serial)
  join public.bodega_units u on lower(btrim(u.serial))=lower(btrim(scan.serial))
  where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');
  if v_found_count <> v_input_count then
    raise exception 'Uno o más IMEI no existen o están vendidos, liberados o no disponibles. No se guardó el lote.';
  end if;
  if exists (
    select 1 from unnest(p_serials) as scan(serial)
    join public.bodega_units u on lower(btrim(u.serial))=lower(btrim(scan.serial))
    join public.nexora_imei_reconciliation r on r.unit_id=u.id and r.voided_at is null
  ) then
    raise exception 'El lote incluye un IMEI ya cotejado. No se guardó ninguno.';
  end if;

  with inserted as (
    insert into public.nexora_imei_reconciliation (unit_id,site_id,notes)
    select u.id,p_site_id,nullif(btrim(p_notes),'')
    from unnest(p_serials) as scan(serial)
    join public.bodega_units u on lower(btrim(u.serial))=lower(btrim(scan.serial))
    order by u.id
    returning id,unit_id,site_id,serial_snapshot,status_snapshot,checked_at
  )
  select count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'observationId',id,
      'unitId',unit_id,
      'siteId',site_id,
      'serial',serial_snapshot,
      'status',status_snapshot,
      'checkedAt',checked_at
    ) order by serial_snapshot,id),'[]'::jsonb)
  into v_inserted,v_results from inserted;

  if v_inserted <> v_input_count then
    raise exception 'No se confirmó el lote completo. Transacción revertida.';
  end if;
  return jsonb_build_object('scope','physical_scan_batch',
    'siteId',p_site_id,'registered',v_inserted,'items',v_results,
    'inventoryApproved',false);
end;
$$;
revoke all on function public.nexora_register_physical_scan_batch(uuid,text[],text)
  from public,anon,authenticated;
grant execute on function public.nexora_register_physical_scan_batch(uuid,text[],text)
  to authenticated;
comment on function public.nexora_register_physical_scan_batch(uuid,text[],text)
is 'Registro administrativo ATÓMICO de máximo 50 IMEI escaneados físicamente. Solo evidencias preparatorias; no mueve existencias.';
