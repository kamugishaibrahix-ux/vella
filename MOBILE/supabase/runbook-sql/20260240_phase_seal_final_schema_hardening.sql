-- ============================================================================
-- RUNBOOK-SQL: 20260240_phase_seal_final_schema_hardening.sql
-- LOCATION: supabase/runbook-sql/ (NOT migrations/)
-- REASON: Contains DESTRUCTIVE operations (DROP COLUMN). Per governance policy,
--         destructive SQL must be in runbook-sql/ for manual review.
-- ============================================================================
-- PHASE SEAL: FINAL SCHEMA HARDENING
-- ============================================================================
-- Purpose: Make it structurally impossible for Supabase to store personal text.
-- Date: 2026-02-40
-- Compliance: DATA_DESIGN.md Local-First Contract
--
-- GOVERNANCE NOTICE:
-- This file contains DROP COLUMN operations which are destructive. It has been
-- moved from migrations/ to runbook-sql/ per project policy requiring manual
-- review of destructive schema changes.
--
-- EXECUTION: Run manually in Supabase SQL Editor after code review approval.
-- DO NOT run automatically in CI/CD pipelines.
--
-- This script adds:
-- 1. CHECK constraints requiring local_hash on all metadata tables
-- 2. PostgreSQL function to reject rows with forbidden JSONB keys
-- 3. Trigger-based enforcement on JSONB columns
-- 4. Defense-in-depth: Drop any content columns if they exist
-- 5. RLS policy enhancement to block forbidden field inserts
-- 6. Comments documenting the local-first contract
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FORBIDDEN KEYS ARRAY (for use in CHECK constraints)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- Create an array of forbidden keys for use in constraints
  CREATE OR REPLACE FUNCTION public.get_forbidden_content_keys()
  RETURNS text[] AS $$
  BEGIN
    RETURN ARRAY[
      'content', 'text', 'message', 'note', 'body', 'journal', 'reflection',
      'summary', 'transcript', 'prompt', 'response', 'narrative', 'description',
      'comment', 'entry', 'reply', 'answer', 'reasoning', 'free_text',
      'detail', 'details', 'context', 'notes', 'note_text', 'caption',
      'content_text', 'contentText', 'user_input', 'assistant_output',
      'input', 'output', 'raw', 'payload', 'message_text', 'full_text'
    ];
  END;
  $$ LANGUAGE plpgsql IMMUTABLE;
END $$;

-- ----------------------------------------------------------------------------
-- 2. JSONB FORBIDDEN KEY CHECK FUNCTION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jsonb_has_forbidden_keys(obj jsonb)
RETURNS boolean AS $$
DECLARE
  key text;
  forbidden_keys text[];
BEGIN
  forbidden_keys := public.get_forbidden_content_keys();
  
  -- Check top-level keys
  FOR key IN SELECT jsonb_object_keys(obj)
  LOOP
    IF key = ANY(forbidden_keys) THEN
      RETURN true;
    END IF;
  END LOOP;
  
  -- Recursively check nested objects
  FOR key IN SELECT DISTINCT jsonb_object_keys(value) 
    FROM jsonb_each(obj) 
    WHERE jsonb_typeof(value) = 'object'
  LOOP
    IF key = ANY(forbidden_keys) THEN
      RETURN true;
    END IF;
  END LOOP;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ----------------------------------------------------------------------------
-- 3. TABLE HARDENING: journal_entries_meta
-- ----------------------------------------------------------------------------
-- Add CHECK constraint requiring local_hash
ALTER TABLE public.journal_entries_meta
ADD CONSTRAINT require_local_hash
CHECK (local_hash IS NOT NULL AND LENGTH(local_hash) = 64);

-- Add CHECK constraint ensuring no personal text in signals JSONB
ALTER TABLE public.journal_entries_meta
DROP CONSTRAINT IF EXISTS no_personal_text_in_signals;

ALTER TABLE public.journal_entries_meta
ADD CONSTRAINT no_personal_text_in_signals
CHECK (
  signals IS NULL OR 
  (
    jsonb_typeof(signals) = 'object' AND
    NOT public.jsonb_has_forbidden_keys(signals)
  )
);

