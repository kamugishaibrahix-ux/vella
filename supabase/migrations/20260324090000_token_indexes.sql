-- Composite indexes for billing-window queries
DO $$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_token_usage_user_created ON public.token_usage(user_id, created_at)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_token_topups_user_created ON public.token_topups(user_id, created_at)';
END $$;
