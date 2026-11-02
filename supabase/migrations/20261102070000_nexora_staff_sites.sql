-- Nexora Multisede 2.0: asignaciones de personal a puntos físicos.
-- NO cambia roles actuales, estados IMEI, ventas, pedidos ni recepciones.
-- Vinculaciones configurables: un empleado puede operar en más de un punto.
create table public.nexora_staff_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.bodega_profiles(id) on delete restrict,
  site_id uuid not null references public.nexora_sites(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  constraint nexora_staff_sites_unique unique (user_id, site_id)
);
create index nexora_staff_sites_site_active_idx
  on public.nexora_staff_sites (site_id, is_active);
create index nexora_staff_sites_user_active_idx
  on public.nexora_staff_sites (user_id, is_active);

create table public.nexora_staff_site_events (
  id bigint generated always as identity primary key,
  assignment_id uuid not null references public.nexora_staff_sites(id) on delete restrict,
  user_id uuid not null,
  site_id uuid not null,
  event_type text not null check (event_type in ('assigned', 'revoked', 'reactivated')),
  actor_id uuid not null,
  created_at timestamptz not null default now()
);
create index nexora_staff_site_events_assignment_idx
  on public.nexora_staff_site_events (assignment_id, created_at desc);

-- BEFORE trigger prevents rewriting the origin and actor, and refuses
-- assignments to inactive employees/sites even when the UI is bypassed.
create function public.nexora_validate_staff_site()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public.bodega_is_admin() then
    raise exception 'Solo Administrador puede gestionar el personal de las sedes.';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.site_id is distinct from old.site_id
      or new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by then
      raise exception 'Una asignacion no puede cambiar de persona ni de sede.';
    end if;
  else
    new.created_by := auth.uid();
  end if;
  if new.is_active and not exists (
    select 1 from public.bodega_profiles p
      where p.id = new.user_id and p.is_active
  ) then
    raise exception 'El usuario debe estar activo para ser asignado.';
  end if;
  if new.is_active and not exists (
    select 1 from public.nexora_sites s
      where s.id = new.site_id and s.is_active
  ) then
    raise exception 'La sede debe estar activa para ser asignada.';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.nexora_validate_staff_site() from public, anon, authenticated;
create trigger nexora_staff_sites_validate
  before insert or update on public.nexora_staff_sites
  for each row execute function public.nexora_validate_staff_site();

-- Historial inalterable: el personal no recibe INSERT/UPDATE/DELETE
-- en los eventos. El trigger auditado escribe por cuenta del servidor.
create schema if not exists nexora_internal;
revoke all on schema nexora_internal from public, anon, authenticated;
create function nexora_internal.audit_staff_site()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or not public.bodega_is_admin() then
    raise exception 'No autorizado para registrar asignaciones.';
  end if;
  if tg_op = 'INSERT' or new.is_active is distinct from old.is_active then
    insert into public.nexora_staff_site_events
      (assignment_id, user_id, site_id, event_type, actor_id)
    values (
      new.id, new.user_id, new.site_id,
      case when tg_op = 'INSERT' and new.is_active then 'assigned'
           when new.is_active then 'reactivated' else 'revoked' end,
      auth.uid()
    );
  end if;
  return new;
end;
$$;
revoke all on function nexora_internal.audit_staff_site() from public, anon, authenticated;
create trigger nexora_staff_sites_audit
  after insert or update on public.nexora_staff_sites
  for each row execute function nexora_internal.audit_staff_site();

alter table public.nexora_staff_sites enable row level security;
alter table public.nexora_staff_site_events enable row level security;

-- El Administrador ve todas las asignaciones, y cada empleado activo
-- solo las suyas que continúen activas (sin acceso a datos de otros).
create policy nexora_staff_sites_read on public.nexora_staff_sites
  for select to authenticated
  using ((select public.bodega_is_admin())
    or (is_active and user_id = (select auth.uid()) and (select public.bodega_is_staff())));
create policy nexora_staff_sites_insert on public.nexora_staff_sites
  for insert to authenticated with check ((select public.bodega_is_admin()));
create policy nexora_staff_sites_update on public.nexora_staff_sites
  for update to authenticated
  using ((select public.bodega_is_admin()))
  with check ((select public.bodega_is_admin()));

create policy nexora_staff_site_events_read on public.nexora_staff_site_events
  for select to authenticated using ((select public.bodega_is_admin()));

revoke all on public.nexora_staff_sites, public.nexora_staff_site_events from anon;
grant select, insert, update on public.nexora_staff_sites to authenticated;
revoke delete on public.nexora_staff_sites from authenticated;
grant select on public.nexora_staff_site_events to authenticated;
revoke insert, update, delete on public.nexora_staff_site_events from authenticated;

comment on table public.nexora_staff_sites is
  'Vinculos preparatorios de empleado a punto; no activan por si mismos autorizaciones operativas, caja ni traslados.';
comment on table public.nexora_staff_site_events is
  'Historico inmutable de altas, bajas y reactivaciones de asignaciones multisede.';
