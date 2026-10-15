-- Bodega6A RLS Role and Isolation Tests
-- Executed inside CI against a test database.

BEGIN;

-- Verify RLS is enabled on protected tables
DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = false;

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Security failure: public tables without RLS detected';
  END IF;
END $$;

-- Verify policies exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies) THEN
    RAISE EXCEPTION 'Security failure: no RLS policies found';
  END IF;
END $$;

ROLLBACK;