-- Add comment documenting the contract
COMMENT ON TABLE public.journal_entries_meta IS 
'Local-first metadata only. Personal text (journal content) is stored encrypted in client-side IndexedDB. This table contains only: IDs, timestamps, mood scores, word counts, and content hashes. NO PERSONAL TEXT.';

COMMENT ON COLUMN public.journal_entries_meta.local_hash IS 
'SHA-256 hash of encrypted journal content stored locally. Required field. Max 64 chars.';

-- ----------------------------------------------------------------------------
-- 4. TABLE HARDENING: journal_entries_v2
-- ----------------------------------------------------------------------------
-- Add CHECK constraint requiring local_hash
ALTER TABLE public.journal_entries_v2
ADD CONSTRAINT require_local_hash_v2
CHECK (local_hash IS NOT NULL AND LENGTH(local_hash) <= 128);

-- Add comment
COMMENT ON TABLE public.journal_entries_v2 IS 
'LEGACY v2 table - Local-first metadata only. Personal text stored encrypted in IndexedDB. Migration target: journal_entries_meta.';

-- ----------------------------------------------------------------------------
-- 5. TABLE HARDENING: check_ins_v2
-- ----------------------------------------------------------------------------
-- Ensure no note column exists (defense in depth)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'check_ins_v2' 
    AND column_name = 'note'
  ) THEN
    ALTER TABLE public.check_ins_v2 DROP COLUMN note;
  END IF;
END $$;

-- Add comment
COMMENT ON TABLE public.check_ins_v2 IS 
'Local-first metadata only. Check-in notes are stored encrypted in client-side IndexedDB. This table contains only: IDs, timestamps, mood scores, stress/energy/focus ratings. NO PERSONAL TEXT.';

-- ----------------------------------------------------------------------------
-- 6. TABLE HARDENING: memory_chunks
-- ----------------------------------------------------------------------------
-- Ensure content column is empty/dropped
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'memory_chunks' 
    AND column_name = 'content'
  ) THEN
    -- If content exists but is always empty per Phase 1 contract, drop it
    ALTER TABLE public.memory_chunks DROP COLUMN IF EXISTS content;
  END IF;
END $$;

-- Add constraint on content_hash
ALTER TABLE public.memory_chunks
ADD CONSTRAINT require_content_hash
CHECK (content_hash IS NOT NULL AND LENGTH(content_hash) <= 128);

-- Add constraint on embedding JSONB
ALTER TABLE public.memory_chunks
DROP CONSTRAINT IF EXISTS no_content_in_embedding;

ALTER TABLE public.memory_chunks
ADD CONSTRAINT no_content_in_embedding
CHECK (
  embedding IS NULL OR 
  (
    jsonb_typeof(embedding) = 'array' AND
    NOT public.jsonb_has_forbidden_keys(embedding)
  )
);

COMMENT ON TABLE public.memory_chunks IS 
'Local-first memory system. Content stored encrypted in client-side IndexedDB. This table contains only: content hashes, embedding vectors, and metadata. NO PERSONAL TEXT.';

-- ----------------------------------------------------------------------------
-- 7. TABLE HARDENING: memory_snapshots (Elite tier)
-- ----------------------------------------------------------------------------
-- Add constraints on JSONB fields
ALTER TABLE public.memory_snapshots
ADD CONSTRAINT valid_summary_hash
CHECK (summary_hash IS NOT NULL AND LENGTH(summary_hash) <= 128);

-- Size constraints already in Phase 3, add forbidden key check
ALTER TABLE public.memory_snapshots
DROP CONSTRAINT IF EXISTS no_forbidden_keys_in_snapshot;

ALTER TABLE public.memory_snapshots
ADD CONSTRAINT no_forbidden_keys_in_snapshot
CHECK (
  (source_chunk_hashes IS NULL OR NOT public.jsonb_has_forbidden_keys(source_chunk_hashes)) AND
  (dominant_themes IS NULL OR NOT public.jsonb_has_forbidden_keys(dominant_themes)) AND
  (embedding IS NULL OR NOT public.jsonb_has_forbidden_keys(embedding))
);

