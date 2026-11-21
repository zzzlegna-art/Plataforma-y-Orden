-- El perfil Vendedor ya no existe en la operación de NEXORA.
-- La tabla no contiene eventos históricos con ese rol; se restringe el esquema
-- para que solo registre activaciones/desactivaciones de Encargado.

do $$
begin
  if exists (
    select 1
    from public.nexora_worker_activation_events
    where role is distinct from 'encargado'
  ) then
    raise exception 'Hay eventos de activación con un rol distinto de Encargado; se requiere revisión antes de restringir el historial.';
  end if;
end
$$;

alter table public.nexora_worker_activation_events
  drop constraint if exists nexora_worker_activation_events_role_check;

alter table public.nexora_worker_activation_events
  add constraint nexora_worker_activation_events_role_check
  check (role = 'encargado');
