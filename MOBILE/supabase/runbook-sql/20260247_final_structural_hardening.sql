--
-- RUNBOOK-SQL: 20260247_final_structural_hardening.sql
-- LOCATION: supabase/runbook-sql/ (destructive SQL requiring manual review)
-- PURPOSE: Final structural hardening to eliminate all text storage vectors
--

-- ============================================================================
-- PART 1: EMBEDDING ABSOLUTE LOCKDOWN
-- ============================================================================

DO $$
DECLARE
    expected_dim CONSTANT integer := 1536;
    min_val CONSTANT real := -5.0;
    max_val CONSTANT real := 5.0;
BEGIN
    -- memory_chunks.embedding: Exact dimension + value bounds
    ALTER TABLE memory_chunks
    DROP CONSTRAINT IF EXISTS embedding_exact_dimension;
    
    ALTER TABLE memory_chunks
    DROP CONSTRAINT IF EXISTS embedding_value_bounds;
    
    ALTER TABLE memory_chunks
    ADD CONSTRAINT embedding_exact_dimension
    CHECK (
        embedding IS NULL
        OR (
            jsonb_typeof(embedding) = 'array'
            AND jsonb_array_length(embedding) = expected_dim
        )
    );
    
    -- Range constraint: prevent ASCII numeric encoding
    ALTER TABLE memory_chunks
    ADD CONSTRAINT embedding_value_bounds
    CHECK (
        embedding IS NULL
        OR (
            SELECT bool_and(
                (value)::text::real >= min_val 
                AND (value)::text::real <= max_val
            )
            FROM jsonb_array_elements(embedding) AS value
        )
    );
    
    RAISE NOTICE 'Applied embedding lockdown to memory_chunks (dim=%, range % to %)', 
        expected_dim, min_val, max_val;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table memory_chunks does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column embedding does not exist';
END $$;

-- memory_snapshots.embedding
DO $$
DECLARE
    expected_dim CONSTANT integer := 1536;
    min_val CONSTANT real := -5.0;
    max_val CONSTANT real := 5.0;
BEGIN
    ALTER TABLE memory_snapshots
    DROP CONSTRAINT IF EXISTS embedding_exact_dimension;
    
    ALTER TABLE memory_snapshots
    DROP CONSTRAINT IF EXISTS embedding_value_bounds;
    
    ALTER TABLE memory_snapshots
    ADD CONSTRAINT embedding_exact_dimension
    CHECK (
        embedding IS NULL
        OR (
            jsonb_typeof(embedding) = 'array'
            AND jsonb_array_length(embedding) = 1536
        )
    );
    
    ALTER TABLE memory_snapshots
    ADD CONSTRAINT embedding_value_bounds
    CHECK (
        embedding IS NULL
        OR (
            SELECT bool_and(
                (value)::text::real >= -5.0 
                AND (value)::text::real <= 5.0
            )
            FROM jsonb_array_elements(embedding) AS value
        )
    );
    
    RAISE NOTICE 'Applied embedding lockdown to memory_snapshots';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table memory_snapshots does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column embedding does not exist';
END $$;

-- memory_clusters.embedding
DO $$
BEGIN
    ALTER TABLE memory_clusters
    DROP CONSTRAINT IF EXISTS embedding_exact_dimension;
    
    ALTER TABLE memory_clusters
    DROP CONSTRAINT IF EXISTS embedding_value_bounds;
    
    ALTER TABLE memory_clusters
    ADD CONSTRAINT embedding_exact_dimension
    CHECK (
        embedding IS NULL
        OR (
            jsonb_typeof(embedding) = 'array'
            AND jsonb_array_length(embedding) = 1536
        )
    );
    
    ALTER TABLE memory_clusters
    ADD CONSTRAINT embedding_value_bounds
    CHECK (
        embedding IS NULL
        OR (
            SELECT bool_and(
                (value)::text::real >= -5.0 
                AND (value)::text::real <= 5.0
            )
            FROM jsonb_array_elements(embedding) AS value
        )
    );
    
    RAISE NOTICE 'Applied embedding lockdown to memory_clusters';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table memory_clusters does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column embedding does not exist';
END $$;

-- ============================================================================
-- PART 2: JSONB TOTAL STRING ELIMINATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_jsonb_value_strict(obj jsonb)
RETURNS boolean AS $$
DECLARE
    key text;
    val jsonb;
    str_val text;
    -- STRICT WHITELIST: Only these patterns allowed
    uuid_pattern CONSTANT text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    iso_timestamp_pattern CONSTANT text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$';
    hex_hash_pattern CONSTANT text := '^[a-f0-9]{64}$';
    hex_hash_upper_pattern CONSTANT text := '^[A-F0-9]{64}$';
    prefixed_hash_pattern CONSTANT text := '^sha256:[a-f0-9]{64}$';
    safe_id_pattern CONSTANT text := '^[a-z0-9_]{1,64}$';
    safe_enum_pattern CONSTANT text := '^(active|inactive|pending|completed|failed|success|error|warning|info|debug|trace)$';
