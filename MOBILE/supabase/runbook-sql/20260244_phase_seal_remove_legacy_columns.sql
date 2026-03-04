--
-- RUNBOOK-SQL: 20260244_phase_seal_remove_legacy_columns.sql
-- LOCATION: supabase/runbook-sql/ (NOT migrations/)
-- REASON: Contains DESTRUCTIVE operations (DROP COLUMN). Per governance policy,
--         destructive SQL must be in runbook-sql/ for manual review before execution.
-- PURPOSE: Completely remove ALL legacy text columns
-- This makes text storage structurally impossible
--

-- ============================================================================
-- GOVERNANCE NOTICE
-- ============================================================================
-- This file contains DROP COLUMN operations which are destructive and irreversible.
-- It has been moved from migrations/ to runbook-sql/ per project policy requiring
-- manual review of destructive schema changes.
--
-- EXECUTION: Run manually in Supabase SQL Editor after code review approval.
-- DO NOT run automatically in CI/CD pipelines.
--
-- ============================================================================
-- LEGACY TEXT COLUMN REMOVAL
-- ============================================================================

-- Note: All DROP COLUMN IF EXISTS are idempotent (safe to run multiple times)

-- ============================================================================
-- journal_entries - COMPLETE REMOVAL OF TEXT COLUMNS
-- ============================================================================

DO $$
BEGIN
    -- These columns must not exist (they contain personal text)
    ALTER TABLE journal_entries
    DROP COLUMN IF EXISTS content,
    DROP COLUMN IF EXISTS title,
    DROP COLUMN IF EXISTS body,
    DROP COLUMN IF EXISTS summary,
    DROP COLUMN IF EXISTS note,
    DROP COLUMN IF EXISTS text;

    RAISE NOTICE 'Dropped legacy text columns from journal_entries';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table journal_entries does not exist';
END $$;

-- ============================================================================
-- check_ins - COMPLETE REMOVAL OF TEXT COLUMNS
-- ============================================================================

DO $$
BEGIN
    ALTER TABLE check_ins
    DROP COLUMN IF EXISTS note,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS text,
    DROP COLUMN IF EXISTS body,
    DROP COLUMN IF EXISTS comment;

    RAISE NOTICE 'Dropped legacy text columns from check_ins';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table check_ins does not exist';
END $$;

-- ============================================================================
-- conversation_messages - COMPLETE REMOVAL OF TEXT COLUMNS
-- ============================================================================

DO $$
BEGIN
    ALTER TABLE conversation_messages
    DROP COLUMN IF EXISTS content,
    DROP COLUMN IF EXISTS message,
    DROP COLUMN IF EXISTS text,
    DROP COLUMN IF EXISTS body,
    DROP COLUMN IF EXISTS transcript;

    RAISE NOTICE 'Dropped legacy text columns from conversation_messages';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table conversation_messages does not exist';
END $$;

-- ============================================================================
-- memory_chunks - COMPLETE REMOVAL OF TEXT COLUMNS
-- ============================================================================

DO $$
BEGIN
    ALTER TABLE memory_chunks
    DROP COLUMN IF EXISTS content,
    DROP COLUMN IF EXISTS text,
    DROP COLUMN IF EXISTS body,
    DROP COLUMN IF EXISTS note,
    DROP COLUMN IF EXISTS summary,
    DROP COLUMN IF EXISTS raw_data;

    RAISE NOTICE 'Dropped legacy text columns from memory_chunks';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table memory_chunks does not exist';
END $$;

-- ============================================================================
-- user_reports - COMPLETE REMOVAL OF TEXT COLUMNS
-- ============================================================================

DO $$
BEGIN
    ALTER TABLE user_reports
    DROP COLUMN IF EXISTS summary,
    DROP COLUMN IF EXISTS notes,
    DROP COLUMN IF EXISTS content,
    DROP COLUMN IF EXISTS text,
    DROP COLUMN IF EXISTS body,
    DROP COLUMN IF EXISTS description;

    RAISE NOTICE 'Dropped legacy text columns from user_reports';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table user_reports does not exist';
END $$;

