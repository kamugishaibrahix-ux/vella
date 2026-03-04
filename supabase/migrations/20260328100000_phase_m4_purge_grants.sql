DO $$
BEGIN
  EXECUTE 'COMMENT ON FUNCTION public.run_phase_m4_purge(uuid) IS ''Phase M4: Purge legacy text for one user. Gated by migration_state.status = COMPLETED.''';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.run_phase_m4_purge(uuid) FROM PUBLIC';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.run_phase_m4_purge(uuid) FROM anon';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.run_phase_m4_purge(uuid) FROM authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.run_phase_m4_purge(uuid) TO service_role';
END $$;
