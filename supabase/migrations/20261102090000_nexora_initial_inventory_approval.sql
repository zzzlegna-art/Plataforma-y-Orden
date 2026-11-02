-- Nexora Multisede 2.0: cierre atómico y auditado del inventario físico inicial.
-- No modifica bodega_units, ventas, pedidos, recepciones ni disponibilidad legacy.
-- El mapa aprobado es un snapshot físico, NO el inventario comercial del POS.
create table public.nexora_initial_inventory_approvals (
  id uuid primary key default gen_random_uuid(),
  only_one boolean not null default true check (only_one),
  approved_by uuid not null references public.bodega_profiles(id) on delete restrict,
  approved_at timestamptz not null default now(),
  unit_count integer not null check (unit_count > 0),
  constraint nexora_initial_inventory_singleton unique (only_one)
);

create table public.nexora_initial_unit_sites (
  unit_id uuid primary key references public.bodega_units(id) on delete restrict,
  site_id uuid not null references public.nexora_sites(id) on delete restrict,
  observation_id uuid not null unique references public.nexora_imei_reconciliation(id) on delete restrict,
  approval_id uuid not null references public.nexora_initial_inventory_approvals(id) on delete restrict,
  serial_snapshot text not null,
  status_snapshot text not null,
  cost_snapshot numeric,
  approved_at timestamptz not null default now()
);
create index nexora_initial_unit_sites_site_idx
  on public.nexora_initial_unit_sites(site_id);

alter table public.nexora_initial_inventory_approvals enable row level security;
alter table public.nexora_initial_unit_sites enable row level security;
create policy nexora_initial_approval_admin_read on public.nexora_initial_inventory_approvals
  for select to authenticated using ((select public.bodega_is_admin()));
create policy nexora_initial_sites_admin_read on public.nexora_initial_unit_sites
  for select to authenticated using ((select public.bodega_is_admin()));
revoke all on public.nexora_initial_inventory_approvals, public.nexora_initial_unit_sites
  from public, anon, authenticated;
grant select on public.nexora_initial_inventory_approvals to authenticated;
grant select on public.nexora_initial_unit_sites to authenticated;

