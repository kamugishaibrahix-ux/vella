DO $$
BEGIN
  EXECUTE 'COMMENT ON FUNCTION public.run_phase_m1_audit() IS ''Phase M1: aggregate counts and byte estimates only. No user text.''';
END $$;
