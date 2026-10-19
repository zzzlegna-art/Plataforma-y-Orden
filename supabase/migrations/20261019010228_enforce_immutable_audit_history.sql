-- Defense in depth for audit and warranty history.
-- Apply only after testing on a staging database; never run directly on production.
begin;

-- Audit entries must be attributed to the authenticated staff member.
drop policy if exists nexora_audit_logs_insert on public.nexora_audit_logs;
create policy nexora_audit_logs_insert on public.nexora_audit_logs
  for insert to authenticated
  with check (public.nexora_is_staff() and user_id = (select auth.uid()));

-- The client must not choose the displayed audit identity.
-- JWT email comes from the signed-in user's verified token, not request payload.
create or replace function public.nexora_audit_bind_identity()
returns trigger language plpgsql set search_path = 'public' as '
begin
  new.user_id := auth.uid();
  new.user_email := auth.jwt() ->> ''email'';
  return new;
end;
';
drop trigger if exists nexora_audit_bind_identity on public.nexora_audit_logs;
create trigger nexora_audit_bind_identity
  before insert on public.nexora_audit_logs
  for each row execute function public.nexora_audit_bind_identity();

-- Revoke mutation rights explicitly: RLS alone is not a substitute for grants.
revoke update, delete on public.nexora_audit_logs from authenticated;
revoke update, delete on public.nexora_movements from authenticated;

-- Warranty events are historical evidence: allow staff to append and read,
-- but never edit or delete existing events via the client API.
drop policy if exists nexora_warranty_events_all on public.nexora_warranty_events;
drop policy if exists nexora_warranty_events_read on public.nexora_warranty_events;
drop policy if exists nexora_warranty_events_insert on public.nexora_warranty_events;
create policy nexora_warranty_events_read on public.nexora_warranty_events
  for select to authenticated using (public.nexora_is_staff());
create policy nexora_warranty_events_insert on public.nexora_warranty_events
  for insert to authenticated
  with check (public.nexora_is_staff() and created_by = (select auth.uid()));
revoke update, delete on public.nexora_warranty_events from authenticated;

-- Prevent cascading warranty deletions from erasing historical events.
-- This intentionally rejects deletion of warranties with recorded events.
create or replace function public.nexora_prevent_warranty_event_delete()
returns trigger language plpgsql set search_path = 'public' as '
begin
  raise exception ''NEXORA_HISTORIAL_GARANTIA_INMUTABLE'';
end;
';
drop trigger if exists nexora_warranty_events_no_delete on public.nexora_warranty_events;
create trigger nexora_warranty_events_no_delete
  before delete on public.nexora_warranty_events
  for each row execute function public.nexora_prevent_warranty_event_delete();

commit;
