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

-- Defensa adicional: nadie puede reescribir o borrar incidentes ya observados,
-- ni siquiera a través de un proceso administrativo con permisos de tabla.
-- Un usuario con privilegios para modificar triggers requeriría una migración
-- correctiva explícita; las operaciones diarias NUNCA alteran el historial.
create function nexora_internal.reject_missing_audit_mutation()
returns trigger
language plpgsql security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'Auditoría inmutable: no se permite editar, borrar ni vaciar observaciones No llegó.';
end;
$$;
revoke all on function nexora_internal.reject_missing_audit_mutation()
  from public,anon,authenticated;

create trigger nexora_transfer_missing_no_rewrite
  before update or delete on public.nexora_transfer_missing_observations
  for each row execute function nexora_internal.reject_missing_audit_mutation();

create trigger nexora_transfer_missing_no_truncate
  before truncate on public.nexora_transfer_missing_observations
  for each statement execute function nexora_internal.reject_missing_audit_mutation();

comment on function nexora_internal.reject_missing_audit_mutation() is
  'Bloquea cambios, borrado y TRUNCATE de incidentes auditados. Cualquier corrección futura requiere migración explícita y revisión.';

-- Lectura de manifiestos y evidencias del Bodeguero únicamente en sus sedes
-- activas. Encargado/Vendedor conservan la política worker por local activo.
create policy nexora_transfers_bodeguero_site_read
  on public.nexora_transfers for select to authenticated
  using (
    (select public.bodega_is_staff()) and exists (
      select 1 from public.nexora_staff_sites assigned
      join public.nexora_sites site on site.id=assigned.site_id
      where assigned.user_id=(select auth.uid()) and assigned.is_active
        and site.is_active
        and assigned.site_id in (origin_site_id,destination_site_id)
    )
  );

create policy nexora_transfer_lines_bodeguero_site_read
  on public.nexora_transfer_lines for select to authenticated
  using (
    (select public.bodega_is_staff()) and exists (
      select 1 from public.nexora_transfers transfer
      where transfer.id=nexora_transfer_lines.transfer_id
    )
  );

create policy nexora_transfer_returns_bodeguero_site_read
  on public.nexora_transfer_return_documents for select to authenticated
  using (
    (select public.bodega_is_staff()) and exists (
      select 1 from public.nexora_transfers transfer
      where transfer.id=nexora_transfer_return_documents.transfer_id
    )
  );

create policy nexora_transfer_events_bodeguero_site_read
  on public.nexora_transfer_events for select to authenticated
  using (
    (select public.bodega_is_staff()) and exists (
      select 1 from public.nexora_transfers transfer
      where transfer.id=nexora_transfer_events.transfer_id
    )
  );

-- Las incidencias siguen siendo inmutables. Visibles para quien participa
-- en origen o destino, sin exponer manifiestos de otras sedes.
create policy nexora_transfer_missing_participant_read
  on public.nexora_transfer_missing_observations for select to authenticated
  using (
    ((select public.bodega_is_staff()) or
      nexora_internal.worker_session() is not null)
    and exists (
      select 1 from public.nexora_transfers transfer
      where transfer.id=nexora_transfer_missing_observations.transfer_id
    )
  );

-- Booleano mínimo; NO revela la cantidad/costo de IMEI ni el acta Admin.
create function public.nexora_transfer_ready()
returns boolean language sql stable security definer
set search_path = pg_catalog
as $ready$
  select auth.uid() is not null
    and (public.bodega_is_staff() or
      nexora_internal.worker_session() is not null)
    and exists (select 1 from public.nexora_initial_inventory_approvals);
$ready$;
revoke all on function public.nexora_transfer_ready()
  from public,anon,authenticated;
grant execute on function public.nexora_transfer_ready() to authenticated;
comment on function public.nexora_transfer_ready() is
  'Estado booleano de habilitación para traslados de cuatro roles sin revelar actas ni inventario. No autoriza un movimiento sin validaciones de sede, ruta, IMEI y custodia.';
