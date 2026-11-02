-- NEXORA Multisede 2.0 · Etapa de documento y trazabilidad de traslados
-- DEPENDENCIA: 20261101040000_nexora_multisite_catalog.sql
-- SOLO STAGING. No desplegar en producción ni habilitar escritura hasta terminar
-- los RPC atómicos de despacho, recepción y devolución con verificación física.
--
-- Este catálogo es intencionalmente de SOLO LECTURA para usuarios autenticados.
-- No se conceden INSERT/UPDATE/DELETE directos: una UI no debe poder marcar
-- "recibido" un equipo sin cambiar el stock y registrar el evento en 1 transacción.

create table public.nexora_transfers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  origin_site_id uuid not null references public.nexora_sites(id) on delete restrict,
  destination_site_id uuid not null references public.nexora_sites(id) on delete restrict,
  kind text not null default 'envio' check (kind in ('envio','retorno_faltantes')),
  status text not null default 'borrador' check (
    status in ('borrador','en_transito','pendiente_recepcion','recibido','recepcion_parcial','incidencia','cancelado')
  ),
  original_transfer_id uuid references public.nexora_transfers(id) on delete restrict,
  notes text,
  created_by uuid not null references public.bodega_profiles(id) on delete restrict,
  dispatched_by uuid references public.bodega_profiles(id) on delete restrict,
  received_by uuid references public.bodega_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  received_at timestamptz,
  constraint nexora_transfer_distinct_sites check (origin_site_id <> destination_site_id),
  constraint nexora_transfer_kind_origin check (
    (kind = 'envio' and original_transfer_id is null)
    or (kind = 'retorno_faltantes' and original_transfer_id is not null)
  ),
  constraint nexora_transfer_code_format check (char_length(btrim(code)) between 4 and 40),
  constraint nexora_transfer_times check (
    (dispatched_at is null or dispatched_at >= created_at)
    and (received_at is null or (dispatched_at is not null and received_at >= dispatched_at))
  )
);

create index nexora_transfers_origin_idx on public.nexora_transfers(origin_site_id,created_at desc);
create index nexora_transfers_destination_idx on public.nexora_transfers(destination_site_id,status,created_at desc);
create index nexora_transfers_original_idx on public.nexora_transfers(original_transfer_id);

create table public.nexora_transfer_units (
  transfer_id uuid not null references public.nexora_transfers(id) on delete restrict,
  unit_id uuid not null references public.bodega_units(id) on delete restrict,
  receipt_status text not null default 'pendiente' check (
    receipt_status in ('pendiente','recibido','no_llego')
  ),
  receipt_observation text,
  marked_by uuid references public.bodega_profiles(id) on delete restrict,
  marked_at timestamptz,
  -- Al despachar se abre un único tránsito por unidad.
  -- En la recepción parcial, cerrar el tránsito original antes de abrir
  -- el retorno pendiente en la MISMA transacción atómica del futuro RPC.
  is_open boolean not null default true,
  primary key (transfer_id,unit_id),
  constraint nexora_transfer_unit_missing_observation check (
    receipt_status <> 'no_llego'
    or (receipt_observation is not null and char_length(btrim(receipt_observation)) > 0)
  ),
  constraint nexora_transfer_unit_marking check (
    (receipt_status = 'pendiente' and marked_at is null and marked_by is null)
    or (receipt_status <> 'pendiente' and marked_at is not null and marked_by is not null)
  )
);

-- No puede haber una misma unidad simultáneamente en dos traslados abiertos.
create unique index nexora_transfer_single_open_unit_idx
  on public.nexora_transfer_units (unit_id) where is_open;
create index nexora_transfer_units_transfer_idx
  on public.nexora_transfer_units (transfer_id,receipt_status);

create table public.nexora_transfer_events (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.nexora_transfers(id) on delete restrict,
  event_type text not null check (
    event_type in ('creado','modificado','despachado','recepcion_confirmada','faltante_reportado',
      'devolucion_generada','retorno_verificado','incidencia','cancelado')
  ),
  unit_id uuid references public.bodega_units(id) on delete restrict,
  details jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.bodega_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint nexora_transfer_event_details_object check (jsonb_typeof(details) = 'object')
);
create index nexora_transfer_events_timeline_idx
  on public.nexora_transfer_events (transfer_id,created_at,id);

-- Bitácora de solo anexar: ni siquiera una futura función operacional
-- debe poder actualizar o borrar entradas de auditoría.
create function public.nexora_transfer_events_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Los eventos históricos de traslado son inmutables.';
end; $$;

create trigger nexora_transfer_events_block_changes
  before update or delete on public.nexora_transfer_events
  for each row execute function public.nexora_transfer_events_immutable();

-- Aun antes de crear operaciones de escritura, proteger la lectura:
-- Administrador activo ve todo; personal activo solo sus sedes asignadas.
-- La selección se apoya en membresías filtradas por RLS de la primera migración.
create function public.nexora_can_read_site(p_site_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select public.bodega_is_admin()) or (
    (select public.bodega_is_staff()) and
    exists (
      select 1 from public.nexora_site_memberships m
      where m.site_id = p_site_id
        and m.user_id = (select auth.uid())
        and m.is_active
    )
  )
$$;

revoke all on function public.nexora_can_read_site(uuid) from public;
grant execute on function public.nexora_can_read_site(uuid) to authenticated;

alter table public.nexora_transfers enable row level security;
alter table public.nexora_transfer_units enable row level security;
alter table public.nexora_transfer_events enable row level security;

revoke all on public.nexora_transfers from anon,authenticated;
revoke all on public.nexora_transfer_units from anon,authenticated;
revoke all on public.nexora_transfer_events from anon,authenticated;

grant select on public.nexora_transfers to authenticated;
grant select on public.nexora_transfer_units to authenticated;
grant select on public.nexora_transfer_events to authenticated;

create policy nexora_transfers_read on public.nexora_transfers
  for select to authenticated
  using (
    (select public.nexora_can_read_site(origin_site_id))
    or (select public.nexora_can_read_site(destination_site_id))
  );

create policy nexora_transfer_units_read on public.nexora_transfer_units
  for select to authenticated
  using (
    exists (
      select 1 from public.nexora_transfers t
      where t.id = transfer_id
    )
  );

create policy nexora_transfer_events_read on public.nexora_transfer_events
  for select to authenticated
  using (
    exists (
      select 1 from public.nexora_transfers t
      where t.id = transfer_id
    )
  );

comment on table public.nexora_transfers is
  'Documento de traslado. Solo lectura hasta desplegar RPC atómicos y roles por sede.';
comment on table public.nexora_transfer_units is
  'IMEI individuales del traslado. Falta el RPC que confirma unidades y crea retorno pendiente.';
comment on table public.nexora_transfer_events is
  'Línea de tiempo inmutable de cada traslado con actor y evento.';
