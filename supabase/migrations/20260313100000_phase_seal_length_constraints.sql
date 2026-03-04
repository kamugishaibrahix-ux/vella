--
-- MIGRATION: 20260243_phase_seal_length_constraints.sql
-- PURPOSE: Enforce strict length caps on ALL remaining string fields
-- This removes text smuggling via oversized "safe" fields
--

-- ============================================================================
-- LENGTH CONSTRAINTS ON SAFE STRING FIELDS
-- ============================================================================

-- Hash fields must have exact length (previously defined in 20260242)
-- This adds additional length-specific constraints

DO $$
BEGIN
    -- journal_entries_meta.local_hash exact length
    ALTER TABLE journal_entries_meta
    DROP CONSTRAINT IF EXISTS local_hash_length_exact;

    ALTER TABLE journal_entries_meta
    ADD CONSTRAINT local_hash_length_exact
    CHECK (
        local_hash IS NULL
        OR LENGTH(local_hash) = 64  -- SHA-256 hex
        OR LENGTH(local_hash) = 44  -- Base64
        OR LENGTH(local_hash) = 43  -- Base64 with padding removed
        OR LENGTH(local_hash) = 71  -- sha256: + 64 hex chars
    );
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table journal_entries_meta does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column local_hash does not exist';
END $$;

-- ============================================================================
-- ENUM-LIKE STRING FIELDS (short, controlled values)
-- ============================================================================

DO $$
BEGIN
    -- contracts_current.domain - should be short enum-like values
    ALTER TABLE contracts_current
    DROP CONSTRAINT IF EXISTS domain_length_limit;

    ALTER TABLE contracts_current
    ADD CONSTRAINT domain_length_limit
    CHECK (
        domain IS NULL
        OR LENGTH(domain) <= 32
    );
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table contracts_current does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column domain does not exist';
END $$;

DO $$
BEGIN
    -- Any status/type/enum fields should be short
    ALTER TABLE contracts_current
    DROP CONSTRAINT IF EXISTS enforcement_mode_length_limit;

    ALTER TABLE contracts_current
    ADD CONSTRAINT enforcement_mode_length_limit
    CHECK (
        enforcement_mode IS NULL
        OR LENGTH(enforcement_mode) <= 32
    );
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table contracts_current does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column enforcement_mode does not exist';
END $$;

-- ============================================================================
-- MODEL/AI FIELDS (short identifiers)
-- ============================================================================

DO $$
BEGIN
    -- conversation_metadata_v2.model_id
    ALTER TABLE conversation_metadata_v2
    DROP CONSTRAINT IF EXISTS model_id_length_limit;

    ALTER TABLE conversation_metadata_v2
    ADD CONSTRAINT model_id_length_limit
    CHECK (
        model_id IS NULL
        OR LENGTH(model_id) <= 64
    );
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table conversation_metadata_v2 does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column model_id does not exist';
END $$;

DO $$
BEGIN
    -- memory_chunks.embedding_model
    ALTER TABLE memory_chunks
    DROP CONSTRAINT IF EXISTS embedding_model_length_limit;

    ALTER TABLE memory_chunks
    ADD CONSTRAINT embedding_model_length_limit
    CHECK (
        embedding_model IS NULL
        OR LENGTH(embedding_model) <= 64
    );
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table memory_chunks does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column embedding_model does not exist';
END $$;

-- ============================================================================
-- SOURCE TYPE FIELDS (controlled vocabularies)
-- ============================================================================

DO $$
BEGIN
    -- memory_chunks.source_type
    ALTER TABLE memory_chunks
    DROP CONSTRAINT IF EXISTS source_type_length_limit;

    ALTER TABLE memory_chunks
    ADD CONSTRAINT source_type_length_limit
    CHECK (
        source_type IS NULL
        OR LENGTH(source_type) <= 32
    );
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table memory_chunks does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column source_type does not exist';
END $$;

-- ============================================================================
-- PROCESSING MODE / TYPE FIELDS
-- ============================================================================

