-- Phase M4: Per-user audit (aggregates only) to verify rows_with_text after purge.
-- Returns row_count and rows_with_text per table for p_user_id. No user text selected.

CREATE OR REPLACE FUNCTION public.run_phase_m4_audit_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_tables jsonb := '{}'::jsonb;
  result_totals jsonb;
  total_rows bigint := 0;
  total_rows_with_text bigint := 0;
  row_count bigint;
  rows_with_text bigint;
BEGIN
  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE (title IS NOT NULL AND length(title) > 0) OR (content IS NOT NULL AND length(content) > 0))::bigint
    INTO row_count, rows_with_text FROM public.journal_entries WHERE user_id = p_user_id;
    result_tables := result_tables || jsonb_build_object('journal_entries', jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text));
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE content IS NOT NULL AND length(content) > 0)::bigint
    INTO row_count, rows_with_text FROM public.conversation_messages WHERE user_id = p_user_id;
    result_tables := result_tables || jsonb_build_object('conversation_messages', jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text));
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE note IS NOT NULL AND length(note) > 0)::bigint
    INTO row_count, rows_with_text FROM public.check_ins WHERE user_id = p_user_id;
    result_tables := result_tables || jsonb_build_object('check_ins', jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text));
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE content IS NOT NULL AND length(content) > 0)::bigint
    INTO row_count, rows_with_text FROM public.memory_chunks WHERE user_id = p_user_id;
    result_tables := result_tables || jsonb_build_object('memory_chunks', jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text));
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE (summary IS NOT NULL AND length(summary) > 0) OR (notes IS NOT NULL AND length(notes) > 0))::bigint
    INTO row_count, rows_with_text FROM public.user_reports WHERE user_id = p_user_id;
    result_tables := result_tables || jsonb_build_object('user_reports', jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text));
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE message IS NOT NULL AND length(message) > 0)::bigint
    INTO row_count, rows_with_text FROM public.user_nudges WHERE user_id = p_user_id;
    result_tables := result_tables || jsonb_build_object('user_nudges', jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text));
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  result_totals := jsonb_build_object('total_rows', total_rows, 'total_rows_with_text', total_rows_with_text);
  RETURN jsonb_build_object('user_id', p_user_id, 'tables', result_tables, 'totals', result_totals);
END;
$$;

COMMENT ON FUNCTION public.run_phase_m4_audit_user(uuid) IS 'Phase M4: Per-user aggregate counts (row_count, rows_with_text). No text. Use after purge to verify.';

REVOKE EXECUTE ON FUNCTION public.run_phase_m4_audit_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_phase_m4_audit_user(uuid) TO service_role;
