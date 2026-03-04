CREATE OR REPLACE FUNCTION public.run_phase_m1_audit()
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
  total_estimated_bytes bigint := 0;
  tbl jsonb;
  row_count bigint;
  rows_with_text bigint;
  estimated_bytes bigint;
  min_ts timestamptz;
  max_ts timestamptz;
BEGIN
  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE (title IS NOT NULL AND length(title) > 0) OR (content IS NOT NULL AND length(content) > 0))::bigint, coalesce(sum(octet_length(coalesce(title, '')) + octet_length(coalesce(content, ''))), 0)::bigint, min(created_at), max(created_at)
    INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts FROM public.journal_entries;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('journal_entries', tbl);
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text; total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE content IS NOT NULL AND length(content) > 0)::bigint, coalesce(sum(octet_length(content)), 0)::bigint, min(created_at), max(created_at)
    INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts FROM public.conversation_messages;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('conversation_messages', tbl);
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text; total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE note IS NOT NULL AND length(note) > 0)::bigint, coalesce(sum(octet_length(coalesce(note, ''))), 0)::bigint, min(created_at), max(created_at)
    INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts FROM public.check_ins;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('check_ins', tbl);
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text; total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE content IS NOT NULL AND length(content) > 0)::bigint, coalesce(sum(octet_length(content)), 0)::bigint, min(created_at), max(created_at)
    INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts FROM public.memory_chunks;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('memory_chunks', tbl);
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text; total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE (summary IS NOT NULL AND length(summary) > 0) OR (notes IS NOT NULL AND length(notes) > 0))::bigint, coalesce(sum(octet_length(coalesce(summary, '')) + octet_length(coalesce(notes, ''))), 0)::bigint, min(created_at), max(created_at)
    INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts FROM public.user_reports;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('user_reports', tbl);
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text; total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE message IS NOT NULL AND length(message) > 0)::bigint, coalesce(sum(octet_length(message)), 0)::bigint, min(created_at), max(created_at)
    INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts FROM public.user_nudges;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('user_nudges', tbl);
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text; total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  result_totals := jsonb_build_object('total_rows', total_rows, 'total_rows_with_text', total_rows_with_text, 'total_estimated_bytes', total_estimated_bytes);
  RETURN jsonb_build_object('tables', result_tables, 'totals', result_totals);
END;
$$;
