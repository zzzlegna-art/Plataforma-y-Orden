-- Nexora RLS Security Matrix
-- Validates the security model from three angles:
-- 1. Authenticated access
-- 2. Role permissions
-- 3. Tenant/data isolation

-- Authentication context validation
DO $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE NOTICE 'Test requires authenticated context';
  END IF;
END $$;

-- RLS enabled tables audit
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Policy inventory
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Role model audit
SELECT
  rolname
FROM pg_roles
WHERE rolname IN ('authenticated','anon','service_role');

-- Isolation test template
-- Execute in CI with two authenticated users:
-- User A must only read/write allowed rows.
-- User B must never access User A private rows.
