-- Phase M4.5: Drop legacy server-side text columns. No user free text can be stored after this.
-- Run after M4 purge (or on fresh DB). Use IF EXISTS so staging/prod differences don't brick deploys.
-- Runbook only; apply via migration 20260229_phase_m4_5_drop_legacy_content.sql.

-- journal_entries
ALTER TABLE public.journal_entries DROP COLUMN IF EXISTS title;
ALTER TABLE public.journal_entries DROP COLUMN IF EXISTS content;

-- conversation_messages
ALTER TABLE public.conversation_messages DROP COLUMN IF EXISTS content;

-- check_ins
ALTER TABLE public.check_ins DROP COLUMN IF EXISTS note;

-- memory_chunks
ALTER TABLE public.memory_chunks DROP COLUMN IF EXISTS content;

-- user_reports
ALTER TABLE public.user_reports DROP COLUMN IF EXISTS summary;
ALTER TABLE public.user_reports DROP COLUMN IF EXISTS notes;

-- user_nudges (if table exists)
DO $$
BEGIN
  ALTER TABLE public.user_nudges DROP COLUMN IF EXISTS message;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;
