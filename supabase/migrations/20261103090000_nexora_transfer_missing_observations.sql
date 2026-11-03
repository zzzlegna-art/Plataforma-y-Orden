-- Nexora V4: observación inmutable por IMEI reportado como "No llegó".
-- NO inventa unidades ni mueve custodia. Solo escribe historial cuando la RPC
-- existente cambia una línea física de in_transit a return_pending.
-- Diseñado para aplicación controlada DESPUÉS de prueba PostgreSQL aislada.

create table public.nexora_transfer_missing_observations (
  id bigint generated always as identity primary key,
  transfer_line_id uuid not null unique
    references public.nexora_transfer_lines(id) on delete restrict,
  transfer_id uuid not null
    references public.nexora_transfers(id) on delete restrict,
  unit_id uuid not null
    references public.nexora_initial_unit_sites(unit_id) on delete restrict,
  serial_snapshot text not null,
  observation text not null default 'No llegó'
    check (observation = 'No llegó'),
  reported_by uuid not null
    references public.bodega_profiles(id) on delete restrict,
  reported_at timestamptz not null default now()
);
create index nexora_transfer_missing_by_transfer
  on public.nexora_transfer_missing_observations(transfer_id,reported_at);

alter table public.nexora_transfer_missing_observations
  enable row level security;
create policy nexora_transfer_missing_admin_read
  on public.nexora_transfer_missing_observations
  for select to authenticated
  using ((select public.bodega_is_admin()));
revoke all on public.nexora_transfer_missing_observations
  from public,anon,authenticated;
grant select on public.nexora_transfer_missing_observations to authenticated;
revoke all on sequence public.nexora_transfer_missing_observations_id_seq
  from public,anon,authenticated;

create function nexora_internal.log_missing_transfer_line()
returns trigger
language plpgsql security definer
set search_path = pg_catalog
as $$
begin
  if new.state = 'return_pending' and old.state = 'in_transit' then
    -- La RPC debe comprobar los permisos del receptor ANTES de actualizar la línea.
    -- La tabla de líneas no concede UPDATE directo a authenticated.
    if auth.uid() is null then
      raise exception 'No se puede registrar faltante sin usuario autenticado.';
    end if;
    insert into public.nexora_transfer_missing_observations
      (transfer_line_id,transfer_id,unit_id,serial_snapshot,observation,reported_by)
    values
      (new.id,new.transfer_id,new.unit_id,new.serial_snapshot,'No llegó',auth.uid())
    on conflict (transfer_line_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function nexora_internal.log_missing_transfer_line()
  from public,anon,authenticated;

create trigger nexora_transfer_log_missing_line
  after update of state on public.nexora_transfer_lines
  for each row
  when (old.state = 'in_transit' and new.state = 'return_pending')
  execute function nexora_internal.log_missing_transfer_line();

comment on table public.nexora_transfer_missing_observations is
  'Historial inmutable: cada IMEI no recibido genera una observación "No llegó" automáticamente al pasar a retorno pendiente. El retorno posterior no borra el incidente.';
comment on function nexora_internal.log_missing_transfer_line() is
  'Trigger privado; registra falta individual al recibir parcialmente. No confirma entrega física, no altera stock y no autoriza por sí mismo a operar traslados.';
