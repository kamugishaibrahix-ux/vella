-- Phase M4 Purge: Null out legacy server-side text for a user AFTER migration is COMPLETED.
-- PURPOSE: Safe, gated, auditable purge. No user text is ever SELECTed, logged, or returned.
-- PRECONDITION: migration_state.status = 'COMPLETED' for p_user_id.
-- HOW TO RUN: Apply this file, then SELECT run_phase_m4_purge('<user_id>'::uuid);
-- ROLLBACK: Purgation is irreversible. Take a DB snapshot before running.

-- ERRCODE P0002: application-checkable "migration not completed".

CREATE OR REPLACE FUNCTION public.run_phase_m4_purge(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m_status public.migration_status;
  result_tables jsonb := '{}'::jsonb;
  result_totals jsonb;
  total_updated bigint := 0;
  updated_rows int;
BEGIN
  -- Gate: only purge when migration is COMPLETED
  SELECT status INTO m_status
  FROM public.migration_state
  WHERE user_id = p_user_id;

  IF NOT FOUND OR m_status IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_NOT_COMPLETED' USING ERRCODE = 'P0002';
  END IF;

  IF m_status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'MIGRATION_NOT_COMPLETED' USING ERRCODE = 'P0002';
  END IF;

  -- journal_entries: SET content = NULL, title = NULL (no SELECT of text)
  BEGIN
    UPDATE public.journal_entries
    SET content = NULL, title = NULL
    WHERE user_id = p_user_id AND (content IS NOT NULL OR title IS NOT NULL);
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    result_tables := result_tables || jsonb_build_object('journal_entries', jsonb_build_object('updated_rows', updated_rows));
    total_updated := total_updated + updated_rows;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- conversation_messages: SET content = NULL
  BEGIN
    UPDATE public.conversation_messages
    SET content = NULL
    WHERE user_id = p_user_id AND content IS NOT NULL;
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    result_tables := result_tables || jsonb_build_object('conversation_messages', jsonb_build_object('updated_rows', updated_rows));
    total_updated := total_updated + updated_rows;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- check_ins: SET note = NULL
  BEGIN
    UPDATE public.check_ins
    SET note = NULL
    WHERE user_id = p_user_id AND note IS NOT NULL;
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    result_tables := result_tables || jsonb_build_object('check_ins', jsonb_build_object('updated_rows', updated_rows));
    total_updated := total_updated + updated_rows;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- memory_chunks: SET content = NULL
  BEGIN
    UPDATE public.memory_chunks
    SET content = NULL
    WHERE user_id = p_user_id AND content IS NOT NULL;
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    result_tables := result_tables || jsonb_build_object('memory_chunks', jsonb_build_object('updated_rows', updated_rows));
    total_updated := total_updated + updated_rows;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- user_reports: SET summary = NULL, notes = NULL
  BEGIN
    UPDATE public.user_reports
    SET summary = NULL, notes = NULL
    WHERE user_id = p_user_id AND (summary IS NOT NULL OR notes IS NOT NULL);
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    result_tables := result_tables || jsonb_build_object('user_reports', jsonb_build_object('updated_rows', updated_rows));
    total_updated := total_updated + updated_rows;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- user_nudges: SET message = NULL (if table exists)
  BEGIN
    UPDATE public.user_nudges
    SET message = NULL
    WHERE user_id = p_user_id AND message IS NOT NULL;
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    result_tables := result_tables || jsonb_build_object('user_nudges', jsonb_build_object('updated_rows', updated_rows));
    total_updated := total_updated + updated_rows;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  result_totals := jsonb_build_object('total_updated_rows', total_updated);
  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'status', 'PURGED',
    'tables', result_tables,
    'totals', result_totals
  );
END;
$$;

COMMENT ON FUNCTION public.run_phase_m4_purge(uuid) IS 'Phase M4: Purge legacy text for one user. Gated by migration_state.status = COMPLETED. No text selected or returned.';

-- Privilege hardening: service_role only
REVOKE EXECUTE ON FUNCTION public.run_phase_m4_purge(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_phase_m4_purge(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_phase_m4_purge(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.run_phase_m4_purge(uuid) TO service_role;
