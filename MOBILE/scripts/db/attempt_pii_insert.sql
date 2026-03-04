--
-- DATABASE-LEVEL PROOF (B5)
-- =========================
-- SQL scripts that attempt to insert personal text directly into Supabase.
-- These attempts should FAIL due to schema constraints, triggers, or RLS.
--
-- Run these in the Supabase SQL Editor to verify structural protection.
--

-- ============================================================================
-- ATTEMPT 1: Direct insert into legacy-risk tables (should fail)
-- ============================================================================

-- Attempt 1.1: Insert into journal_entries (if table exists)
-- Expected: FAIL - Table may not exist, or columns don't exist, or RLS blocks
DO $$
BEGIN
    INSERT INTO journal_entries (user_id, content, title)
    VALUES ('00000000-0000-0000-0000-000000000000', 'Personal journal text', 'My Entry');
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'PASS: journal_entries table does not exist (safe)';
    WHEN undefined_column THEN
        RAISE NOTICE 'PASS: content column does not exist (safe)';
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'PASS: RLS blocked insert (safe)';
    WHEN OTHERS THEN
        RAISE NOTICE 'RESULT: %', SQLERRM;
END $$;

-- Attempt 1.2: Insert into conversation_messages (if table exists)
DO $$
BEGIN
    INSERT INTO conversation_messages (user_id, content, role, session_id)
    VALUES ('00000000-0000-0000-0000-000000000000', 'Secret message', 'user', 'test-session');
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'PASS: conversation_messages table does not exist (safe)';
    WHEN undefined_column THEN
        RAISE NOTICE 'PASS: content column does not exist (safe)';
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'PASS: RLS blocked insert (safe)';
    WHEN OTHERS THEN
        RAISE NOTICE 'RESULT: %', SQLERRM;
END $$;

-- Attempt 1.3: Insert into check_ins (legacy table)
DO $$
BEGIN
    INSERT INTO check_ins (user_id, note, mood_score)
    VALUES ('00000000-0000-0000-0000-000000000000', 'Personal check-in note', 5);
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'PASS: check_ins table does not exist (safe)';
    WHEN undefined_column THEN
        RAISE NOTICE 'PASS: note column does not exist (safe)';
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'PASS: RLS blocked insert (safe)';
    WHEN OTHERS THEN
        RAISE NOTICE 'RESULT: %', SQLERRM;
END $$;

-- ============================================================================
-- ATTEMPT 2: Insert into new "meta" tables with suspicious long strings
-- ============================================================================

-- Attempt 2.1: Insert into journal_entries_meta with long local_hash
-- Expected: May PASS if local_hash allows long strings, but content field should not exist
DO $$
BEGIN
    INSERT INTO journal_entries_meta (user_id, local_hash, word_count)
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        'a' || REPEAT('b', 10000), -- Very long hash
        100
    );
    RAISE NOTICE 'INFO: Long local_hash insert result - check if constraint exists';
EXCEPTION
    WHEN undefined_column THEN
        RAISE NOTICE 'PASS: Column does not exist (safe)';
    WHEN check_violation THEN
        RAISE NOTICE 'PASS: CHECK constraint blocked (safe)';
    WHEN OTHERS THEN
        RAISE NOTICE 'RESULT: %', SQLERRM;
END $$;

-- Attempt 2.2: Try to insert content field into journal_entries_meta
DO $$
BEGIN
    INSERT INTO journal_entries_meta (user_id, local_hash, content)
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        'hash123',
        'This is personal content that should not be stored'
    );
    RAISE NOTICE 'FAIL: content column exists and accepted data (unsafe)';
EXCEPTION
    WHEN undefined_column THEN
        RAISE NOTICE 'PASS: content column does not exist in journal_entries_meta (safe)';
    WHEN OTHERS THEN
        RAISE NOTICE 'RESULT: %', SQLERRM;
END $$;

-- Attempt 2.3: Try to insert text field into journal_entries_meta
DO $$
BEGIN
    INSERT INTO journal_entries_meta (user_id, local_hash, text)
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        'hash123',
        'This is personal text that should not be stored'
    );
    RAISE NOTICE 'FAIL: text column exists and accepted data (unsafe)';
EXCEPTION
    WHEN undefined_column THEN
        RAISE NOTICE 'PASS: text column does not exist in journal_entries_meta (safe)';
    WHEN OTHERS THEN
        RAISE NOTICE 'RESULT: %', SQLERRM;
END $$;

-- ============================================================================
-- ATTEMPT 3: Update operations with personal text
-- ============================================================================

-- Attempt 3.1: Update with content field
DO $$
BEGIN
    UPDATE journal_entries_meta
    SET content = 'Updated personal content'
    WHERE user_id = '00000000-0000-0000-0000-000000000000';
    RAISE NOTICE 'FAIL: content column exists and accepted update (unsafe)';
EXCEPTION
    WHEN undefined_column THEN
        RAISE NOTICE 'PASS: content column does not exist (safe)';
    WHEN OTHERS THEN
        RAISE NOTICE 'RESULT: %', SQLERRM;
END $$;

-- Attempt 3.2: Update check_ins_v2 with note field
DO $$
BEGIN
    UPDATE check_ins_v2
    SET note = 'Updated personal note'
    WHERE user_id = '00000000-0000-0000-0000-000000000000';
    RAISE NOTICE 'FAIL: note column exists and accepted update (unsafe)';