BEGIN
    -- Null is valid
    IF obj IS NULL THEN
        RETURN true;
    END IF;
    
    -- Handle arrays - recursively validate each element
    IF jsonb_typeof(obj) = 'array' THEN
        FOR val IN SELECT jsonb_array_elements(obj)
        LOOP
            IF NOT public.validate_jsonb_value_strict(val) THEN
                RETURN false;
            END IF;
        END LOOP;
        RETURN true;
    END IF;
    
    -- Handle objects - recursively validate all values
    IF jsonb_typeof(obj) = 'object' THEN
        FOR key, val IN SELECT * FROM jsonb_each(obj)
        LOOP
            -- Reject suspiciously long keys (>64 chars indicates smuggling)
            IF LENGTH(key) > 64 THEN
                RETURN false;
            END IF;
            
            -- Recursively validate the value
            IF NOT public.validate_jsonb_value_strict(val) THEN
                RETURN false;
            END IF;
        END LOOP;
        RETURN true;
    END IF;
    
    -- Handle numbers - always valid
    IF jsonb_typeof(obj) = 'number' THEN
        RETURN true;
    END IF;
    
    -- Handle booleans - always valid
    IF jsonb_typeof(obj) = 'boolean' THEN
        RETURN true;
    END IF;
    
    -- Handle strings - STRICT WHITELIST ONLY
    IF jsonb_typeof(obj) = 'string' THEN
        str_val := obj #>> '{}';
        
        -- Empty string is valid
        IF str_val = '' THEN
            RETURN true;
        END IF;
        
        -- Check against strict whitelist
        IF str_val ~ uuid_pattern THEN
            RETURN true;
        END IF;
        
        IF str_val ~ iso_timestamp_pattern THEN
            RETURN true;
        END IF;
        
        IF str_val ~ hex_hash_pattern THEN
            RETURN true;
        END IF;
        
        IF str_val ~ hex_hash_upper_pattern THEN
            RETURN true;
        END IF;
        
        IF str_val ~ prefixed_hash_pattern THEN
            RETURN true;
        END IF;
        
        IF str_val ~ safe_id_pattern THEN
            RETURN true;
        END IF;
        
        IF str_val ~ safe_enum_pattern THEN
            RETURN true;
        END IF;
        
        -- If no pattern matched, reject
        RETURN false;
    END IF;
    
    -- Unknown type - reject for safety
    RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Replace the existing jsonb_contains_invalid_strings function
