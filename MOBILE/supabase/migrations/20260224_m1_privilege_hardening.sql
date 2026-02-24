-- Phase M2: Harden M1 audit privileges. anon/authenticated must not run audit or read migration_audit.

-- 1) Function run_phase_m1_audit: executable only by service_role
REVOKE ALL ON FUNCTION public.run_phase_m1_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_phase_m1_audit() FROM anon;
REVOKE ALL ON FUNCTION public.run_phase_m1_audit() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.run_phase_m1_audit() TO service_role;

-- 2) migration_audit table: RLS already enabled; revoke from PUBLIC, grant only to service_role
REVOKE ALL ON TABLE public.migration_audit FROM PUBLIC;
REVOKE ALL ON TABLE public.migration_audit FROM anon;
REVOKE ALL ON TABLE public.migration_audit FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.migration_audit TO service_role;

-- No RLS policies: table has no policies so anon/authenticated get no rows (RLS denies all).
-- service_role bypasses RLS, so it can insert/select as used by the internal audit route.
