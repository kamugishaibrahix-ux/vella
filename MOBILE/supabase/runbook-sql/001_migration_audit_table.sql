-- Migration Audit Ledger (Phase M1+)
-- Metadata-only. Stores audit run results: counts and byte estimates. No user text.
-- Run once per environment, or use the equivalent migration in ../migrations/.

BEGIN;

CREATE TABLE IF NOT EXISTS public.migration_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  environment text NOT NULL DEFAULT 'unknown',
  auditor text NOT NULL DEFAULT 'system',
  tables jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_migration_audit_created_at
  ON public.migration_audit (created_at DESC);

COMMENT ON TABLE public.migration_audit IS 'Phase M1+: audit ledger. Counts and byte estimates only; no user text.';

ALTER TABLE public.migration_audit ENABLE ROW LEVEL SECURITY;

-- No policies: only service_role (bypasses RLS) can insert/select. Anon and authenticated get no access.

COMMIT;