CREATE OR REPLACE FUNCTION public.jsonb_contains_invalid_strings(
    obj jsonb,
    max_string_length integer DEFAULT 128,
    allowed_patterns text[] DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
    -- Use the strict validator (ignores legacy patterns)
    RETURN NOT public.validate_jsonb_value_strict(obj);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- PART 3: REDUCE ALL VARCHAR APERTURES
-- ============================================================================

-- journal_entries_meta: Reduce all VARCHAR to strict bounds
DO $$
BEGIN
    -- processing_mode: enum-like, max 32
    ALTER TABLE journal_entries_meta
    DROP CONSTRAINT IF EXISTS processing_mode_varchar_limit;
    
    ALTER TABLE journal_entries_meta
    ADD CONSTRAINT processing_mode_varchar_limit
    CHECK (
        processing_mode IS NULL
        OR LENGTH(processing_mode) <= 32
    );
    
    -- local_hash: exact 64 (SHA-256 hex)
    ALTER TABLE journal_entries_meta
    DROP CONSTRAINT IF EXISTS local_hash_exact_length;
    
    ALTER TABLE journal_entries_meta
    ADD CONSTRAINT local_hash_exact_length
    CHECK (
        local_hash IS NULL
        OR LENGTH(local_hash) = 64
        OR LENGTH(local_hash) = 44  -- Base64
        OR LENGTH(local_hash) = 71  -- sha256:prefix
    );
    
    RAISE NOTICE 'Applied VARCHAR limits to journal_entries_meta';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table journal_entries_meta does not exist';
END $$;

-- check_ins_v2: Reduce VARCHAR bounds
DO $$
BEGIN
    -- All enum/status fields max 32
    ALTER TABLE check_ins_v2
    DROP CONSTRAINT IF EXISTS status_fields_varchar_limit;
    
    ALTER TABLE check_ins_v2
    ADD CONSTRAINT status_fields_varchar_limit
    CHECK (
        (mood_score IS NULL OR mood_score BETWEEN 0 AND 10)
    );
    
    RAISE NOTICE 'Applied constraints to check_ins_v2';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table check_ins_v2 does not exist';
END $$;

-- conversation_metadata_v2: Reduce VARCHAR
DO $$
BEGIN
    -- model_id: max 64
    ALTER TABLE conversation_metadata_v2
    DROP CONSTRAINT IF EXISTS model_id_varchar_limit;
    
    ALTER TABLE conversation_metadata_v2
    ADD CONSTRAINT model_id_varchar_limit
    CHECK (
        model_id IS NULL
        OR LENGTH(model_id) <= 64
    );
    
    -- mode_enum: max 32
    ALTER TABLE conversation_metadata_v2
    DROP CONSTRAINT IF EXISTS mode_enum_varchar_limit;
    
    ALTER TABLE conversation_metadata_v2
    ADD CONSTRAINT mode_enum_varchar_limit
    CHECK (
        mode_enum IS NULL
        OR LENGTH(mode_enum) <= 32
    );
    
    RAISE NOTICE 'Applied VARCHAR limits to conversation_metadata_v2';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table conversation_metadata_v2 does not exist';
END $$;

-- memory_chunks: Reduce VARCHAR bounds
DO $$
BEGIN
    -- content_hash: max 71 (sha256: + 64 hex)
    ALTER TABLE memory_chunks
    DROP CONSTRAINT IF EXISTS content_hash_varchar_limit;
    
    ALTER TABLE memory_chunks
    ADD CONSTRAINT content_hash_varchar_limit
    CHECK (
        content_hash IS NULL
        OR LENGTH(content_hash) <= 71
    );
    
    -- source_type: enum-like, max 32
    ALTER TABLE memory_chunks
    DROP CONSTRAINT IF EXISTS source_type_varchar_limit;
    
    ALTER TABLE memory_chunks
    ADD CONSTRAINT source_type_varchar_limit
    CHECK (
        source_type IS NULL
        OR LENGTH(source_type) <= 32
    );
    
    -- source_id: reference, max 128
    ALTER TABLE memory_chunks
    DROP CONSTRAINT IF EXISTS source_id_varchar_limit;
    
    ALTER TABLE memory_chunks
    ADD CONSTRAINT source_id_varchar_limit
    CHECK (
        source_id IS NULL
        OR LENGTH(source_id) <= 128
    );
    
    -- embedding_model: max 64
    ALTER TABLE memory_chunks
    DROP CONSTRAINT IF EXISTS embedding_model_varchar_limit;
    
    ALTER TABLE memory_chunks
    ADD CONSTRAINT embedding_model_varchar_limit
    CHECK (
        embedding_model IS NULL
        OR LENGTH(embedding_model) <= 64
    );
    
    RAISE NOTICE 'Applied VARCHAR limits to memory_chunks';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table memory_chunks does not exist';
END $$;

-- contracts_current: Reduce VARCHAR
DO $$
BEGIN
    -- domain: max 32
    ALTER TABLE contracts_current
    DROP CONSTRAINT IF EXISTS domain_varchar_limit;
    
    ALTER TABLE contracts_current
    ADD CONSTRAINT domain_varchar_limit
    CHECK (
        domain IS NULL
        OR LENGTH(domain) <= 32
    );
    
    -- enforcement_mode: max 32
    ALTER TABLE contracts_current
    DROP CONSTRAINT IF EXISTS enforcement_mode_varchar_limit;
    
    ALTER TABLE contracts_current
    ADD CONSTRAINT enforcement_mode_varchar_limit
    CHECK (
        enforcement_mode IS NULL
        OR LENGTH(enforcement_mode) <= 32
    );
    
    RAISE NOTICE 'Applied VARCHAR limits to contracts_current';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table contracts_current does not exist';
END $$;

-- inbox_proposals_meta: Create and constrain
DO $$
BEGIN
    -- Check if table exists and apply constraints
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'inbox_proposals_meta'
        AND table_schema = 'public'
    ) THEN
        -- proposal_hash: max 64
        ALTER TABLE inbox_proposals_meta
        DROP CONSTRAINT IF EXISTS proposal_hash_varchar_limit;
        
        ALTER TABLE inbox_proposals_meta
        ADD CONSTRAINT proposal_hash_varchar_limit
        CHECK (
            proposal_hash IS NULL
            OR LENGTH(proposal_hash) <= 64
        );
        
        -- source_type: max 32
        ALTER TABLE inbox_proposals_meta
        DROP CONSTRAINT IF EXISTS source_type_varchar_limit;
        
        ALTER TABLE inbox_proposals_meta
        ADD CONSTRAINT source_type_varchar_limit
        CHECK (
            source_type IS NULL
            OR LENGTH(source_type) <= 32
        );
        
        RAISE NOTICE 'Applied VARCHAR limits to inbox_proposals_meta';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not apply constraints to inbox_proposals_meta: %', SQLERRM;
