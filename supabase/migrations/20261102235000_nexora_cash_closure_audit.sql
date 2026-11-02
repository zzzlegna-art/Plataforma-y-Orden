-- Nexora Multisede 2.0: auditoría histórica de cierres por sesión.
-- Lectura exclusiva de Administrador con RLS del invocador.
-- No reabre cajas, no altera importes, no crea ventas ni sedes.

create function public.nexora_cash_closure_audit(
  p_from date default null,
  p_to date default null,
  p_site_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog
as $$
declare
  v_to date := coalesce(p_to,(now() at time zone 'America/Bogota')::date);
  v_from date := coalesce(p_from,v_to-29);
  v_total integer;
  v_items jsonb;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede consultar auditoría de caja.';
  end if;
  if v_from>v_to or v_to-v_from>365 or p_page is null or p_page<1
    or p_page>10000 or p_page_size is null or p_page_size<1 or p_page_size>50 then
    raise exception 'Período o paginación de auditoría inválidos.';
  end if;
  if p_site_id is not null and not exists (
    select 1 from public.nexora_sites
    where id=p_site_id and site_type='local'
  ) then
    raise exception 'El local de caja solicitado no existe.';
  end if;

  select count(*)::integer into v_total
  from public.nexora_cash_sessions cs
  where cs.business_date between v_from and v_to
    and (p_site_id is null or cs.site_id=p_site_id);

  with base as (
    select cs.id,cs.site_id,s.name as site_name,city.name as city_name,
      cs.business_date,cs.state,cs.opened_at,cs.closed_at,
      cs.opening_cash,cs.closing_expected_cash,cs.closing_counted_cash,cs.closing_difference,
      coalesce((select sum(sale.paid_amount)
        from public.nexora_retail_sales sale
        where sale.cash_session_id=cs.id and sale.payment_method='efectivo'),0)::numeric as cash_sales,
      coalesce((select sum(sale.paid_amount)
        from public.nexora_retail_sales sale
        where sale.cash_session_id=cs.id and sale.payment_method='transferencia'),0)::numeric as transfer_sales,
      coalesce((select sum(e.amount)
        from public.nexora_cash_expenses e where e.session_id=cs.id),0)::numeric as authorized_expenses,
      (select count(*)::integer from public.nexora_cash_events ev
        where ev.session_id=cs.id and ev.action='reopen') as reopen_count,
      (select count(*)::integer from public.nexora_cash_events ev
        where ev.session_id=cs.id) as event_count
    from public.nexora_cash_sessions cs
    join public.nexora_sites s on s.id=cs.site_id and s.site_type='local'
    join public.nexora_cities city on city.id=s.city_id
    where cs.business_date between v_from and v_to
      and (p_site_id is null or cs.site_id=p_site_id)
    order by cs.business_date desc,city.name,s.name,cs.id
    limit p_page_size offset (p_page-1)*p_page_size
  ),
  amounts as (
    select *,
      opening_cash+cash_sales-authorized_expenses as expected_cash_calculated,
      case when state='closed' and closing_counted_cash is not null
        then closing_counted_cash-(opening_cash+cash_sales-authorized_expenses)
      end as difference_calculated
    from base
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'sessionId',a.id,'siteId',a.site_id,
    'siteName',a.site_name,'cityName',a.city_name,
    'businessDate',a.business_date,'state',a.state,
    'openedAt',a.opened_at,'closedAt',a.closed_at,
    'openingCash',a.opening_cash,
    'cashSales',a.cash_sales,'transferSales',a.transfer_sales,
    'authorizedExpenses',a.authorized_expenses,
    'expectedCashCalculated',a.expected_cash_calculated,
    'recordedExpectedCash',a.closing_expected_cash,
    'countedCash',a.closing_counted_cash,
    'recordedDifference',a.closing_difference,
    'differenceCalculated',a.difference_calculated,
    'reopenCount',a.reopen_count,'eventCount',a.event_count,
    'hasCashDifference',a.state='closed' and a.closing_difference<>0,
    'hasIntegrityMismatch',a.state='closed' and
      (a.closing_expected_cash is distinct from a.expected_cash_calculated
       or a.closing_difference is distinct from a.difference_calculated)
  ) order by a.business_date desc,a.city_name,a.site_name,a.id),'[]'::jsonb)
  into v_items from amounts a;

  return jsonb_build_object('scope','admin_cash_session_audit',
    'timezone','America/Bogota','from',v_from,'to',v_to,
    'siteId',p_site_id,'page',p_page,'pageSize',p_page_size,
    'total',v_total,'items',v_items);
end;
$$;

revoke all on function public.nexora_cash_closure_audit(date,date,uuid,integer,integer)
  from public,anon,authenticated;
grant execute on function public.nexora_cash_closure_audit(date,date,uuid,integer,integer)
  to authenticated;
comment on function public.nexora_cash_closure_audit(date,date,uuid,integer,integer)
is 'Auditoría de solo lectura por sesión: efectivo esperado recalculado, arqueo, diferencias e historial de reaperturas; únicamente Administrador.';