EXCEPTION
    WHEN undefined_column THEN
        RAISE NOTICE 'PASS: note column does not exist in check_ins_v2 (safe)';
    WHEN OTHERS THEN
        RAISE NOTICE 'RESULT: %', SQLERRM;
END $$;

-- ============================================================================
-- ATTEMPT 4: JSONB attempts
-- ============================================================================

-- Attempt 4.1: Insert JSONB with nested content (if table has JSONB columns)
DO $$
BEGIN
    INSERT INTO journal_entries_meta (user_id, local_hash, signals)
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        'hash123',
        '{"content": "Personal text in JSONB", "trigger": "test"}'::jsonb
    );
    RAISE NOTICE 'WARNING: JSONB signals accepted content field - verify trigger/constraint protection';
EXCEPTION
    WHEN undefined_column THEN
        RAISE NOTICE 'PASS: signals column does not exist (safe)';
    WHEN check_violation THEN
        RAISE NOTICE 'PASS: CHECK constraint blocked JSONB with content (safe)';
    WHEN trigger_protocol_violated THEN
        RAISE NOTICE 'PASS: Trigger blocked JSONB with personal text (safe)';
    WHEN OTHERS THEN
        RAISE NOTICE 'RESULT: %', SQLERRM;
END $$;

-- Attempt 4.2: Try nested JSONB with message field
DO $$
BEGIN
    INSERT INTO conversation_metadata_v2 (user_id, message_count, signals)
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        1,
        '{"message": "Hidden message in JSONB", "model": "gpt-4"}'::jsonb
    );
    RAISE NOTICE 'WARNING: JSONB accepted message field - verify trigger protection';
EXCEPTION
    WHEN undefined_column THEN
        RAISE NOTICE 'PASS: signals column does not exist (safe)';
    WHEN check_violation THEN
        RAISE NOTICE 'PASS: CHECK constraint blocked JSONB with message (safe)';
    WHEN OTHERS THEN
        RAISE NOTICE 'RESULT: %', SQLERRM;
END $$;

-- ============================================================================
-- ATTEMPT 5: Memory chunks with content field
-- ============================================================================

-- Attempt 5.1: Try to insert content into memory_chunks
DO $$
BEGIN
    INSERT INTO memory_chunks (user_id, content, content_hash)
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        'Personal memory content text',
        'hash123'
    );
    RAISE NOTICE 'FAIL: content column exists and accepted data (unsafe)';
EXCEPTION
    WHEN undefined_column THEN
        RAISE NOTICE 'PASS: content column does not exist in memory_chunks (safe)';
    WHEN OTHERS THEN
        RAISE NOTICE 'RESULT: %', SQLERRM;
END $$;

-- Attempt 5.2: Insert valid memory chunk (should work)
DO $$
BEGIN
    INSERT INTO memory_chunks (user_id, content_hash, embedding, source_type)
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        'valid_hash_123',
        ARRAY(SELECT random()::real FROM generate_series(1, 10)),
        'journal'
    );
    RAISE NOTICE 'INFO: Valid memory chunk inserted successfully (embedding only, no content)';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'RESULT: %', SQLERRM;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify meta tables exist and have correct structure
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name IN ('journal_entries_meta', 'check_ins_v2', 'conversation_metadata_v2', 'memory_chunks')
    AND table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- Check for any content/text/message columns in meta tables (should return 0 rows)
SELECT
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name LIKE '%_meta%'
    AND column_name IN ('content', 'text', 'message', 'note', 'body', 'summary', 'transcript')
    AND table_schema = 'public';

-- Verify CHECK constraints on tables
SELECT
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name IN ('journal_entries_meta', 'check_ins_v2', 'conversation_metadata_v2', 'memory_chunks')
    AND tc.constraint_type = 'CHECK'
    AND tc.table_schema = 'public';

-- Report summary
DO $$
DECLARE
    content_cols INTEGER;
    text_cols INTEGER;
    message_cols INTEGER;
BEGIN
    SELECT COUNT(*) INTO content_cols
    FROM information_schema.columns
    WHERE table_name IN ('journal_entries_meta', 'check_ins_v2', 'conversation_metadata_v2', 'memory_chunks')
        AND column_name = 'content'
        AND table_schema = 'public';

    SELECT COUNT(*) INTO text_cols
    FROM information_schema.columns
    WHERE table_name IN ('journal_entries_meta', 'check_ins_v2', 'conversation_metadata_v2', 'memory_chunks')
        AND column_name = 'text'
        AND table_schema = 'public';

    SELECT COUNT(*) INTO message_cols
    FROM information_schema.columns
    WHERE table_name IN ('journal_entries_meta', 'check_ins_v2', 'conversation_metadata_v2', 'memory_chunks')
        AND column_name = 'message'
        AND table_schema = 'public';

    RAISE NOTICE '===============================================';
    RAISE NOTICE 'DATABASE-LEVEL PROOF SUMMARY';
    RAISE NOTICE '===============================================';
    RAISE NOTICE 'Content columns in meta tables: % (should be 0)', content_cols;
    RAISE NOTICE 'Text columns in meta tables: % (should be 0)', text_cols;
    RAISE NOTICE 'Message columns in meta tables: % (should be 0)', message_cols;

    IF content_cols = 0 AND text_cols = 0 AND message_cols = 0 THEN
        RAISE NOTICE 'PASS: No personal text columns in meta tables';
    ELSE
        RAISE NOTICE 'FAIL: Personal text columns found in meta tables!';
    END IF;
    RAISE NOTICE '===============================================';
END $$;
