-- Phase M1 Audit: measure text footprint (metadata only).
-- PURPOSE: Produce a repeatable migration_audit record with counts and byte estimates.
-- SAFETY: No SELECT of user text. Only count(*), sum(octet_length(...)), min/max(timestamps).
-- HOW TO RUN:
--   1) Apply this file (creates function run_phase_m1_audit). Then call SELECT run_phase_m1_audit();
--   2) Or run the per-table blocks manually and aggregate results.
-- If a table does not exist in an environment, that table is skipped and omitted from the result.

-- ---------------------------------------------------------------------------
-- RPC: returns { tables: { <table_name>: { row_count, rows_with_text, estimated_bytes, min_created_at, max_created_at } }, totals: { total_rows, total_rows_with_text, total_estimated_bytes } }
-- ---------------------------------------------------------------------------

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
  r record;
  tbl jsonb;
  row_count bigint;
  rows_with_text bigint;
  estimated_bytes bigint;
  min_ts timestamptz;
  max_ts timestamptz;
BEGIN
  -- journal_entries: title, content
  BEGIN
    SELECT
      count(*)::bigint,
      count(*) FILTER (WHERE (title IS NOT NULL AND length(title) > 0) OR (content IS NOT NULL AND length(content) > 0))::bigint,
      coalesce(sum(octet_length(coalesce(title, '')) + octet_length(coalesce(content, ''))), 0)::bigint,
      min(created_at),
      max(created_at)
    INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts
    FROM public.journal_entries;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('journal_entries', tbl);
    total_rows := total_rows + row_count;
    total_rows_with_text := total_rows_with_text + rows_with_text;
    total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- conversation_messages: content
  BEGIN
    SELECT
      count(*)::bigint,
      count(*) FILTER (WHERE content IS NOT NULL AND length(content) > 0)::bigint,
      coalesce(sum(octet_length(content)), 0)::bigint,
      min(created_at),
      max(created_at)
    INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts
    FROM public.conversation_messages;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('conversation_messages', tbl);
    total_rows := total_rows + row_count;
    total_rows_with_text := total_rows_with_text + rows_with_text;
    total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- check_ins: note
  BEGIN
    SELECT
      count(*)::bigint,
      count(*) FILTER (WHERE note IS NOT NULL AND length(note) > 0)::bigint,
      coalesce(sum(octet_length(coalesce(note, ''))), 0)::bigint,
      min(created_at),
      max(created_at)
    INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts
    FROM public.check_ins;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('check_ins', tbl);
    total_rows := total_rows + row_count;
    total_rows_with_text := total_rows_with_text + rows_with_text;
    total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- memory_chunks: content
  BEGIN
    SELECT
      count(*)::bigint,
      count(*) FILTER (WHERE content IS NOT NULL AND length(content) > 0)::bigint,
      coalesce(sum(octet_length(content)), 0)::bigint,
      min(created_at),
      max(created_at)
    INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts
    FROM public.memory_chunks;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('memory_chunks', tbl);
    total_rows := total_rows + row_count;
    total_rows_with_text := total_rows_with_text + rows_with_text;
    total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- user_reports: summary, notes
  BEGIN
    SELECT
      count(*)::bigint,
      count(*) FILTER (WHERE (summary IS NOT NULL AND length(summary) > 0) OR (notes IS NOT NULL AND length(notes) > 0))::bigint,
      coalesce(sum(octet_length(coalesce(summary, '')) + octet_length(coalesce(notes, ''))), 0)::bigint,
      min(created_at),
      max(created_at)
    INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts
    FROM public.user_reports;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('user_reports', tbl);
    total_rows := total_rows + row_count;
    total_rows_with_text := total_rows_with_text + rows_with_text;
    total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- user_nudges: message
  BEGIN
    SELECT
      count(*)::bigint,
      count(*) FILTER (WHERE message IS NOT NULL AND length(message) > 0)::bigint,
      coalesce(sum(octet_length(message)), 0)::bigint,
      min(created_at),
      max(created_at)
    INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts
    FROM public.user_nudges;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('user_nudges', tbl);
    total_rows := total_rows + row_count;
    total_rows_with_text := total_rows_with_text + rows_with_text;
    total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  result_totals := jsonb_build_object(
    'total_rows', total_rows,
    'total_rows_with_text', total_rows_with_text,
    'total_estimated_bytes', total_estimated_bytes
  );

  RETURN jsonb_build_object('tables', result_tables, 'totals', result_totals);
END;
$$;

COMMENT ON FUNCTION public.run_phase_m1_audit() IS 'Phase M1: returns aggregate counts and byte estimates only. No user text.';
