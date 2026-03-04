-- ==========================================================================
-- B4 FIX: Enable RLS on user_reports and promo_codes
-- ==========================================================================
-- user_reports: Admin moderation reports. Contains summary/notes written
--   by admins. Service-role only — no user access (users should not see
--   internal moderation reports about them).
-- promo_codes: Admin discount codes. Service-role only.
--
-- Schema (from 20251221120000_admin_c_mod_tools.sql):
--   user_reports (id, user_id FK, reported_by, type, severity, status,
--     summary text NOT NULL, notes text NULL, assignee, created_at, updated_at)
--   promo_codes (id, code UNIQUE, discount_percent, applies_to_plan,
--     is_active, usage_limit, times_used, expires_at, created_at)
-- ==========================================================================

-- -----------------------------------------------------------------------
-- 1) user_reports — admin/service-role only
-- -----------------------------------------------------------------------
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

-- Deny all access to anon and authenticated roles (service_role bypasses RLS)
REVOKE ALL ON public.user_reports FROM anon;
REVOKE ALL ON public.user_reports FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_reports TO service_role;

-- Explicit deny-all policy (redundant with REVOKE but defense-in-depth)
DROP POLICY IF EXISTS "user_reports_deny_all" ON public.user_reports;
CREATE POLICY "user_reports_deny_all" ON public.user_reports
  FOR ALL USING (false);

-- Bound admin-written text columns
ALTER TABLE public.user_reports
  DROP CONSTRAINT IF EXISTS user_reports_summary_max_length;
ALTER TABLE public.user_reports
  ADD CONSTRAINT user_reports_summary_max_length
  CHECK (length(summary) <= 500);

ALTER TABLE public.user_reports
  DROP CONSTRAINT IF EXISTS user_reports_notes_max_length;
ALTER TABLE public.user_reports
  ADD CONSTRAINT user_reports_notes_max_length
  CHECK (notes IS NULL OR length(notes) <= 2000);

-- Bound type and severity columns
ALTER TABLE public.user_reports
  DROP CONSTRAINT IF EXISTS user_reports_type_max_length;
ALTER TABLE public.user_reports
  ADD CONSTRAINT user_reports_type_max_length
  CHECK (length(type) <= 100);

ALTER TABLE public.user_reports
  DROP CONSTRAINT IF EXISTS user_reports_severity_max_length;
ALTER TABLE public.user_reports
  ADD CONSTRAINT user_reports_severity_max_length
  CHECK (length(severity) <= 50);

COMMENT ON TABLE public.user_reports IS 'Admin moderation reports. Service-role only. summary/notes are admin-written (bounded), not user content. RLS enforced.';
COMMENT ON COLUMN public.user_reports.summary IS 'Admin-written summary, max 500 chars. NOT user-generated content.';
COMMENT ON COLUMN public.user_reports.notes IS 'Admin-written notes, max 2000 chars. NOT user-generated content.';

-- -----------------------------------------------------------------------
-- 2) promo_codes — admin/service-role only
-- -----------------------------------------------------------------------
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.promo_codes FROM anon;
REVOKE ALL ON public.promo_codes FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.promo_codes TO service_role;

DROP POLICY IF EXISTS "promo_codes_deny_all" ON public.promo_codes;
CREATE POLICY "promo_codes_deny_all" ON public.promo_codes
  FOR ALL USING (false);

-- Bound code and plan columns
ALTER TABLE public.promo_codes
  DROP CONSTRAINT IF EXISTS promo_codes_code_max_length;
ALTER TABLE public.promo_codes
  ADD CONSTRAINT promo_codes_code_max_length
  CHECK (length(code) <= 64);

ALTER TABLE public.promo_codes
  DROP CONSTRAINT IF EXISTS promo_codes_plan_max_length;
ALTER TABLE public.promo_codes
  ADD CONSTRAINT promo_codes_plan_max_length
  CHECK (length(applies_to_plan) <= 32);

COMMENT ON TABLE public.promo_codes IS 'Admin-managed promo/discount codes. Service-role only. No user access. RLS enforced.';
