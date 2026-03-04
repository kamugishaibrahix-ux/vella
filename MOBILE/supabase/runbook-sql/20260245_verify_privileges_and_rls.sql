--
-- RUNBOOK-SQL: 20260245_verify_privileges_and_rls.sql
-- LOCATION: supabase/runbook-sql/
-- PURPOSE: Print table privileges (anon/authenticated/service_role), RLS flags and policies
--          for subscriptions, user_metadata, webhook_events; verify token_usage/token_topups
--          have no write grants for service_role.
-- SAFETY: Read-only. SELECTs from information_schema, pg_class, pg_policies, pg_roles only.
--         No destructive statements.
--

-- =============================================================================
-- 1) Table privileges for anon, authenticated, service_role
--    Tables: subscriptions, user_metadata, webhook_events
-- =============================================================================

SELECT
  'TABLE PRIVILEGES' AS section,
  tp.table_schema,
  tp.table_name,
  tp.grantee,
  tp.privilege_type,
  tp.is_grantable
FROM information_schema.table_privileges tp
WHERE tp.table_schema = 'public'
  AND tp.table_name IN ('subscriptions', 'user_metadata', 'webhook_events')
  AND tp.grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY tp.table_name, tp.grantee, tp.privilege_type;

-- =============================================================================
-- 2) RLS enabled flags (from pg_class)
--    Tables: subscriptions, user_metadata, webhook_events
-- =============================================================================

SELECT
  'RLS ENABLED' AS section,
  n.nspname AS table_schema,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('subscriptions', 'user_metadata', 'webhook_events')
ORDER BY c.relname;

-- =============================================================================
-- 3) RLS policies (from pg_policies)
--    Tables: subscriptions, user_metadata, webhook_events
-- =============================================================================

SELECT
  'RLS POLICIES' AS section,
  p.schemaname,
  p.tablename,
  p.policyname,
  p.permissive,
  p.roles,
  p.cmd,
  p.qual IS NOT NULL AS has_using,
  p.with_check IS NOT NULL AS has_with_check
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.tablename IN ('subscriptions', 'user_metadata', 'webhook_events')
ORDER BY p.tablename, p.policyname;

-- =============================================================================
-- 4) Verify token_usage and token_topups: no write grants for service_role
--    Write = INSERT, UPDATE, DELETE, TRUNCATE
-- =============================================================================

SELECT
  'TOKEN_LEDGER WRITE PRIVILEGES (service_role)' AS section,
  tp.table_name,
  tp.grantee,
  tp.privilege_type
FROM information_schema.table_privileges tp
WHERE tp.table_schema = 'public'
  AND tp.table_name IN ('token_usage', 'token_topups')
  AND tp.grantee = 'service_role'
  AND tp.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
ORDER BY tp.table_name, tp.privilege_type;

-- Expected: 0 rows. If any row appears, service_role has a write grant (fail verification).

-- =============================================================================
-- 5) All privileges on token_usage and token_topups for service_role (for context)
-- =============================================================================

SELECT
  'TOKEN_LEDGER ALL PRIVILEGES (service_role)' AS section,
  tp.table_name,
  tp.grantee,
  tp.privilege_type,
  tp.is_grantable
FROM information_schema.table_privileges tp
WHERE tp.table_schema = 'public'
  AND tp.table_name IN ('token_usage', 'token_topups')
  AND tp.grantee = 'service_role'
ORDER BY tp.table_name, tp.privilege_type;

-- =============================================================================
-- 6) Role existence check (pg_roles)
-- =============================================================================

SELECT
  'ROLES' AS section,
  r.rolname AS role_name,
  r.rolcanlogin AS can_login
FROM pg_roles r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname;

-- =============================================================================
-- 7) SECURITY DEFINER OWNERS (pg_proc)
--    Functions: atomic_token_deduct, atomic_token_refund,
--               atomic_stripe_webhook_process, atomic_stripe_event_record
-- =============================================================================

SELECT
  'SECURITY DEFINER OWNERS' AS section,
  n.nspname AS schema_name,
  p.proname AS function_name,
  r.rolname AS owner,
  p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname IN (
    'atomic_token_deduct',
    'atomic_token_refund',
    'atomic_stripe_webhook_process',
    'atomic_stripe_event_record'
  )
ORDER BY p.proname;

-- =============================================================================
-- 8) CORE TABLE RLS STATE
--    token_usage, token_topups, subscriptions, user_metadata
-- =============================================================================

SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE nspname = 'public'
  AND relname IN (
    'token_usage',
    'token_topups',
    'subscriptions',
    'user_metadata'
  )
ORDER BY relname;