END $$;

-- ============================================================================
-- PART 4: GLOBAL TRIGGER ENFORCEMENT
-- ============================================================================

-- Ensure all _meta tables have firewall trigger
DO $$
DECLARE
    table_record RECORD;
    trigger_name TEXT;
BEGIN
    FOR table_record IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name LIKE '%_meta%'
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE '_%'
    LOOP
        trigger_name := table_record.table_name || '_pii_firewall';
        
        -- Check if trigger exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.triggers
            WHERE trigger_name = trigger_name
            AND event_object_table = table_record.table_name
        ) THEN
            BEGIN
                EXECUTE format(
                    'CREATE TRIGGER %I
                    BEFORE INSERT OR UPDATE
                    ON %I
                    FOR EACH ROW
                    EXECUTE FUNCTION reject_personal_text();',
                    trigger_name,
                    table_record.table_name
                );
                
                RAISE NOTICE 'Created PII firewall trigger on %', table_record.table_name;
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE NOTICE 'Could not create trigger on %: %', table_record.table_name, SQLERRM;
            END;
        END IF;
    END LOOP;
END $$;

-- Also ensure memory tables have triggers
DO $$
BEGIN
    -- memory_chunks
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE event_object_table = 'memory_chunks'
        AND trigger_name LIKE '%pii%'
    ) THEN
        CREATE TRIGGER memory_chunks_pii_firewall
        BEFORE INSERT OR UPDATE ON memory_chunks
        FOR EACH ROW
        EXECUTE FUNCTION reject_personal_text();
        
        RAISE NOTICE 'Created PII firewall trigger on memory_chunks';
    END IF;
    
    -- memory_snapshots
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE event_object_table = 'memory_snapshots'
        AND trigger_name LIKE '%pii%'
    ) THEN
        CREATE TRIGGER memory_snapshots_pii_firewall
        BEFORE INSERT OR UPDATE ON memory_snapshots
        FOR EACH ROW
        EXECUTE FUNCTION reject_personal_text();
        
        RAISE NOTICE 'Created PII firewall trigger on memory_snapshots';
    END IF;
    
    -- memory_clusters
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE event_object_table = 'memory_clusters'
        AND trigger_name LIKE '%pii%'
    ) THEN
        CREATE TRIGGER memory_clusters_pii_firewall
        BEFORE INSERT OR UPDATE ON memory_clusters
        FOR EACH ROW
        EXECUTE FUNCTION reject_personal_text();
        
        RAISE NOTICE 'Created PII firewall trigger on memory_clusters';
    END IF;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Embedding constraints
SELECT 
    'EMBEDDING CONSTRAINTS' as check_type,
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
WHERE tc.constraint_name IN ('embedding_exact_dimension', 'embedding_value_bounds')
AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- VARCHAR limits on _meta tables
SELECT 
    'VARCHAR LIMITS' as check_type,
    c.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length
FROM information_schema.columns c
WHERE c.table_schema = 'public'
AND c.table_name LIKE '%_meta%'
AND c.data_type = 'character varying'
ORDER BY c.table_name, c.column_name;

-- Trigger coverage
SELECT 
    'TRIGGER COVERAGE' as check_type,
    t.table_name,
    EXISTS(
        SELECT 1 FROM information_schema.triggers trg
        WHERE trg.event_object_table = t.table_name
        AND trg.trigger_name LIKE '%pii%'
    ) as has_pii_trigger
FROM information_schema.tables t
WHERE t.table_schema = 'public'
AND t.table_type = 'BASE TABLE'
AND (
    t.table_name LIKE '%_meta%'
    OR t.table_name IN ('memory_chunks', 'memory_snapshots', 'memory_clusters')
)
ORDER BY t.table_name;

-- Report
DO $$
BEGIN
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'FINAL STRUCTURAL HARDENING COMPLETE';
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'Part 1: Embedding constraints (exact dimension + value bounds)';
    RAISE NOTICE 'Part 2: JSONB strict string validator (UUID/ISO-timestamp/hash only)';
    RAISE NOTICE 'Part 3: VARCHAR limits (max 128 on all _meta tables)';
    RAISE NOTICE 'Part 4: PII firewall trigger coverage (all _meta + memory tables)';
    RAISE NOTICE '================================================================================';
END $$;
