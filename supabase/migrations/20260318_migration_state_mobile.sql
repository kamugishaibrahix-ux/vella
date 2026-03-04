-- Phase M2 Patch: per-user migration state (metadata only).
-- RLS: user can read own row; only service_role can insert/update (status updates server-authoritative).

-- Create type if it doesn't exist (may already exist from 20260325_migration_state.sql)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'migration_status') THEN
        CREATE TYPE public.migration_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.migration_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.migration_status NOT NULL DEFAULT 'NOT_STARTED',
  started_at timestamptz,
  completed_at timestamptz,
  checksum text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_migration_state_status ON public.migration_state (status);
CREATE INDEX IF NOT EXISTS idx_migration_state_updated_at ON public.migration_state (updated_at DESC);

COMMENT ON TABLE public.migration_state IS 'Phase M2 Patch: per-user migration state. Legacy export allowed only when status != COMPLETED.';

ALTER TABLE public.migration_state ENABLE ROW LEVEL SECURITY;

-- User can read own row only
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'migration_state' 
        AND policyname = 'migration_state_select_own'
    ) THEN
        CREATE POLICY migration_state_select_own ON public.migration_state
          FOR SELECT USING (auth.uid() = user_id);
    END IF;
END $$;

-- No INSERT/UPDATE for anon/authenticated; service_role bypasses RLS
-- So we do not create policies for INSERT/UPDATE (deny by default for anon/authenticated)
REVOKE INSERT, UPDATE, DELETE ON public.migration_state FROM anon, authenticated;
GRANT SELECT ON public.migration_state TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.migration_state TO service_role;
