--
-- CI SAFEGUARD: assert_no_text_columns.sql
-- Purpose: Fail if any structural security violations exist
-- Usage: Run manually in Supabase SQL Editor or via CI pipeline
-- Exit: Returns error if violations found
--

DO $$
DECLARE
    violation_count integer := 0;
    v_record record;
    whitelisted_tables text[] := ARRAY[
        'profiles',           -- Supabase Auth extension table
        'auth_users',         -- Auth related
        'storage_objects',    -- Storage related
        'pii_firewall_audit', -- Audit log
        'migration_state',    -- Internal tracking
        'migration_audit'     -- Internal tracking
    ];
BEGIN
    -- ============================================================================
    -- CHECK 1: Forbidden TEXT columns
    -- ============================================================================
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'CHECK 1: Forbidden TEXT columns';
    RAISE NOTICE '================================================================================';
    
    FOR v_record IN
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND data_type = 'text'
        AND table_name NOT IN (SELECT unnest(whitelisted_tables))
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE '_%'
        ORDER BY table_name, column_name
    LOOP
        violation_count := violation_count + 1;
        RAISE NOTICE 'VIOLATION: Table % has TEXT column %', v_record.table_name, v_record.column_name;
    END LOOP;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND data_type = 'text'
        AND table_name NOT IN (SELECT unnest(whitelisted_tables))
    ) THEN
        RAISE NOTICE '✅ PASS: No forbidden TEXT columns found';
    END IF;
    
    -- ============================================================================
    -- CHECK 2: VARCHAR > 128 in *_meta tables (STRICT)
    -- ============================================================================
    RAISE NOTICE '';
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'CHECK 2: VARCHAR > 128 in *_meta tables (STRICT)';
    RAISE NOTICE '================================================================================';
    
    FOR v_record IN
        SELECT table_name, column_name, 
               character_maximum_length::text || ' chars' as length_info
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND data_type = 'character varying'
        AND table_name LIKE '%_meta%'
        AND table_name NOT IN (SELECT unnest(whitelisted_tables))
        AND character_maximum_length > 128
        ORDER BY table_name, column_name
    LOOP
        violation_count := violation_count + 1;
        RAISE NOTICE 'VIOLATION: _meta table % has VARCHAR column % (%)', 
            v_record.table_name, v_record.column_name, v_record.length_info;
    END LOOP;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND data_type = 'character varying'
        AND table_name LIKE '%_meta%'
        AND character_maximum_length > 128
    ) THEN
        RAISE NOTICE '✅ PASS: No VARCHAR > 128 in _meta tables';
    END IF;
    
    -- ============================================================================
    -- CHECK 3: Strict JSONB validator function
    -- ============================================================================
    RAISE NOTICE '';
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'CHECK 3: Strict JSONB validator (validate_jsonb_value_strict)';
    RAISE NOTICE '================================================================================';
    
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'validate_jsonb_value_strict'
    ) THEN
        RAISE NOTICE '✅ PASS: validate_jsonb_value_strict() function exists';
    ELSE
        violation_count := violation_count + 1;
        RAISE NOTICE '❌ FAIL: validate_jsonb_value_strict() function missing';
    END IF;
    
    -- ============================================================================
    -- CHECK 4: Embedding absolute lockdown
    -- ============================================================================
    RAISE NOTICE '';
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'CHECK 4: Embedding absolute lockdown (dimension + range)';
    RAISE NOTICE '================================================================================';
    
    -- Check for exact dimension constraint
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'embedding_exact_dimension'
        AND table_schema = 'public'
    ) THEN
        RAISE NOTICE '✅ PASS: embedding_exact_dimension constraint exists';
    ELSE
        violation_count := violation_count + 1;
        RAISE NOTICE '❌ FAIL: embedding_exact_dimension constraint missing';
    END IF;
    
    -- Check for value bounds constraint
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'embedding_value_bounds'
        AND table_schema = 'public'
    ) THEN
        RAISE NOTICE '✅ PASS: embedding_value_bounds constraint exists';
    ELSE
        violation_count := violation_count + 1;
        RAISE NOTICE '❌ FAIL: embedding_value_bounds constraint missing';
    END IF;
    
    -- Check all embedding columns have constraints
    FOR v_record IN
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        LEFT JOIN information_schema.table_constraints tc
            ON c.table_name = tc.table_name
            AND tc.constraint_name IN ('embedding_exact_dimension', 'embedding_value_bounds')
            AND tc.table_schema = 'public'
        WHERE c.table_schema = 'public'
        AND c.column_name = 'embedding'
        AND tc.constraint_name IS NULL
        ORDER BY c.table_name
    LOOP
        violation_count := violation_count + 1;
        RAISE NOTICE 'VIOLATION: Table %.embedding lacks strict constraints', 
            v_record.table_name;
    END LOOP;
    
    -- ============================================================================
    -- CHECK 5: PII firewall trigger on ALL _meta tables
    -- ============================================================================
    RAISE NOTICE '';
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'CHECK 5: PII firewall trigger coverage (MANDATORY)';
    RAISE NOTICE '================================================================================';
    
    FOR v_record IN
        SELECT t.table_name
        FROM information_schema.tables t
        LEFT JOIN information_schema.triggers trg
            ON t.table_name = trg.event_object_table
            AND trg.trigger_name LIKE '%pii%'
            AND trg.table_schema = 'public'
        WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name LIKE '%_meta%'
        AND trg.trigger_name IS NULL
        ORDER BY t.table_name
    LOOP
        violation_count := violation_count + 1;
        RAISE NOTICE 'VIOLATION: Table % missing PII firewall trigger', v_record.table_name;
    END LOOP;
    
    -- Verify specific critical tables
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE event_object_table = 'memory_chunks'
        AND trigger_name LIKE '%pii%'
    ) THEN
        violation_count := violation_count + 1;
        RAISE NOTICE 'VIOLATION: memory_chunks missing PII firewall trigger';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE event_object_table = 'memory_snapshots'
        AND trigger_name LIKE '%pii%'
    ) THEN
        violation_count := violation_count + 1;
        RAISE NOTICE 'VIOLATION: memory_snapshots missing PII firewall trigger';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE event_object_table = 'memory_clusters'
        AND trigger_name LIKE '%pii%'
    ) THEN
        violation_count := violation_count + 1;
        RAISE NOTICE 'VIOLATION: memory_clusters missing PII firewall trigger';
    END IF;
    
    -- ============================================================================
    -- CHECK 6: Forbidden columns
    -- ============================================================================
    RAISE NOTICE '';
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'CHECK 6: Forbidden columns (content, text, message, note, etc)';
    RAISE NOTICE '================================================================================';
    
    FOR v_record IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND column_name IN ('content', 'text', 'message', 'note', 'body', 
                           'summary', 'transcript', 'description', 'narrative')
        AND table_name NOT IN (SELECT unnest(whitelisted_tables))
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE '_%'
        ORDER BY table_name, column_name
    LOOP
        violation_count := violation_count + 1;
        RAISE NOTICE 'VIOLATION: Forbidden column %.% exists', 
            v_record.table_name, v_record.column_name;
    END LOOP;
    
    -- ============================================================================
    -- FINAL RESULT
    -- ============================================================================
    RAISE NOTICE '';
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'FINAL RESULT';
    RAISE NOTICE '================================================================================';
    
    IF violation_count = 0 THEN
        RAISE NOTICE '✅ ALL CHECKS PASSED';
        RAISE NOTICE 'No TEXT columns';
        RAISE NOTICE 'No VARCHAR > 128 in _meta tables';
        RAISE NOTICE 'Strict JSONB validator present';
        RAISE NOTICE 'Embedding lockdown (dimension + range) active';
        RAISE NOTICE 'PII firewall triggers on all _meta tables';
        RAISE NOTICE 'No forbidden columns exist';
        RAISE NOTICE '================================================================================';
    ELSE
        RAISE NOTICE '❌ % VIOLATION(S) FOUND', violation_count;
        RAISE NOTICE '================================================================================';
        RAISE EXCEPTION 'ASSERTION FAILED: % structural security violations found', violation_count;
    END IF;
END $$;