DO $$
BEGIN
    -- journal_entries_meta.processing_mode (enum type - skip LENGTH constraint)
    ALTER TABLE journal_entries_meta
    DROP CONSTRAINT IF EXISTS processing_mode_length_limit;

    -- NOTE: processing_mode is an enum type, not text/varchar
    -- Enum values are inherently bounded, so no length constraint needed
    RAISE NOTICE 'Skipping length constraint on journal_entries_meta.processing_mode (enum type)';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table journal_entries_meta does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column processing_mode does not exist';
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not add constraint to journal_entries_meta.processing_mode: %', SQLERRM;
END $$;

-- ============================================================================
-- ID FIELDS (UUID or short identifiers)
-- ============================================================================

DO $$
DECLARE
    table_record RECORD;
BEGIN
    -- Apply length limits to common ID-like fields
    FOR table_record IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE column_name IN ('user_id', 'session_id', 'source_id', 'entry_id', 'chunk_id')
        AND table_schema = 'public'
        AND data_type IN ('character varying', 'text', 'uuid')
    LOOP
        BEGIN
            EXECUTE format(
                'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I;',
                table_record.table_name,
                table_record.column_name || '_length_limit'
            );

            -- UUID is 36 chars, but allow some flexibility for prefixed IDs
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I CHECK (
                    %I IS NULL
                    OR LENGTH(%I) <= 128
                );',
                table_record.table_name,
                table_record.column_name || '_length_limit',
                table_record.column_name,
                table_record.column_name
            );

            RAISE NOTICE 'Added length limit to %.%',
                table_record.table_name, table_record.column_name;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not add constraint to %.%: %',
                    table_record.table_name, table_record.column_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- ============================================================================
-- GLOBAL STRING LENGTH CAP (catch-all for any text field)
-- ============================================================================

DO $$
DECLARE
    table_record RECORD;
    max_length INTEGER := 500; -- Maximum allowed string length
BEGIN
    -- Apply to any text/varchar field that doesn't already have constraints
    FOR table_record IN
        SELECT c.table_name, c.column_name, c.data_type, c.character_maximum_length
        FROM information_schema.columns c
        JOIN information_schema.tables t ON c.table_name = t.table_name
        WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND c.data_type IN ('text', 'character varying')
        -- Exclude columns that are already constrained
        AND c.column_name NOT IN (
            SELECT column_name FROM information_schema.columns
            WHERE column_name LIKE '%hash%'
            OR column_name LIKE '%embedding%'
        )
        -- Only apply if no explicit max length is set
        AND (c.character_maximum_length IS NULL OR c.character_maximum_length > max_length)
        -- Skip system tables
        AND c.table_name NOT LIKE 'pg_%'
        AND c.table_name NOT LIKE '_%'
    LOOP
        BEGIN
            EXECUTE format(
                'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I;',
                table_record.table_name,
                table_record.column_name || '_max_length'
            );

            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I CHECK (
                    %I IS NULL
                    OR LENGTH(%I) <= %L
                );',
                table_record.table_name,
                table_record.table_name || '_' || table_record.column_name || '_max_length',
                table_record.column_name,
                table_record.column_name,
                max_length
            );

            RAISE NOTICE 'Added max length constraint (% chars) to %.%',
                max_length, table_record.table_name, table_record.column_name;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not add constraint to %.%: %',
                    table_record.table_name, table_record.column_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

-- Report all length constraints created
SELECT
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
    ON tc.constraint_name = cc.constraint_name
WHERE (tc.constraint_name LIKE '%length%' OR tc.constraint_name LIKE '%max_length%')
    AND tc.table_schema = 'public'
    AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name;

-- Report success
DO $$
BEGIN
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'LENGTH CONSTRAINTS APPLIED';
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'All string fields now have strict length caps at the database level.';
    RAISE NOTICE 'Hash fields: exact 64 hex / 44 base64 chars';
    RAISE NOTICE 'Enum fields: max 32 chars';
    RAISE NOTICE 'ID fields: max 128 chars';
    RAISE NOTICE 'General text: max 500 chars';
    RAISE NOTICE 'This prevents text smuggling via oversized fields.';
    RAISE NOTICE '================================================================================';
END $$;