-- Diagnóstico invoker: muestra bloqueos antes de habilitar la firma definitiva.
create function public.nexora_initial_inventory_progress()
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public
as $$
declare
  v_total bigint;
  v_valid bigint;
  v_stale bigint;
  v_approved bigint;
  v_approved_at timestamptz;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede consultar la aprobación inicial.';
  end if;
  select count(*) into v_total from public.bodega_units u
   where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');
  select count(*) into v_valid
    from public.nexora_imei_reconciliation r
    join public.bodega_units u on u.id = r.unit_id
    join public.nexora_sites s on s.id = r.site_id
   where r.voided_at is null and s.is_active
     and u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
     and u.status = r.status_snapshot and u.serial = r.serial_snapshot;
  select count(*) into v_stale
    from public.nexora_imei_reconciliation r
    join public.bodega_units u on u.id = r.unit_id
    join public.nexora_sites s on s.id = r.site_id
   where r.voided_at is null and
     (not s.is_active or u.status is distinct from r.status_snapshot
      or u.serial is distinct from r.serial_snapshot
      or u.status not in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso'));
  select a.unit_count, a.approved_at into v_approved, v_approved_at
    from public.nexora_initial_inventory_approvals a limit 1;
  return jsonb_build_object(
    'total', v_total, 'verified', v_valid,
    'pending', greatest(0, v_total - v_valid),
    'stale', v_stale,
    'approved', coalesce(v_approved, 0),
    'approvedAt', v_approved_at,
    'isApproved', v_approved_at is not null,
    'ready', (v_approved_at is null and v_total > 0
      and v_total = v_valid and v_stale = 0)
  );
end;
$$;
revoke all on function public.nexora_initial_inventory_progress()
  from public, anon, authenticated;
grant execute on function public.nexora_initial_inventory_progress() to authenticated;

-- Única vía de escritura: función privilegiada EN ESQUEMA INTERNO, con
-- comprobación explícita de identidad y rol. No confía en el navegador.
create function nexora_internal.finish_initial_inventory()
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare
  v_total bigint;
  v_verified bigint;
  v_stale bigint;
  v_written bigint;
  v_approval uuid;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede aprobar el inventario inicial.';
  end if;

  -- Serializa aprobaciones y bloquea altas/bajas/ventas/cotejos mientras
  -- comprueba el conjunto completo. Todo ocurre en UNA transacción RPC.
  lock table public.nexora_initial_inventory_approvals in exclusive mode;
  if exists (select 1 from public.nexora_initial_inventory_approvals) then
    raise exception 'El inventario inicial ya fue aprobado; no se puede duplicar.';
  end if;
  lock table public.bodega_units in share mode;
  lock table public.nexora_imei_reconciliation in share mode;
  lock table public.nexora_sites in share mode;

  select count(*) into v_total from public.bodega_units u
   where u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso');
  select count(*) into v_verified
    from public.nexora_imei_reconciliation r
    join public.bodega_units u on u.id = r.unit_id
    join public.nexora_sites s on s.id = r.site_id
   where r.voided_at is null and s.is_active
     and u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
     and u.status = r.status_snapshot and u.serial = r.serial_snapshot;
  select count(*) into v_stale
    from public.nexora_imei_reconciliation r
    join public.bodega_units u on u.id = r.unit_id
    join public.nexora_sites s on s.id = r.site_id
   where r.voided_at is null and
     (not s.is_active or u.status is distinct from r.status_snapshot
      or u.serial is distinct from r.serial_snapshot
      or u.status not in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso'));

  if v_total = 0 or v_verified <> v_total or v_stale <> 0 then
    raise exception 'Aprobación bloqueada: % unidades físicas; % verificadas; % cotejos desactualizados.',
      v_total, v_verified, v_stale;
  end if;

  insert into public.nexora_initial_inventory_approvals(approved_by, unit_count)
  values(auth.uid(), v_total)
  returning id into v_approval;

  insert into public.nexora_initial_unit_sites
    (unit_id, site_id, observation_id, approval_id,
     serial_snapshot, status_snapshot, cost_snapshot)
  select u.id, r.site_id, r.id, v_approval, u.serial, u.status, u.cost
    from public.nexora_imei_reconciliation r
    join public.bodega_units u on u.id = r.unit_id
    join public.nexora_sites s on s.id = r.site_id
   where r.voided_at is null and s.is_active
     and u.status in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso')
     and u.status = r.status_snapshot and u.serial = r.serial_snapshot;
  get diagnostics v_written = row_count;
  if v_written <> v_total then
    raise exception 'Conteo de aprobación inconsistente; transacción revertida.';
  end if;
  return jsonb_build_object(
    'approvalId', v_approval, 'approvedCount', v_written, 'approvedAt', now()
  );
end;
$$;
revoke all on function nexora_internal.finish_initial_inventory()
  from public, anon, authenticated;
grant usage on schema nexora_internal to authenticated;
grant execute on function nexora_internal.finish_initial_inventory() to authenticated;

-- RPC expuesta sin privilegios elevados. Delegación restringida al
-- procedimiento interno que vuelve a comprobar permisos en la base.
create function public.nexora_approve_initial_inventory()
returns jsonb language sql volatile security invoker
set search_path = pg_catalog, public
as $$
  select nexora_internal.finish_initial_inventory();
$$;
revoke all on function public.nexora_approve_initial_inventory()
  from public, anon, authenticated;
grant execute on function public.nexora_approve_initial_inventory() to authenticated;

-- Una vez firmado el inventario inicial, no puede alterarse ni borrarse
-- su prueba física. La entrada de compras posteriores será otra fase.
create function public.nexora_lock_approved_initial_scan()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$
begin
  if exists (select 1 from public.nexora_initial_inventory_approvals) then
    raise exception 'Inventario inicial aprobado: cotejos cerrados.';
  end if;
  return new;
end;
$$;
revoke all on function public.nexora_lock_approved_initial_scan()
  from public, anon, authenticated;
create trigger nexora_00_lock_after_initial_approval
  before insert or update on public.nexora_imei_reconciliation
  for each row execute function public.nexora_lock_approved_initial_scan();

-- No se puede desactivar una sede con unidades confirmadas en la foto inicial.
create function public.nexora_guard_initial_site()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$
begin
  if old.is_active and not new.is_active and
    exists (select 1 from public.nexora_initial_unit_sites where site_id = old.id) then
    raise exception 'No puedes desactivar una sede con IMEI aprobados.';
  end if;
  return new;
end;
$$;
revoke all on function public.nexora_guard_initial_site()
  from public, anon, authenticated;
create trigger nexora_00_guard_site_approved
  before update on public.nexora_sites
  for each row execute function public.nexora_guard_initial_site();

comment on table public.nexora_initial_unit_sites is
  'Foto IMMUTABLE de la ubicación física inicial aprobada por IMEI. No equivale a disponibilidad comercial; requiere integración de flujos de venta/traslado.';
comment on table public.nexora_initial_inventory_approvals is
  'Acta única de aprobación atómica del inventario inicial, con autor y conteo.';


-- Resumen de la foto inicial por sede; no duplica disponibilidad del POS.
create function public.nexora_initial_inventory_site_summary()
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede consultar inventario por sede.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'siteId', x.site_id, 'siteName', x.site_name,
    'approved', x.approved, 'stillPhysical', x.still_physical
  ) order by x.site_name), '[]'::jsonb)
    into result
    from (
      select s.id as site_id, s.name as site_name,
        count(m.unit_id)::integer as approved,
        count(m.unit_id) filter (where u.status in
         ('en_bodega','en_local','en_transito','en_reparacion','defectuoso'))::integer as still_physical
      from public.nexora_sites s
      join public.nexora_initial_unit_sites m on m.site_id = s.id
      join public.bodega_units u on u.id = m.unit_id
      group by s.id, s.name
    ) x;
  return result;
end;
$$;
revoke all on function public.nexora_initial_inventory_site_summary()
  from public, anon, authenticated;
grant execute on function public.nexora_initial_inventory_site_summary() to authenticated;
