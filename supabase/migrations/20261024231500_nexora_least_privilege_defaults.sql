-- Nexora final security audit: least-privilege grants and safe defaults.
-- RLS protects rows; it does not replace SQL privileges such as TRUNCATE or TRIGGER.
-- Preserve authenticated CRUD grants used by the app; remove unnecessary capabilities
-- and stop anonymous users reaching public-schema RPCs.
begin;

-- Anonymous users do not use the database API in this application.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

-- RLS does not constrain these table-level capabilities.
revoke truncate, references, trigger, maintain
  on all tables in schema public
  from anon, authenticated;

-- USAGE/SELECT remain available where needed for generated IDs; UPDATE is not.
revoke update on all sequences in schema public from authenticated;

-- Keep authenticated RPC behavior unchanged while removing inherited PUBLIC/anon
-- execution. The auth-user bootstrap is trigger-only and must not be callable by
-- authenticated clients directly.
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.bodega_handle_new_user() from authenticated;

-- All 18 application functions and all 51 public relations are owned by postgres
-- in the audited project. Harden defaults for this owner so future app objects
-- do not reintroduce anonymous access or unnecessary API privileges.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke update on sequences from authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;

-- The managed supabase_admin role is not a member of this migration session;
-- its default ACL cannot be changed by this connection. The live audit confirmed
-- application objects are owned by postgres. Provider-owned objects are outside
-- this app migration's ownership boundary.

commit;
