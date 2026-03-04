-- RLS hardening: token_usage, token_topups, subscriptions, user_metadata
-- All operations consolidated into single DO block for CLI compatibility.
DO $$
BEGIN
  -- token_usage
  ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.token_usage FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS users_select_own_usage ON public.token_usage;
  CREATE POLICY users_select_own_usage ON public.token_usage FOR SELECT USING (auth.uid() = user_id);
  EXECUTE 'REVOKE ALL ON public.token_usage FROM anon';
  EXECUTE 'REVOKE ALL ON public.token_usage FROM authenticated';
  EXECUTE 'REVOKE ALL ON public.token_usage FROM service_role';
  EXECUTE 'GRANT SELECT ON public.token_usage TO authenticated';

  -- token_topups
  ALTER TABLE public.token_topups ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.token_topups FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS users_select_own_topups ON public.token_topups;
  CREATE POLICY users_select_own_topups ON public.token_topups FOR SELECT USING (auth.uid() = user_id);
  EXECUTE 'REVOKE ALL ON public.token_topups FROM anon';
  EXECUTE 'REVOKE ALL ON public.token_topups FROM authenticated';
  EXECUTE 'REVOKE ALL ON public.token_topups FROM service_role';
  EXECUTE 'GRANT SELECT ON public.token_topups TO authenticated';

  -- subscriptions
  ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS users_select_own_subscriptions ON public.subscriptions;
  DROP POLICY IF EXISTS users_insert_own_subscriptions ON public.subscriptions;
  DROP POLICY IF EXISTS users_update_own_subscriptions ON public.subscriptions;
  DROP POLICY IF EXISTS users_delete_own_subscriptions ON public.subscriptions;
  CREATE POLICY users_select_own_subscriptions ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
  EXECUTE 'REVOKE ALL ON public.subscriptions FROM anon';
  EXECUTE 'REVOKE ALL ON public.subscriptions FROM authenticated';
  EXECUTE 'GRANT SELECT ON public.subscriptions TO authenticated';

  -- user_metadata
  ALTER TABLE public.user_metadata ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_metadata FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS user_metadata_read_own ON public.user_metadata;
  DROP POLICY IF EXISTS user_metadata_write ON public.user_metadata;
  CREATE POLICY user_metadata_read_own ON public.user_metadata FOR SELECT USING (auth.uid() = user_id);
  EXECUTE 'REVOKE ALL ON public.user_metadata FROM anon';
  EXECUTE 'REVOKE ALL ON public.user_metadata FROM authenticated';
  EXECUTE 'GRANT SELECT ON public.user_metadata TO authenticated';
END $$;
