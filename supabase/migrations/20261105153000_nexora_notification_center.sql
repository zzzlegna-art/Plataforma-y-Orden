-- Nexora · centro de notificaciones persistentes por usuario y sede.
-- La tabla "notifications" legacy estaba vacía y sin políticas RLS.
-- Se reutiliza sin borrar datos; los clientes solo pueden leer y actualizar "read".
BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.nexora_sites(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS transfer_id uuid REFERENCES public.nexora_transfers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_event_id bigint REFERENCES public.nexora_transfer_events(id) ON DELETE RESTRICT;

ALTER TABLE public.notifications
  ALTER COLUMN "read" SET DEFAULT false,
  ALTER COLUMN "read" SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT (now() AT TIME ZONE 'UTC'),
  ALTER COLUMN created_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_one_per_event_per_user
  ON public.notifications(user_id, source_event_id);
CREATE INDEX IF NOT EXISTS notifications_user_recent
  ON public.notifications(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON public.notifications(user_id, created_at DESC) WHERE "read"=false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
DROP POLICY IF EXISTS notifications_update_read_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
CREATE POLICY notifications_update_read_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Importante: no otorgar INSERT, DELETE ni UPDATE general.
-- La aplicación no puede crear avisos falsos ni editar destinatarios o contenido.
REVOKE ALL PRIVILEGES ON TABLE public.notifications FROM anon, authenticated;
GRANT SELECT ON TABLE public.notifications TO authenticated;
GRANT UPDATE ("read") ON TABLE public.notifications TO authenticated;

CREATE OR REPLACE FUNCTION nexora_internal.enqueue_transfer_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_transfer record;
  v_target_site uuid;
  v_title text;
  v_message text;
  v_kind text;
  v_units integer;
  v_missing integer;
BEGIN
  IF new.event_type NOT IN ('created','dispatched','received','cancelled','return_confirmed') THEN
    RETURN new;
  END IF;

  SELECT t.transfer_number, t.origin_site_id, t.destination_site_id,
         o.name AS origin_name, d.name AS destination_name
    INTO v_transfer
    FROM public.nexora_transfers AS t
    JOIN public.nexora_sites AS o ON o.id=t.origin_site_id
    JOIN public.nexora_sites AS d ON d.id=t.destination_site_id
   WHERE t.id=new.transfer_id;
  IF NOT FOUND THEN RETURN new; END IF;

  v_units := CASE
    WHEN (new.detail->>'units') ~ '^[0-9]+$' THEN (new.detail->>'units')::integer
    ELSE 0 END;
  v_missing := CASE
    WHEN (new.detail->>'missing') ~ '^[0-9]+$' THEN (new.detail->>'missing')::integer
    ELSE 0 END;

  IF new.event_type='created' THEN
    v_target_site := v_transfer.destination_site_id;
    v_kind := 'transfer_created';
    v_title := 'Nuevo traslado TR-'||lpad(v_transfer.transfer_number::text,6,'0');
    v_message := 'Se preparó un envío de '||v_units||' IMEI desde '||v_transfer.origin_name||
                 ' hacia '||v_transfer.destination_name||'. Aún está pendiente de despacho.';
  ELSIF new.event_type='dispatched' THEN
    v_target_site := v_transfer.destination_site_id;
    v_kind := 'transfer_dispatched';
    v_title := 'Traslado TR-'||lpad(v_transfer.transfer_number::text,6,'0')||' en camino';
    v_message := 'Se despacharon '||v_units||' IMEI desde '||v_transfer.origin_name||
                 ' hacia '||v_transfer.destination_name||'. Verifica los seriales al recibir.';
  ELSIF new.event_type='received' THEN
    v_target_site := v_transfer.origin_site_id;
    IF v_missing>0 THEN
      v_kind := 'transfer_missing';
      v_title := 'Faltantes en traslado TR-'||lpad(v_transfer.transfer_number::text,6,'0');
      v_message := v_transfer.destination_name||' reportó '||v_missing||
                   ' IMEI faltantes. Revisa el documento de retorno pendiente.';
    ELSE
      v_kind := 'transfer_received';
      v_title := 'Traslado TR-'||lpad(v_transfer.transfer_number::text,6,'0')||' recibido';
      v_message := v_transfer.destination_name||' confirmó la recepción de los IMEI enviados.';
    END IF;
  ELSIF new.event_type='cancelled' THEN
    v_target_site := v_transfer.destination_site_id;
    v_kind := 'transfer_cancelled';
    v_title := 'Traslado TR-'||lpad(v_transfer.transfer_number::text,6,'0')||' cancelado';
    v_message := 'Se canceló el traslado desde '||v_transfer.origin_name||
                 ' hacia '||v_transfer.destination_name||' antes del despacho.';
  ELSE
    v_target_site := v_transfer.origin_site_id;
    v_kind := 'transfer_returned';
    v_title := 'Retorno de traslado TR-'||lpad(v_transfer.transfer_number::text,6,'0');
    v_message := 'Se registró un retorno físico en '||v_transfer.origin_name||
                 '. Consulta los seriales y el estado del manifiesto.';
  END IF;

  -- Destinatarios: Administradores activos (visibilidad global) y personal
  -- activo asignado a la sede implicada, sin enviar a roles planificados deshabilitados.
  -- UNION deduplica al Admin que también está asignado a la sede.
  INSERT INTO public.notifications
    (user_id, title, message, type, "read", site_id, transfer_id, source_event_id, created_at)
  SELECT recipient.id, v_title, v_message, v_kind, false,
         v_target_site, new.transfer_id, new.id, new.created_at AT TIME ZONE 'UTC'
  FROM (
    SELECT p.id
      FROM public.bodega_profiles p
     WHERE p.is_active AND p.role='admin'
    UNION
    SELECT p.id
      FROM public.bodega_profiles p
      JOIN public.nexora_staff_sites ss ON ss.user_id=p.id AND ss.is_active
      JOIN public.nexora_sites site ON site.id=ss.site_id AND site.is_active
     WHERE p.is_active AND p.role='bodeguero'
       AND ss.site_id=v_target_site
       AND (
         NOT EXISTS (SELECT 1 FROM public.nexora_staff_role_plans rp WHERE rp.user_id=p.id)
         OR EXISTS (SELECT 1 FROM public.nexora_staff_role_plans rp
                     WHERE rp.user_id=p.id AND rp.operationally_enabled)
       )
  ) AS recipient
  ON CONFLICT (user_id, source_event_id) DO NOTHING;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION nexora_internal.enqueue_transfer_notification() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS nexora_transfer_event_notify ON public.nexora_transfer_events;
CREATE TRIGGER nexora_transfer_event_notify
  AFTER INSERT ON public.nexora_transfer_events
  FOR EACH ROW EXECUTE FUNCTION nexora_internal.enqueue_transfer_notification();

-- Entregas en vivo con RLS: un cliente solo recibe sus propios cambios.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END;
$$;

COMMIT;
