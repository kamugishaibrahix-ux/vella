-- =============================================================================
-- DESTRUCTIVE — RUN ONLY AFTER purge audit confirms rows_with_text = 0
-- =============================================================================
-- RUNBOOK SQL — Manual execution only. Do not place in migrations/.
-- WHY:     Drops legacy text columns (journal_entries, conversation_messages,
--          check_ins, memory_chunks, user_reports, user_nudges). Irreversible.
-- WHEN:    Run only after run_phase_m4_purge has been executed for ALL users
--          and run_phase_m4_audit_user confirms totals.rows_with_text = 0 for
--          every user.
-- PRECONDITIONS:
--   - Backup verified (Supabase Dashboard → Backups / PITR available).
--   - For each user: SELECT run_phase_m4_audit_user(user_id) -> totals.total_rows_with_text = 0
--   - Staging rehearsal completed successfully.
-- ROLLBACK: Restore from Supabase backup/PITR to point before execution.
-- =============================================================================

-- Phase M4.5: Drop legacy server-side text columns. No user free text can be stored after this.
-- Uses IF EXISTS so staging/prod differences don't brick deploys.

ALTER TABLE public.journal_entries DROP COLUMN IF EXISTS title;
ALTER TABLE public.journal_entries DROP COLUMN IF EXISTS content;

ALTER TABLE public.conversation_messages DROP COLUMN IF EXISTS content;

ALTER TABLE public.check_ins DROP COLUMN IF EXISTS note;

ALTER TABLE public.memory_chunks DROP COLUMN IF EXISTS content;

ALTER TABLE public.user_reports DROP COLUMN IF EXISTS summary;
ALTER TABLE public.user_reports DROP COLUMN IF EXISTS notes;

DO $$
BEGIN
  ALTER TABLE public.user_nudges DROP COLUMN IF EXISTS message;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

-- Purge RPC: no-op when columns already dropped (undefined_column)
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
  SELECT status INTO m_status FROM public.migration_state WHERE user_id = p_user_id;
  IF NOT FOUND OR m_status IS NULL OR m_status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'MIGRATION_NOT_COMPLETED' USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    UPDATE public.journal_entries SET content = NULL, title = NULL WHERE user_id = p_user_id AND (content IS NOT NULL OR title IS NOT NULL);
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    result_tables := result_tables || jsonb_build_object('journal_entries', jsonb_build_object('updated_rows', updated_rows));
    total_updated := total_updated + updated_rows;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  BEGIN
    UPDATE public.conversation_messages SET content = NULL WHERE user_id = p_user_id AND content IS NOT NULL;
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    result_tables := result_tables || jsonb_build_object('conversation_messages', jsonb_build_object('updated_rows', updated_rows));
    total_updated := total_updated + updated_rows;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  BEGIN
    UPDATE public.check_ins SET note = NULL WHERE user_id = p_user_id AND note IS NOT NULL;
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    result_tables := result_tables || jsonb_build_object('check_ins', jsonb_build_object('updated_rows', updated_rows));
    total_updated := total_updated + updated_rows;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  BEGIN
    UPDATE public.memory_chunks SET content = NULL WHERE user_id = p_user_id AND content IS NOT NULL;
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    result_tables := result_tables || jsonb_build_object('memory_chunks', jsonb_build_object('updated_rows', updated_rows));
    total_updated := total_updated + updated_rows;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  BEGIN
    UPDATE public.user_reports SET summary = NULL, notes = NULL WHERE user_id = p_user_id AND (summary IS NOT NULL OR notes IS NOT NULL);
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    result_tables := result_tables || jsonb_build_object('user_reports', jsonb_build_object('updated_rows', updated_rows));
    total_updated := total_updated + updated_rows;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  BEGIN
    UPDATE public.user_nudges SET message = NULL WHERE user_id = p_user_id AND message IS NOT NULL;
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    result_tables := result_tables || jsonb_build_object('user_nudges', jsonb_build_object('updated_rows', updated_rows));
    total_updated := total_updated + updated_rows;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  result_totals := jsonb_build_object('total_updated_rows', total_updated);
  RETURN jsonb_build_object('user_id', p_user_id, 'status', 'PURGED', 'tables', result_tables, 'totals', result_totals);
END;
$$;

