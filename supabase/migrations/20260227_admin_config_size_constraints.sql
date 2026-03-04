-- ==========================================================================
-- B5 FIX (DB layer): Size constraints on admin_ai_config.config
-- ==========================================================================
-- The alert-rules/save route writes unbounded JSONB to admin_ai_config.config.
-- This migration adds a hard size cap at the DB level as defense-in-depth.
-- The primary fix is in the Zod schema (see alert-rules/save/route.ts).
--
-- Also constrains admin_activity_log previous/next payloads.
-- ==========================================================================

-- -----------------------------------------------------------------------
-- 1) admin_ai_config.config — max 64KB
-- -----------------------------------------------------------------------
ALTER TABLE public.admin_ai_config
  DROP CONSTRAINT IF EXISTS admin_ai_config_config_max_size;
ALTER TABLE public.admin_ai_config
  ADD CONSTRAINT admin_ai_config_config_max_size
  CHECK (pg_column_size(config) <= 65536);

-- Bound the label column
ALTER TABLE public.admin_ai_config
  DROP CONSTRAINT IF EXISTS admin_ai_config_label_max_length;
ALTER TABLE public.admin_ai_config
  ADD CONSTRAINT admin_ai_config_label_max_length
  CHECK (label IS NULL OR length(label) <= 128);

COMMENT ON COLUMN public.admin_ai_config.config IS 'Admin config JSON. Max 64KB. Validated by Zod schema at API layer. No user content.';

-- -----------------------------------------------------------------------
-- 2) admin_activity_log — bound previous/next payloads
-- -----------------------------------------------------------------------
ALTER TABLE public.admin_activity_log
  DROP CONSTRAINT IF EXISTS admin_activity_log_previous_max_size;
ALTER TABLE public.admin_activity_log
  ADD CONSTRAINT admin_activity_log_previous_max_size
  CHECK (previous IS NULL OR pg_column_size(previous) <= 65536);

ALTER TABLE public.admin_activity_log
  DROP CONSTRAINT IF EXISTS admin_activity_log_next_max_size;
ALTER TABLE public.admin_activity_log
  ADD CONSTRAINT admin_activity_log_next_max_size
  CHECK (next IS NULL OR pg_column_size(next) <= 65536);

-- Bound action column
ALTER TABLE public.admin_activity_log
  DROP CONSTRAINT IF EXISTS admin_activity_log_action_max_length;
ALTER TABLE public.admin_activity_log
  ADD CONSTRAINT admin_activity_log_action_max_length
  CHECK (length(action) <= 128);

COMMENT ON COLUMN public.admin_activity_log.previous IS 'Previous state snapshot. Max 64KB. No user content — admin config/metadata only.';
COMMENT ON COLUMN public.admin_activity_log.next IS 'New state snapshot. Max 64KB. No user content — admin config/metadata only.';

-- -----------------------------------------------------------------------
-- 3) system_logs.message — enforce declared 200 char limit
-- -----------------------------------------------------------------------
ALTER TABLE public.system_logs
  DROP CONSTRAINT IF EXISTS system_logs_message_max_length;
ALTER TABLE public.system_logs
  ADD CONSTRAINT system_logs_message_max_length
  CHECK (length(message) <= 200);

-- system_logs.metadata — max 8KB
ALTER TABLE public.system_logs
  DROP CONSTRAINT IF EXISTS system_logs_metadata_max_size;
ALTER TABLE public.system_logs
  ADD CONSTRAINT system_logs_metadata_max_size
  CHECK (metadata IS NULL OR pg_column_size(metadata) <= 8192);

-- -----------------------------------------------------------------------
-- 4) user_metadata.notes — enforce declared 500 char limit
-- -----------------------------------------------------------------------
ALTER TABLE public.user_metadata
  DROP CONSTRAINT IF EXISTS user_metadata_notes_max_length;
ALTER TABLE public.user_metadata
  ADD CONSTRAINT user_metadata_notes_max_length
  CHECK (notes IS NULL OR length(notes) <= 500);

COMMENT ON COLUMN public.user_metadata.notes IS 'Admin-side notes only, max 500 chars. DB-enforced length. No user conversational text.';