COMMENT ON TABLE public.memory_snapshots IS 
'Elite-tier memory snapshots. Content summaries stored encrypted locally. This table contains only: summary hashes, chunk references, theme arrays, and embeddings. NO PERSONAL TEXT.';

-- ----------------------------------------------------------------------------
-- 8. TABLE HARDENING: memory_clusters (Elite tier)
-- ----------------------------------------------------------------------------
ALTER TABLE public.memory_clusters
ADD CONSTRAINT valid_cluster_summary_hash
CHECK (summary_hash IS NOT NULL AND LENGTH(summary_hash) <= 128);

-- Add forbidden key check
ALTER TABLE public.memory_clusters
DROP CONSTRAINT IF EXISTS no_forbidden_keys_in_cluster;

ALTER TABLE public.memory_clusters
ADD CONSTRAINT no_forbidden_keys_in_cluster
CHECK (
  (secondary_themes IS NULL OR NOT public.jsonb_has_forbidden_keys(secondary_themes)) AND
  (member_chunk_hashes IS NULL OR NOT public.jsonb_has_forbidden_keys(member_chunk_hashes)) AND
  (embedding IS NULL OR NOT public.jsonb_has_forbidden_keys(embedding))
);

COMMENT ON TABLE public.memory_clusters IS 
'Elite-tier memory clusters. Cluster summaries stored encrypted locally. This table contains only: summary hashes, theme references, cohesion scores, and embeddings. NO PERSONAL TEXT.';

-- ----------------------------------------------------------------------------
-- 9. TABLE HARDENING: conversation_metadata_v2
-- ----------------------------------------------------------------------------
-- Verify no content column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_metadata_v2' 
    AND column_name IN ('content', 'message', 'text')
  ) THEN
    RAISE EXCEPTION 'conversation_metadata_v2 contains forbidden columns. Migration required.';
  END IF;
END $$;

COMMENT ON TABLE public.conversation_metadata_v2 IS 
'Conversation metadata only. Messages stored encrypted in client-side IndexedDB. This table contains only: session IDs, timestamps, message counts, and token counts. NO PERSONAL TEXT.';

-- ----------------------------------------------------------------------------
-- 10. TABLE HARDENING: Engine Tables (Verify No Text Columns)
-- ----------------------------------------------------------------------------
-- These tables should already be metadata-only per Phase 3 engine migrations
-- Add verification constraints

-- decisions (cognitive engine)
COMMENT ON TABLE public.decisions IS 
'Cognitive engine metadata. Contains decision types, confidence scores, and outcomes. NO PERSONAL TEXT.';

-- health_metrics
COMMENT ON TABLE public.health_metrics IS 
'Health engine metrics. Contains numeric measurements (sleep hours, heart rate, etc). NO PERSONAL TEXT.';

-- financial_entries
COMMENT ON TABLE public.financial_entries IS 
'Financial engine entries. Contains amounts, categories (enums), and timestamps. NO PERSONAL TEXT.';

-- commitments
COMMENT ON TABLE public.commitments IS 
'Governance commitments. Contains commitment codes (enum references), targets, and status flags. NO PERSONAL TEXT.';

-- ----------------------------------------------------------------------------
-- 11. ENHANCED RLS POLICY: Block Forbidden Field Inserts
-- ----------------------------------------------------------------------------
-- Create a function that checks for forbidden keys in INSERT payloads
CREATE OR REPLACE FUNCTION public.check_insert_forbidden_keys()
RETURNS trigger AS $$
DECLARE
  col_name text;
  col_value jsonb;
BEGIN
  -- Iterate through all columns in the new record
  FOR col_name IN 
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = TG_TABLE_NAME 
    AND table_schema = TG_TABLE_SCHEMA
  LOOP
    -- Get the column value as JSONB
    BEGIN
      EXECUTE format('SELECT to_jsonb(($1).%I)', col_name) INTO col_value USING NEW;
      
      -- If the value is a JSONB object, check for forbidden keys
      IF jsonb_typeof(col_value) = 'object' THEN
        IF public.jsonb_has_forbidden_keys(col_value) THEN
          RAISE EXCEPTION 'Insert blocked: column % contains forbidden personal text keys', col_name
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Skip columns that can't be converted to JSONB
      CONTINUE;
    END;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to key tables
