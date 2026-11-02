-- Nexora Multisede 2.0 · cotejo físico de IMEI por ubicación.
-- Registro preparatorio y reversible. NO actualiza bodega_units ni su disponibilidad.
-- Solo un cotejo vigente por unidad, con historial de cotejos anulados.
create table public.nexora_imei_reconciliation (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.bodega_units(id) on delete restrict,
  site_id uuid not null references public.nexora_sites(id) on delete restrict,
  serial_snapshot text not null,
  status_snapshot text not null,
  checked_by uuid not null references public.bodega_profiles(id) on delete restrict,
  checked_at timestamptz not null default now(),
  notes text,
  voided_at timestamptz,
  voided_by uuid references public.bodega_profiles(id) on delete restrict,
  void_reason text,
  constraint nexora_imei_recon_void_consistent check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and length(btrim(void_reason)) >= 5)
  )
);
create unique index nexora_imei_recon_one_current
  on public.nexora_imei_reconciliation(unit_id)
  where voided_at is null;
create index nexora_imei_recon_site_recent
  on public.nexora_imei_reconciliation(site_id, checked_at desc)
  where voided_at is null;
create index nexora_imei_recon_history
  on public.nexora_imei_reconciliation(unit_id, checked_at desc);

-- Valida en el servidor la existencia FÍSICA y la sede; nunca acepta un serial
-- vendido, liberado, entregado ni inexistente, incluso si manipulan la UI.
-- El snapshot se toma de bodega_units y no de datos enviados por el navegador.
create function public.nexora_validate_imei_reconciliation()
returns trigger language plpgsql
set search_path = public
as $$
declare
  current_serial text;
  current_status text;
begin
  if not public.bodega_is_admin() or auth.uid() is null then
    raise exception 'Solo Administrador puede conciliar inventario físico.';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.nexora_sites where id = new.site_id and is_active) then
      raise exception 'Selecciona una sede activa.';
    end if;
    select serial, status
      into current_serial, current_status
      from public.bodega_units
     where id = new.unit_id
     for share;
    if not found then
      raise exception 'IMEI no existe en el inventario.';
    end if;
    if current_status not in ('en_bodega','en_local','en_transito','en_reparacion','defectuoso') then
      raise exception 'No se puede conciliar un IMEI vendido, entregado o liberado.';
    end if;
    new.serial_snapshot := current_serial;
    new.status_snapshot := current_status;
    new.checked_by := auth.uid();
    new.checked_at := now();
    new.notes := nullif(btrim(new.notes), '');
    new.voided_at := null;
    new.voided_by := null;
    new.void_reason := null;
    return new;
  end if;

  -- UPDATE se limita a anular una observación; el registro original permanece.
  if old.voided_at is not null
     or new.id is distinct from old.id
     or new.unit_id is distinct from old.unit_id
     or new.site_id is distinct from old.site_id
     or new.serial_snapshot is distinct from old.serial_snapshot
     or new.status_snapshot is distinct from old.status_snapshot
     or new.checked_by is distinct from old.checked_by
     or new.checked_at is distinct from old.checked_at
     or new.notes is distinct from old.notes
     or new.voided_by is distinct from old.voided_by
     or old.void_reason is not null
     or new.voided_at is null
     or char_length(btrim(coalesce(new.void_reason,''))) < 5 then
    raise exception 'Solo es posible anular una observacion vigente con motivo.';
  end if;
  new.voided_at := now();
  new.voided_by := auth.uid();
  new.void_reason := btrim(new.void_reason);
  return new;
end;
$$;
revoke all on function public.nexora_validate_imei_reconciliation()
  from public, anon, authenticated;
create trigger nexora_imei_reconciliation_guard
  before insert or update on public.nexora_imei_reconciliation
  for each row execute function public.nexora_validate_imei_reconciliation();

alter table public.nexora_imei_reconciliation enable row level security;
create policy nexora_imei_recon_read on public.nexora_imei_reconciliation
  for select to authenticated using ((select public.bodega_is_admin()));
create policy nexora_imei_recon_insert on public.nexora_imei_reconciliation
  for insert to authenticated with check ((select public.bodega_is_admin()));
create policy nexora_imei_recon_update on public.nexora_imei_reconciliation
  for update to authenticated
  using ((select public.bodega_is_admin()))
  with check ((select public.bodega_is_admin()));

revoke all on public.nexora_imei_reconciliation from anon;
grant select, insert, update on public.nexora_imei_reconciliation to authenticated;
revoke delete on public.nexora_imei_reconciliation from authenticated;

comment on table public.nexora_imei_reconciliation is
  'Cotejos físicos PREPARATORIOS de IMEI en sedes; no representan stock disponible ni cambian bodega_units. Deben aprobarse en posterior migración controlada.';
