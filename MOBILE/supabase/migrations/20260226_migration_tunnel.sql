-- Phase M3.5: Migration tunnel – token columns and export audit (metadata only).

-- Add short-lived migration token to migration_state (10 min expiry).
ALTER TABLE public.migration_state
  ADD COLUMN IF NOT EXISTS migration_token text,
  ADD COLUMN IF NOT EXISTS migration_token_expires_at timestamptz;

COMMENT ON COLUMN public.migration_state.migration_token IS 'Short-lived token for export requests; validated with X-Migration-Token header.';
COMMENT ON COLUMN public.migration_state.migration_token_expires_at IS 'Token expiry (e.g. now() + 10 minutes).';

-- Audit log for export requests (metadata only; no content).
CREATE TABLE IF NOT EXISTS public.migration_export_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  export_type text NOT NULL,
  user_id_hash text NOT NULL,
  "offset" int NOT NULL DEFAULT 0,
  "limit" int NOT NULL DEFAULT 50,
  request_id text,
  success boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_migration_export_audit_created_at ON public.migration_export_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_migration_export_audit_export_type ON public.migration_export_audit (export_type);

COMMENT ON TABLE public.migration_export_audit IS 'Phase M3.5: Audit of migration export requests. Metadata only; no user content.';

ALTER TABLE public.migration_export_audit ENABLE ROW LEVEL SECURITY;

-- Only service_role can insert/select (no user access).
REVOKE ALL ON public.migration_export_audit FROM anon, authenticated;
GRANT SELECT, INSERT ON public.migration_export_audit TO service_role;