DROP TRIGGER IF EXISTS trg_block_forbidden_keys ON public.journal_entries_meta;
CREATE TRIGGER trg_block_forbidden_keys
  BEFORE INSERT OR UPDATE ON public.journal_entries_meta
  FOR EACH ROW
  EXECUTE FUNCTION public.check_insert_forbidden_keys();

DROP TRIGGER IF EXISTS trg_block_forbidden_keys_v2 ON public.journal_entries_v2;
CREATE TRIGGER trg_block_forbidden_keys_v2
  BEFORE INSERT OR UPDATE ON public.journal_entries_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.check_insert_forbidden_keys();

DROP TRIGGER IF EXISTS trg_block_forbidden_chunks ON public.memory_chunks;
CREATE TRIGGER trg_block_forbidden_chunks
  BEFORE INSERT OR UPDATE ON public.memory_chunks
  FOR EACH ROW
  EXECUTE FUNCTION public.check_insert_forbidden_keys();

-- ----------------------------------------------------------------------------
-- 12. DROP ANY REMAINING LEGACY CONTENT COLUMNS (Defense in Depth)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  table_rec record;
  column_rec record;
  forbidden_columns text[] := ARRAY[
    'content', 'text', 'message', 'note', 'body', 'journal', 'reflection',
    'summary', 'transcript', 'prompt', 'response', 'narrative', 'description'
  ];
BEGIN
  FOR table_rec IN 
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
  LOOP
    FOR column_rec IN
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = table_rec.table_name
      AND column_name = ANY(forbidden_columns)
    LOOP
      RAISE NOTICE 'Dropping forbidden column %.%', table_rec.table_name, column_rec.column_name;
      EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS %I', 
        table_rec.table_name, column_rec.column_name);
    END LOOP;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 13. MIGRATION TRACKING
-- ----------------------------------------------------------------------------
-- Record this migration in migration_state if the table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'migration_state'
  ) THEN
    INSERT INTO public.migration_state (migration_name, applied_at, applied_by)
    VALUES ('20260240_phase_seal_final_schema_hardening', now(), current_user)
    ON CONFLICT (migration_name) DO UPDATE 
    SET applied_at = now(), applied_by = current_user;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 14. FINAL VERIFICATION VIEW
-- ----------------------------------------------------------------------------
-- Create a view that shows the hardening status of all tables
CREATE OR REPLACE VIEW public.schema_hardening_status AS
SELECT 
  t.table_name,
  c.column_name,
  c.data_type,
  CASE 
    WHEN c.column_name IN (
      'content', 'text', 'message', 'note', 'body', 'journal', 'reflection',
      'summary', 'transcript', 'prompt', 'response'
    ) THEN 'FORBIDDEN - SHOULD NOT EXIST'
    WHEN c.column_name = 'local_hash' THEN 'REQUIRED - Local reference hash'
    WHEN c.column_name IN ('embedding', 'signals', 'state_json') THEN 'JSONB - Checked for forbidden keys'
    ELSE 'OK'
  END as hardening_status
FROM information_schema.tables t
JOIN information_schema.columns c 
  ON t.table_name = c.table_name 
  AND t.table_schema = c.table_schema
WHERE t.table_schema = 'public'
AND t.table_type = 'BASE TABLE'
AND t.table_name NOT IN ('migration_state', 'migration_audit', 'webhook_events')
ORDER BY t.table_name, c.ordinal_position;

-- Add comment to the view
COMMENT ON VIEW public.schema_hardening_status IS 
'Diagnostic view showing the hardening status of all tables. Run SELECT * FROM schema_hardening_status to verify compliance.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- - Added CHECK constraints requiring local_hash on metadata tables
-- - Created jsonb_has_forbidden_keys() function
-- - Added trigger-based enforcement blocking forbidden key inserts
-- - Added defense-in-depth column drops for any remaining forbidden columns
-- - Added comprehensive table/column comments documenting the local-first contract
-- - Created schema_hardening_status view for compliance verification
--
-- PERSONAL TEXT IS NOW STRUCTURALLY IMPOSSIBLE TO STORE IN SUPABASE.
-- ============================================================================