-- Nexora Multisede 2.0: reporte historico minorista, verificable por sede.
-- Consulta SOLO ventas minoristas confirmadas, sesiones y gastos autorizados.
-- No incluye mayoristas, traslados entre sedes, devoluciones o impuestos.
-- No modifica stock, caja, precios, ingresos, roles ni operaciones.

create function public.nexora_retail_site_financial_report(
  p_from date default null,
  p_to date default null
) returns jsonb
language plpgsql stable security invoker
set search_path=pg_catalog
as $$
declare
  v_to date := coalesce(p_to,(now() at time zone 'America/Bogota')::date);
  v_from date := coalesce(p_from,v_to-29);
  v_stores jsonb;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede consultar el consolidado financiero de locales.';
  end if;
  if v_from>v_to or v_to-v_from>365 then
    raise exception 'Elige un intervalo valido de hasta 366 dias inclusivos.';
  end if;
  if (select count(*) from public.nexora_sites where site_type='local')>200 then
    raise exception 'El reporte supera el maximo seguro de 200 locales.';
  end if;

  with cash as (
    select c.site_id,
      count(*)::integer as sessions,
      count(*) filter(where c.state='open')::integer as open_sessions,
      count(*) filter(where c.state='closed')::integer as closed_sessions,
      coalesce(sum(c.closing_difference) filter(where c.state='closed'),0)::numeric as closing_difference
    from public.nexora_cash_sessions c
    where c.business_date between v_from and v_to
    group by c.site_id
  ),
  sales as (
    select c.site_id,
      count(*)::integer as units_sold,
      coalesce(sum(s.paid_amount),0)::numeric as revenue,
      coalesce(sum(s.unit_cost),0)::numeric as unit_cost,
      coalesce(sum(s.paid_amount) filter(where s.payment_method='efectivo'),0)::numeric as cash_revenue,
      coalesce(sum(s.paid_amount) filter(where s.payment_method='transferencia'),0)::numeric as transfer_revenue
    from public.nexora_retail_sales s
    join public.nexora_cash_sessions c
      on c.id=s.cash_session_id and c.site_id=s.site_id
    where c.business_date between v_from and v_to
    group by c.site_id
  ),
  expenses as (
    select c.site_id,coalesce(sum(e.amount),0)::numeric as amount
    from public.nexora_cash_expenses e
    join public.nexora_cash_sessions c on c.id=e.session_id
    where c.business_date between v_from and v_to
    group by c.site_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'siteId',site.id,'siteName',site.name,
    'cityName',city.name,'active',site.is_active,
    'sessions',coalesce(cash.sessions,0),
    'openSessions',coalesce(cash.open_sessions,0),
    'closedSessions',coalesce(cash.closed_sessions,0),
    'closingDifference',coalesce(cash.closing_difference,0),
    'unitsSold',coalesce(sales.units_sold,0),
    'revenue',coalesce(sales.revenue,0),
    'unitCost',coalesce(sales.unit_cost,0),
    'cashRevenue',coalesce(sales.cash_revenue,0),
    'transferRevenue',coalesce(sales.transfer_revenue,0),
    'grossProfit',coalesce(sales.revenue,0)-coalesce(sales.unit_cost,0),
    'authorizedExpenses',coalesce(expenses.amount,0),
    'grossAfterExpenses',
      coalesce(sales.revenue,0)-coalesce(sales.unit_cost,0)-coalesce(expenses.amount,0)
  ) order by city.name,site.name,site.id),'[]'::jsonb)
  into v_stores
  from public.nexora_sites site
  join public.nexora_cities city on city.id=site.city_id
  left join cash on cash.site_id=site.id
  left join sales on sales.site_id=site.id
  left join expenses on expenses.site_id=site.id
  where site.site_type='local';

  return jsonb_build_object(
    'scope','retail_only_confirmed',
    'timezone','America/Bogota',
    'from',v_from,'to',v_to,
    'stores',v_stores
  );
end;
$$;

revoke all on function public.nexora_retail_site_financial_report(date,date)
  from public,anon,authenticated;
grant execute on function public.nexora_retail_site_financial_report(date,date)
  to authenticated;
comment on function public.nexora_retail_site_financial_report(date,date)
is 'Solo Administrador; reporte de margen bruto en ventas minoristas por costo IMEI, menos gastos autorizados. No es utilidad neta contable ni incluye mayoristas o traslados.';
