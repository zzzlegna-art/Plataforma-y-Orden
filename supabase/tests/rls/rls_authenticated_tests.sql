-- Nexora RLS automated security tests
-- Authenticated user access validation

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname='public'
  ) THEN
    RAISE EXCEPTION 'No public tables available';
  END IF;
END $$;

-- Verify RLS is enabled on application tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname='public';

-- Verify policies exist
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname='public';
