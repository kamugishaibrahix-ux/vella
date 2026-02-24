-- Phase M1: migration_audit ledger table (metadata-only).
-- Same as runbook-sql/001_migration_audit_table.sql for apply order.

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
