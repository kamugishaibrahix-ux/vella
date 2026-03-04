-- Admin control plane: per-user flags (suspended). Metadata only, no free text.

CREATE TABLE IF NOT EXISTS public.admin_user_flags (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  suspended boolean NOT NULL DEFAULT false,
  suspended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_user_flags_suspended ON public.admin_user_flags (suspended) WHERE suspended = true;

COMMENT ON TABLE public.admin_user_flags IS 'Admin-only: suspend flag per user. No content.';

ALTER TABLE public.admin_user_flags ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write; no policies for anon/authenticated (deny by default)
REVOKE ALL ON public.admin_user_flags FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.admin_user_flags TO service_role;
