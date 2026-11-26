-- ==============================================================================
-- BinRo Finance — Security & RLS Verification Queries
-- ==============================================================================
-- Run inside Supabase SQL Editor (after applying migrations 001..003) to verify
-- RLS enablement, storage bucket privacy, entitlement read-only locks, and
-- analytics isolation.
-- ==============================================================================

-- 1. Confirm RLS is enabled on every public table
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. Confirm every user-owned policy references auth.uid()
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

-- 3. Confirm storage bucket `binro-media` is private (`public = false`)
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'binro-media';

-- 4. Confirm `anon` and `authenticated` have ZERO read/write privileges on `internal_analytics`
SELECT
  nspname AS schema_name,
  has_schema_privilege('anon', nspname, 'USAGE') AS anon_usage,
  has_schema_privilege('authenticated', nspname, 'USAGE') AS auth_usage
FROM pg_namespace
WHERE nspname = 'internal_analytics';

-- 5. Confirm `authenticated` only has SELECT on `user_entitlements` (no INSERT/UPDATE/DELETE)
SELECT
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'user_entitlements'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- 6. Confirm `analytics_events` rejects private finance keys
-- Expected: fails check constraint `chk_analytics_no_private_finance_keys` if tested with {"amount": 500}.
SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.analytics_events'::regclass;
