-- El centro de notificaciones estaba dedicado exclusivamente a traslados.
-- La tabla estaba vacía y ya no tenía un proceso activo que generara avisos.
-- Se conserva una barrera para impedir borrar datos si reaparecen antes de migrar.

do $$
begin
  if exists (select 1 from public.notifications limit 1) then
    raise exception 'La tabla notifications contiene datos; no se elimina automáticamente.';
  end if;
end
$$;

drop table if exists public.notifications;
