-- Nexora Multisede 2.0: diagnóstico de soportes de costo por recepción.
-- El dato de recepción es una pista documental, NO acredita costo unitario.
-- No escribe costos, no altera inventario ni habilita POS.
create function public.nexora_cost_evidence_by_reception()
returns jsonb
language plpgsql stable security invoker
set search_path=pg_catalog
as $$
declare
  v_result jsonb;
  v_eligible integer;
  v_missing integer;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede consultar soportes de costo.';
  end if;

  select count(*)::integer,
    count(*) filter (where u.cost is null or u.cost<=0)::integer
    into v_eligible,v_missing
  from public.bodega_units u
  where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');

  with grouped as (
    select u.reception_id,
      coalesce(r.code,'SIN RECEPCIÓN') as reception_code,
      r.reference as receipt_reference,
      r.status as receipt_status,
      r.received_at,
      s.name as supplier_name,
      count(*)::integer as eligible,
      count(*) filter (where u.cost is null or u.cost<=0)::integer as without_cost,
      count(*) filter (where u.cost>0)::integer as with_cost,
      count(distinct u.product_id)::integer as references_count
    from public.bodega_units u
    left join public.bodega_receptions r on r.id=u.reception_id
    left join public.suppliers s on s.id=r.supplier_id
    where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
    group by u.reception_id,r.code,r.reference,r.status,r.received_at,s.name
  )
  select jsonb_build_object(
    'scope','cost_recovery_evidence_only',
    'snapshotAt',now(),
    'eligible',v_eligible,
    'withoutCost',v_missing,
    'withCost',v_eligible-v_missing,
    'receipts',count(*)::integer,
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'receptionId',reception_id,
      'receptionCode',reception_code,
      'receiptReference',receipt_reference,
      'receiptStatus',receipt_status,
      'receivedAt',received_at,
      'supplierName',supplier_name,
      'eligible',eligible,
      'withoutCost',without_cost,
      'withCost',with_cost,
      'referencesCount',references_count
    ) order by without_cost desc,reception_code,reception_id),'[]'::jsonb)
  ) into v_result
  from grouped;

  if coalesce((select sum((entry->>'eligible')::integer)
      from jsonb_array_elements(v_result->'items') entry),0)<>v_eligible
    or coalesce((select sum((entry->>'withoutCost')::integer)
      from jsonb_array_elements(v_result->'items') entry),0)<>v_missing then
    raise exception 'El diagnóstico de costos no coincide con el inventario: vuelve a consultarlo.';
  end if;
  return v_result;
end;
$$;
revoke all on function public.nexora_cost_evidence_by_reception()
  from public,anon,authenticated;
grant execute on function public.nexora_cost_evidence_by_reception()
  to authenticated;
comment on function public.nexora_cost_evidence_by_reception()
is 'Diagnóstico administrativo por recepción de IMEI físicos sin costo unitario válido. Los enlaces de recepción solo sirven para buscar facturas reales; no modifican costos ni stock.';