-- ============================================================================
-- user_nudges - COMPLETE REMOVAL OF TEXT COLUMNS
-- ============================================================================

DO $$
BEGIN
    ALTER TABLE user_nudges
    DROP COLUMN IF EXISTS message,
    DROP COLUMN IF EXISTS content,
    DROP COLUMN IF EXISTS text,
    DROP COLUMN IF EXISTS body,
    DROP COLUMN IF EXISTS note;

    RAISE NOTICE 'Dropped legacy text columns from user_nudges';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table user_nudges does not exist';
END $$;

-- ============================================================================
-- Additional legacy tables
-- ============================================================================

DO $$
BEGIN
    ALTER TABLE journal_entries_v2
    DROP COLUMN IF EXISTS content,
    DROP COLUMN IF EXISTS title,
    DROP COLUMN IF EXISTS body;

    RAISE NOTICE 'Dropped legacy text columns from journal_entries_v2';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table journal_entries_v2 does not exist';
END $$;

DO $$
BEGIN
    ALTER TABLE check_ins_v2
    DROP COLUMN IF EXISTS note,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS text;

    RAISE NOTICE 'Dropped legacy text columns from check_ins_v2';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table check_ins_v2 does not exist';
END $$;

DO $$
BEGIN
    ALTER TABLE conversation_metadata_v2
    DROP COLUMN IF EXISTS last_message_preview,
    DROP COLUMN IF EXISTS summary,
    DROP COLUMN IF EXISTS description;

    RAISE NOTICE 'Dropped legacy text columns from conversation_metadata_v2';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table conversation_metadata_v2 does not exist';
END $$;

DO $$
BEGIN
    ALTER TABLE user_reports_v2
    DROP COLUMN IF EXISTS summary,
    DROP COLUMN IF EXISTS notes,
    DROP COLUMN IF EXISTS content;

    RAISE NOTICE 'Dropped legacy text columns from user_reports_v2';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table user_reports_v2 does not exist';
END $$;

-- ============================================================================
-- SYSTEMATIC REMOVAL: Find and drop ALL content/text/message columns
-- ============================================================================

DO $$
DECLARE
    table_record RECORD;
BEGIN
    -- Find all tables with forbidden text columns
    FOR table_record IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE column_name IN (
            'content', 'text', 'message', 'note', 'body', 'summary',
            'transcript', 'description', 'title', 'raw_data', 'full_text'
        )
        AND table_schema = 'public'
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE '_%'
    LOOP
        BEGIN
            EXECUTE format(
                'ALTER TABLE %I DROP COLUMN IF EXISTS %I;',
                table_record.table_name,
                table_record.column_name
            );

            RAISE NOTICE 'Dropped %.% (forbidden text column)',
                table_record.table_name, table_record.column_name;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not drop %.%: %',
                    table_record.table_name, table_record.column_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- ============================================================================
-- VERIFICATION: Ensure no forbidden columns exist
-- ============================================================================

-- Query to verify removal
SELECT
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE column_name IN (
    'content', 'text', 'message', 'note', 'body', 'summary',
    'transcript', 'description', 'title', 'raw_data'
)
AND table_schema = 'public'
AND table_name NOT LIKE 'pg_%'
ORDER BY table_name, column_name;

-- This should return 0 rows if all columns were successfully removed

-- Report success
DO $$
DECLARE
    remaining_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_count
    FROM information_schema.columns
    WHERE column_name IN (
        'content', 'text', 'message', 'note', 'body', 'summary',
        'transcript', 'description', 'title'
    )
    AND table_schema = 'public'
    AND table_name NOT LIKE 'pg_%';

    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'LEGACY TEXT COLUMN REMOVAL COMPLETE';
    RAISE NOTICE '================================================================================';

    IF remaining_count = 0 THEN
        RAISE NOTICE '✅ SUCCESS: All forbidden text columns have been removed.';
        RAISE NOTICE 'Personal text storage is now structurally impossible.';
    ELSE
        RAISE NOTICE '⚠️ WARNING: % forbidden columns still exist.', remaining_count;
        RAISE NOTICE 'Review the verification query above for remaining columns.';
    END IF;

    RAISE NOTICE '================================================================================';
END $$;
