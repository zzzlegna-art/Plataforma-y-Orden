-- Nexora · inspección sin modificar datos para ejecutar después de migrar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname='public'
      AND tablename='notifications' AND rowsecurity
  ) THEN RAISE EXCEPTION 'notifications debe tener RLS'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='notifications' AND policyname='notifications_select_own'
  ) THEN RAISE EXCEPTION 'Falta SELECT por usuario'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='notifications' AND policyname='notifications_update_read_own'
  ) THEN RAISE EXCEPTION 'Falta UPDATE de lectura por usuario'; END IF;
  IF NOT has_table_privilege('authenticated','public.notifications','SELECT')
  THEN RAISE EXCEPTION 'El usuario autenticado no puede consultar avisos'; END IF;
  IF NOT has_column_privilege('authenticated','public.notifications','read','UPDATE')
  THEN RAISE EXCEPTION 'El usuario no puede marcar los avisos'; END IF;
  IF has_column_privilege('authenticated','public.notifications','title','UPDATE')
     OR has_table_privilege('authenticated','public.notifications','INSERT')
     OR has_table_privilege('authenticated','public.notifications','DELETE')
  THEN RAISE EXCEPTION 'Un usuario podría falsificar o alterar notificaciones'; END IF;
  IF has_table_privilege('anon','public.notifications','SELECT')
  THEN RAISE EXCEPTION 'Un usuario no autenticado podría leer avisos'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='nexora_transfer_event_notify'
      AND tgrelid='public.nexora_transfer_events'::regclass AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'Falta automatización de traslados'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
      AND schemaname='public' AND tablename='notifications'
  ) THEN RAISE EXCEPTION 'Falta realtime para notifications'; END IF;
END;
$$;
