-- NEXORA: registrar procedencia histórica Bodega 6A por declaración del propietario.
-- NO equivale a escaneo, conteo físico, avalúo ni firma digital del Administrador.
-- Conserva estados, seriales, recepciones, ventas, pedidos y costos sin modificarlos.
begin;

lock table public.bodega_units in share row exclusive mode;
lock table public.nexora_initial_inventory_approvals in share row exclusive mode;
lock table public.nexora_initial_unit_sites in share row exclusive mode;
lock table public.nexora_imei_reconciliation in share row exclusive mode;
lock table public.nexora_unit_custody in share row exclusive mode;
lock table public.nexora_transfer_lines in share row exclusive mode;

alter table public.nexora_initial_inventory_approvals
  alter column approved_by drop not null;
alter table public.nexora_initial_inventory_approvals
  drop constraint nexora_initial_approval_method_check;
alter table public.nexora_initial_inventory_approvals
  add constraint nexora_initial_approval_method_check
  check (
    verification_method in ('imei_scan','admin_declaration_6a','owner_legacy_origin_6a')
    and (
      verification_method='imei_scan'
      or (
        origin_site_id is not null
        and length(declaration_text)>=80
        and length(support_note)>=30
        and length(snapshot_fingerprint)=32
        and historical_sold_count>=0
        and units_without_cost>=0
      )
    )
    and (verification_method<>'owner_legacy_origin_6a' or approved_by is null)
  );

alter table public.nexora_initial_unit_sites
  drop constraint nexora_initial_snapshot_method_check;
alter table public.nexora_initial_unit_sites
  add constraint nexora_initial_snapshot_method_check check (
    (verification_method='imei_scan' and observation_id is not null) or
    (verification_method in ('admin_declaration_6a','owner_legacy_origin_6a') and observation_id is null)
  );

create table public.nexora_historical_origin_6a (
  unit_id uuid primary key references public.bodega_units(id) on delete restrict,
  site_id uuid not null references public.nexora_sites(id) on delete restrict,
  serial_snapshot text not null,
  status_snapshot text not null,
  source text not null default 'owner_statement_legacy_6a'
    check (source='owner_statement_legacy_6a'),
  recorded_at timestamptz not null default now()
);
alter table public.nexora_historical_origin_6a enable row level security;
create policy nexora_historical_origin_6a_admin_read
on public.nexora_historical_origin_6a for select to authenticated
using ((select public.bodega_is_admin()));
revoke all on public.nexora_historical_origin_6a from public,anon,authenticated;
grant select on public.nexora_historical_origin_6a to authenticated;

do $baseline$
declare
  v_site uuid;
  v_nsites integer;
  v_total integer;
  v_available integer;
  v_sold integer;
  v_other integer;
  v_without_cost integer;
  v_fp text;
  v_approval uuid;
  v_inserted integer;
begin
  select count(*),(array_agg(s.id))[1]
    into v_nsites,v_site
    from public.nexora_sites s
    join public.nexora_cities c on c.id=s.city_id
    where s.name='Bodega 6A' and c.name='Barranquilla'
      and s.site_type='principal' and s.parent_site_id is null and s.is_active;

  select count(*),
         count(*) filter(where status='en_bodega'),
         count(*) filter(where status='vendido'),
         count(*) filter(where status not in ('en_bodega','vendido')),
         count(*) filter(where status='en_bodega' and (cost is null or cost<=0))
  into v_total,v_available,v_sold,v_other,v_without_cost
  from public.bodega_units;

  if v_nsites<>1 or v_total<>3171 or v_available<>2776
     or v_sold<>395 or v_other<>0 then
    raise exception 'Corte histórico diferente del informado. No se realizó ningún cambio.';
  end if;
  if exists(select 1 from public.nexora_initial_inventory_approvals)
   or exists(select 1 from public.nexora_initial_unit_sites)
   or exists(select 1 from public.nexora_unit_custody)
   or exists(select 1 from public.nexora_imei_reconciliation where voided_at is null)
   or exists(select 1 from public.nexora_transfer_lines)
   or exists(select 1 from public.nexora_retail_sales) then
    raise exception 'Ya hay operaciones multisede: no puede aplicarse este corte inicial.';
  end if;
  select md5(coalesce(string_agg(u.id::text||'|'||u.serial||'|'||u.status,',' order by u.id::text),''))
    into v_fp from public.bodega_units u where u.status='en_bodega';

  -- Marca TODOS los históricos, incluidos vendidos, como procedentes de 6A.
  insert into public.nexora_historical_origin_6a
    (unit_id,site_id,serial_snapshot,status_snapshot)
  select id,v_site,serial,status from public.bodega_units;
  get diagnostics v_inserted=row_count;
  if v_inserted<>v_total then
    raise exception 'No se registró el origen completo del inventario histórico.';
  end if;

  -- La tabla de corte alimenta la ruta operativa existente; no es una firma
  -- del administrador ni prueba de presencia física.
  insert into public.nexora_initial_inventory_approvals (
    approved_by,unit_count,verification_method,origin_site_id,
    declaration_text,support_note,snapshot_fingerprint,
    historical_sold_count,units_without_cost
  ) values (
    null,v_available,'owner_legacy_origin_6a',v_site,
    'El propietario confirmó expresamente que todos los productos, seriales y registros históricos existentes de Nexora tienen como sede de origen la Bodega 6A de Barranquilla. Este registro documental no representa un conteo, escaneo ni verificación física.',
    'Registro de procedencia histórica declarado por el propietario en conversación; se respetan los estados originales y se excluyen de existencias los vendidos. Ningún costo se ha estimado ni certificado.',
    v_fp,v_sold,v_without_cost
  ) returning id into v_approval;

  insert into public.nexora_initial_unit_sites
    (unit_id,site_id,observation_id,approval_id,serial_snapshot,
     status_snapshot,cost_snapshot,verification_method)
  select u.id,v_site,null,v_approval,u.serial,u.status,u.cost,'owner_legacy_origin_6a'
    from public.bodega_units u where u.status='en_bodega' order by u.id;

  get diagnostics v_inserted=row_count;
  if v_inserted<>v_available then
    raise exception 'No se asignaron todas las unidades vigentes a Bodega 6A.';
  end if;
end;
$baseline$;

comment on table public.nexora_historical_origin_6a is
 'Procedencia histórica declarada por el propietario; no acredita presencia física actual.';
comment on column public.nexora_initial_inventory_approvals.approved_by is
 'Nulo únicamente en migración documental owner_legacy_origin_6a, porque NO se simuló una firma del Administrador.';
comment on column public.nexora_initial_unit_sites.verification_method is
 'imei_scan: cotejo físico; admin_declaration_6a: certificación firmada; owner_legacy_origin_6a: procedencia documental sin conteo.';
commit;