-- M4 audit user: when columns dropped, report 0 rows_with_text
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
    SELECT count(*)::bigint, count(*) FILTER (WHERE (title IS NOT NULL AND length(title) > 0) OR (content IS NOT NULL AND length(content) > 0))::bigint INTO row_count, rows_with_text FROM public.journal_entries WHERE user_id = p_user_id;
    result_tables := result_tables || jsonb_build_object('journal_entries', jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text));
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    result_tables := result_tables || jsonb_build_object('journal_entries', jsonb_build_object('row_count', 0, 'rows_with_text', 0));
  END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE content IS NOT NULL AND length(content) > 0)::bigint INTO row_count, rows_with_text FROM public.conversation_messages WHERE user_id = p_user_id;
    result_tables := result_tables || jsonb_build_object('conversation_messages', jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text));
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    result_tables := result_tables || jsonb_build_object('conversation_messages', jsonb_build_object('row_count', 0, 'rows_with_text', 0));
  END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE note IS NOT NULL AND length(note) > 0)::bigint INTO row_count, rows_with_text FROM public.check_ins WHERE user_id = p_user_id;
    result_tables := result_tables || jsonb_build_object('check_ins', jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text));
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    result_tables := result_tables || jsonb_build_object('check_ins', jsonb_build_object('row_count', 0, 'rows_with_text', 0));
  END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE content IS NOT NULL AND length(content) > 0)::bigint INTO row_count, rows_with_text FROM public.memory_chunks WHERE user_id = p_user_id;
    result_tables := result_tables || jsonb_build_object('memory_chunks', jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text));
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    result_tables := result_tables || jsonb_build_object('memory_chunks', jsonb_build_object('row_count', 0, 'rows_with_text', 0));
  END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE (summary IS NOT NULL AND length(summary) > 0) OR (notes IS NOT NULL AND length(notes) > 0))::bigint INTO row_count, rows_with_text FROM public.user_reports WHERE user_id = p_user_id;
    result_tables := result_tables || jsonb_build_object('user_reports', jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text));
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    result_tables := result_tables || jsonb_build_object('user_reports', jsonb_build_object('row_count', 0, 'rows_with_text', 0));
  END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE message IS NOT NULL AND length(message) > 0)::bigint INTO row_count, rows_with_text FROM public.user_nudges WHERE user_id = p_user_id;
    result_tables := result_tables || jsonb_build_object('user_nudges', jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text));
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    result_tables := result_tables || jsonb_build_object('user_nudges', jsonb_build_object('row_count', 0, 'rows_with_text', 0));
  END;

  result_totals := jsonb_build_object('total_rows', total_rows, 'total_rows_with_text', total_rows_with_text);
  RETURN jsonb_build_object('user_id', p_user_id, 'tables', result_tables, 'totals', result_totals);
END;
$$;

-- M1 audit: skip legacy tables when columns dropped
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
    SELECT count(*)::bigint, count(*) FILTER (WHERE (title IS NOT NULL AND length(title) > 0) OR (content IS NOT NULL AND length(content) > 0))::bigint, coalesce(sum(octet_length(coalesce(title, '')) + octet_length(coalesce(content, ''))), 0)::bigint, min(created_at), max(created_at) INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts FROM public.journal_entries;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('journal_entries', tbl);
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text; total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE content IS NOT NULL AND length(content) > 0)::bigint, coalesce(sum(octet_length(content)), 0)::bigint, min(created_at), max(created_at) INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts FROM public.conversation_messages;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('conversation_messages', tbl);
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text; total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE note IS NOT NULL AND length(note) > 0)::bigint, coalesce(sum(octet_length(coalesce(note, ''))), 0)::bigint, min(created_at), max(created_at) INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts FROM public.check_ins;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('check_ins', tbl);
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text; total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE content IS NOT NULL AND length(content) > 0)::bigint, coalesce(sum(octet_length(content)), 0)::bigint, min(created_at), max(created_at) INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts FROM public.memory_chunks;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('memory_chunks', tbl);
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text; total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE (summary IS NOT NULL AND length(summary) > 0) OR (notes IS NOT NULL AND length(notes) > 0))::bigint, coalesce(sum(octet_length(coalesce(summary, '')) + octet_length(coalesce(notes, ''))), 0)::bigint, min(created_at), max(created_at) INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts FROM public.user_reports;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('user_reports', tbl);
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text; total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  BEGIN
    SELECT count(*)::bigint, count(*) FILTER (WHERE message IS NOT NULL AND length(message) > 0)::bigint, coalesce(sum(octet_length(message)), 0)::bigint, min(created_at), max(created_at) INTO row_count, rows_with_text, estimated_bytes, min_ts, max_ts FROM public.user_nudges;
    tbl := jsonb_build_object('row_count', row_count, 'rows_with_text', rows_with_text, 'estimated_bytes', estimated_bytes, 'min_created_at', min_ts, 'max_created_at', max_ts);
    result_tables := result_tables || jsonb_build_object('user_nudges', tbl);
    total_rows := total_rows + row_count; total_rows_with_text := total_rows_with_text + rows_with_text; total_estimated_bytes := total_estimated_bytes + estimated_bytes;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  result_totals := jsonb_build_object('total_rows', total_rows, 'total_rows_with_text', total_rows_with_text, 'total_estimated_bytes', total_estimated_bytes);
  RETURN jsonb_build_object('tables', result_tables, 'totals', result_totals);
END;
$$;
