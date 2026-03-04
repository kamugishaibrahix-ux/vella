-- Phase M3.5: Migration tunnel – token columns and export audit (metadata only).
-- All operations consolidated into single DO block for CLI compatibility.
DO $$
BEGIN
  ALTER TABLE public.migration_state
    ADD COLUMN IF NOT EXISTS migration_token text,
    ADD COLUMN IF NOT EXISTS migration_token_expires_at timestamptz;

  EXECUTE 'COMMENT ON COLUMN public.migration_state.migration_token IS ''Short-lived token for export requests; validated with X-Migration-Token header.''';
  EXECUTE 'COMMENT ON COLUMN public.migration_state.migration_token_expires_at IS ''Token expiry (e.g. now() + 10 minutes).''';

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

  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_migration_export_audit_created_at ON public.migration_export_audit (created_at DESC)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_migration_export_audit_export_type ON public.migration_export_audit (export_type)';

  EXECUTE 'COMMENT ON TABLE public.migration_export_audit IS ''Phase M3.5: Audit of migration export requests. Metadata only; no user content.''';

  ALTER TABLE public.migration_export_audit ENABLE ROW LEVEL SECURITY;

  EXECUTE 'REVOKE ALL ON public.migration_export_audit FROM anon, authenticated';
  EXECUTE 'GRANT SELECT, INSERT ON public.migration_export_audit TO service_role';
END $$;
