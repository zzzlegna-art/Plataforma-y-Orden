-- Nexora 2.0 · Planilla de conciliación física basada exclusivamente en registros reales.
-- Solo Administrador, SECURITY INVOKER + RLS. No acredita ubicación ni habilita stock.
create function public.nexora_initial_inventory_worklist()
returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog
as $$
declare
  v_total integer;
  v_other integer;
  v_report jsonb;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede exportar el listado de conteo físico.';
  end if;

  select count(*)::integer into v_total
  from public.bodega_units u
  where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');
  if v_total > 5000 then
    raise exception 'Más de 5000 unidades elegibles: solicita un reporte paginado sin generar un archivo parcial.';
  end if;

  select count(*)::integer into v_other
  from public.bodega_units u
  where u.status not in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');

  with unit_rows as (
    select u.id as unit_id, u.serial, u.status as legacy_status,
      u.unit_condition, u.location as historical_location, u.cost,
      p.sku,p.name as product_name,
      r.id as observation_id,
      r.checked_at as observation_at,
      site.id as observed_site_id,
      site.name as observed_site_name,
      city.name as observed_city_name,
      case
        when r.id is null then 'pendiente'
        when site.is_active and u.serial = r.serial_snapshot
          and u.status = r.status_snapshot then 'cotejado'
        else 'revisar'
      end as reconciliation_state
    from public.bodega_units u
    join public.bodega_products p on p.id = u.product_id
    left join public.nexora_imei_reconciliation r
      on r.unit_id = u.id and r.voided_at is null
    left join public.nexora_sites site on site.id = r.site_id
    left join public.nexora_cities city on city.id = site.city_id
    where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
  )
  select jsonb_build_object(
    'scope','initial_physical_inventory_worklist',
    'snapshotAt',now(),
    'eligible',count(*)::integer,
    'excludedHistorical',v_other,
    'pending',count(*) filter (where reconciliation_state='pendiente'),
    'verified',count(*) filter (where reconciliation_state='cotejado'),
    'stale',count(*) filter (where reconciliation_state='revisar'),
    'withoutValidCost',count(*) filter (where cost is null or cost <= 0),
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'unitId',unit_id,
      'serial',serial,
      'productName',product_name,
      'sku',sku,
      'legacyStatus',legacy_status,
      'condition',unit_condition,
      'historicalLocation',historical_location,
      'cost',cost,
      'reconciliationState',reconciliation_state,
      'observedSiteId',observed_site_id,
      'observedSiteName',observed_site_name,
      'observedCityName',observed_city_name,
      'observedAt',observation_at
    ) order by product_name,sku,serial,unit_id),'[]'::jsonb)
  )
  into v_report from unit_rows;

  if (v_report->>'eligible')::integer <> v_total then
    raise exception 'El inventario cambió durante la generación; vuelve a intentar.';
  end if;
  return v_report;
end;
$$;
revoke all on function public.nexora_initial_inventory_worklist()
  from public,anon,authenticated;
grant execute on function public.nexora_initial_inventory_worklist()
  to authenticated;
comment on function public.nexora_initial_inventory_worklist()
is 'Planilla de inspección física sin mutaciones: solo unidades elegibles, cotejos preparatorios y costo histórico. La sede observada NO acredita inventario aprobado.';
