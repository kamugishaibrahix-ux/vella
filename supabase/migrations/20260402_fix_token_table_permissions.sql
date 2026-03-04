-- FIX: Restore service_role access to token_usage and token_topups
-- ROOT CAUSE: migrations 20260325_0003 and 20260331 revoked ALL from service_role
-- and applied FORCE ROW LEVEL SECURITY, which blocks:
--   1. Direct SELECT via supabaseAdmin (used by balance.ts)
--   2. INSERT inside SECURITY DEFINER functions (FORCE RLS applies to table owner too)
--
-- This migration restores the minimum permissions needed:
--   - service_role: SELECT (for balance reads via supabaseAdmin)
--   - postgres role bypass policy (for SECURITY DEFINER function inserts)
--
-- Writes remain protected: only SECURITY DEFINER functions can INSERT.
-- anon and authenticated still have SELECT-only via RLS.

DO $$
BEGIN
  -- 1. Grant SELECT to service_role (needed by supabaseAdmin balance queries)
  EXECUTE 'GRANT SELECT ON public.token_usage TO service_role';
  EXECUTE 'GRANT SELECT ON public.token_topups TO service_role';

  -- 2. Add RLS bypass policies for the postgres role (table owner)
  --    This is needed because FORCE ROW LEVEL SECURITY blocks even the owner.
  --    The SECURITY DEFINER functions (atomic_token_deduct, atomic_token_refund)
  --    run as postgres and need to SELECT + INSERT on these tables.

  -- token_usage: allow postgres full access
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'token_usage' AND policyname = 'postgres_full_access') THEN
    CREATE POLICY postgres_full_access ON public.token_usage
      FOR ALL
      TO postgres
      USING (true)
      WITH CHECK (true);
  END IF;

  -- token_topups: allow postgres SELECT (no inserts needed from functions)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'token_topups' AND policyname = 'postgres_full_access') THEN
    CREATE POLICY postgres_full_access ON public.token_topups
      FOR ALL
      TO postgres
      USING (true)
      WITH CHECK (true);
  END IF;

  -- 3. Add service_role RLS bypass policies for SELECT
  --    FORCE ROW LEVEL SECURITY means service_role also needs an RLS policy to read
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'token_usage' AND policyname = 'service_role_select') THEN
    CREATE POLICY service_role_select ON public.token_usage
      FOR SELECT
      TO service_role
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'token_topups' AND policyname = 'service_role_select') THEN
    CREATE POLICY service_role_select ON public.token_topups
      FOR SELECT
      TO service_role
      USING (true);
  END IF;
END $$;
