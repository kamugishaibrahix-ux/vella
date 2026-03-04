-- TOKEN LEDGER WRITE FIREWALL: DB-level non-negativity enforcement
-- All operations consolidated into single DO block for CLI compatibility
DO $$
BEGIN
  -- Enable RLS
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'token_usage' AND NOT c.relrowsecurity) THEN
    ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'token_topups' AND NOT c.relrowsecurity) THEN
    ALTER TABLE public.token_topups ENABLE ROW LEVEL SECURITY;
  END IF;

  ALTER TABLE public.token_usage FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.token_topups FORCE ROW LEVEL SECURITY;

  -- Revoke DML from all public-facing roles
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.token_usage FROM anon';
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.token_topups FROM anon';
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.token_usage FROM authenticated';
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.token_topups FROM authenticated';
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.token_usage FROM service_role';
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.token_topups FROM service_role';
  EXECUTE 'GRANT SELECT ON public.token_usage TO authenticated';
  EXECUTE 'GRANT SELECT ON public.token_topups TO authenticated';

  -- Drop write policies if they exist
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='token_usage' AND policyname='users_insert_own_usage') THEN
    DROP POLICY "users_insert_own_usage" ON public.token_usage;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='token_usage' AND policyname='users_update_own_usage') THEN
    DROP POLICY "users_update_own_usage" ON public.token_usage;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='token_usage' AND policyname='users_delete_own_usage') THEN
    DROP POLICY "users_delete_own_usage" ON public.token_usage;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='token_topups' AND policyname='users_insert_own_topups') THEN
    DROP POLICY "users_insert_own_topups" ON public.token_topups;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='token_topups' AND policyname='users_update_own_topups') THEN
    DROP POLICY "users_update_own_topups" ON public.token_topups;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='token_topups' AND policyname='users_delete_own_topups') THEN
    DROP POLICY "users_delete_own_topups" ON public.token_topups;
  END IF;

  -- Ensure SELECT policies exist
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='token_usage' AND policyname='users_select_own_usage') THEN
    CREATE POLICY "users_select_own_usage" ON public.token_usage FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='token_topups' AND policyname='users_select_own_topups') THEN
    CREATE POLICY "users_select_own_topups" ON public.token_topups FOR SELECT USING (auth.uid() = user_id);
  END IF;

  -- Comments
  EXECUTE 'COMMENT ON TABLE public.token_usage IS ''Token usage ledger. WRITE-PROTECTED: All inserts via SECURITY DEFINER functions only.''';
  EXECUTE 'COMMENT ON TABLE public.token_topups IS ''Token topup ledger. WRITE-PROTECTED: All inserts via SECURITY DEFINER functions only.''';
END $$;
