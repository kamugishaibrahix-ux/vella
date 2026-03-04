DO $$
BEGIN
  EXECUTE 'COMMENT ON FUNCTION public.run_phase_m4_audit_user(uuid) IS ''Phase M4: Per-user aggregate counts. No text. Use after purge to verify.''';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.run_phase_m4_audit_user(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.run_phase_m4_audit_user(uuid) TO service_role';
END $$;
