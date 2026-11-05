-- Corrige el FK legacy: Nexora autentica mediante bodega_profiles, no public.users (vacía).
BEGIN;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.bodega_profiles(id) ON DELETE CASCADE;
COMMIT;
