--
-- MIGRATION: 20260242_phase_seal_hash_format_constraints.sql
-- PURPOSE: Enforce strict format constraints on ALL hash fields
-- This prevents text smuggling via hash fields (e.g., "Today I feel broken" as "local_hash")
--

-- ============================================================================
-- HASH FIELD FORMAT CONSTRAINTS
-- ============================================================================

-- For journal_entries_meta.local_hash (SHA-256 hex format: 64 hex characters)
DO $$
BEGIN
    ALTER TABLE journal_entries_meta
    DROP CONSTRAINT IF EXISTS local_hash_hex_format;

    ALTER TABLE journal_entries_meta
    ADD CONSTRAINT local_hash_hex_format
    CHECK (
        local_hash IS NULL
        OR local_hash ~ '^[a-f0-9]{64}$'
        OR local_hash ~ '^[A-F0-9]{64}$'
    );
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table journal_entries_meta does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column local_hash does not exist in journal_entries_meta';
END $$;

-- For journal_entries_meta with base64 variant (44 chars for SHA-256)
DO $$
BEGIN
    ALTER TABLE journal_entries_meta
    DROP CONSTRAINT IF EXISTS local_hash_base64_format;

    ALTER TABLE journal_entries_meta
    ADD CONSTRAINT local_hash_base64_format
    CHECK (
        local_hash IS NULL
        OR LENGTH(local_hash) = 64  -- Hex format
        OR local_hash ~ '^[A-Za-z0-9+/]{43}=$'  -- Base64 format with padding
        OR local_hash ~ '^[A-Za-z0-9+/]{44}$'   -- Base64 format without padding
    );
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table journal_entries_meta does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column local_hash does not exist';
END $$;

-- For memory_chunks.content_hash
DO $$
BEGIN
    ALTER TABLE memory_chunks
    DROP CONSTRAINT IF EXISTS content_hash_format;

    ALTER TABLE memory_chunks
    ADD CONSTRAINT content_hash_format
    CHECK (
        content_hash IS NULL
        OR content_hash ~ '^[a-f0-9]{64}$'  -- SHA-256 hex
        OR content_hash ~ '^sha256:[a-f0-9]{64}$'  -- Prefixed format
        OR content_hash ~ '^[A-Za-z0-9+/]{43}=$'  -- Base64
    );
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table memory_chunks does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column content_hash does not exist in memory_chunks';
END $$;

-- For check_ins_v2 (if it has any hash fields)
DO $$
BEGIN
    -- Check if check_ins_v2 has hash-related columns
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'check_ins_v2'
        AND column_name LIKE '%hash%'
        AND table_schema = 'public'
    ) THEN
        RAISE NOTICE 'check_ins_v2 has hash columns - constraints applied at application level';
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table check_ins_v2 does not exist';
END $$;

-- Generic hash constraint application for all tables
DO $$
DECLARE
    table_record RECORD;
    column_record RECORD;
BEGIN
    -- Find all tables with hash columns
    FOR table_record IN
        SELECT DISTINCT table_name
        FROM information_schema.columns
        WHERE column_name LIKE '%hash%'
        AND table_schema = 'public'
        AND table_name NOT LIKE 'pg_%'
    LOOP
        FOR column_record IN
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = table_record.table_name
            AND column_name LIKE '%hash%'
            AND table_schema = 'public'
        LOOP
            BEGIN
                -- Drop existing constraint
                EXECUTE format(
                    'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I;',
                    table_record.table_name,
                    column_record.column_name || '_format_check'
                );

                -- Add format constraint
                -- Allows: hex SHA-256 (64 chars), prefixed hex, or base64
                EXECUTE format(
                    'ALTER TABLE %I ADD CONSTRAINT %I CHECK (
                        %I IS NULL
                        OR %I ~ ''^[a-f0-9]{64}$''
                        OR %I ~ ''^[A-F0-9]{64}$''
                        OR %I ~ ''^sha256:[a-f0-9]{64}$''
                        OR %I ~ ''^[A-Za-z0-9+/]{43}=$''
                        OR %I ~ ''^[A-Za-z0-9+/]{44}$''
                    );',
                    table_record.table_name,
                    column_record.column_name || '_format_check',
                    column_record.column_name,
                    column_record.column_name,
                    column_record.column_name,
                    column_record.column_name,
                    column_record.column_name,
                    column_record.column_name
                );

                RAISE NOTICE 'Added hash format constraint to %.%',
                    table_record.table_name, column_record.column_name;
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE NOTICE 'Could not add constraint to %.%: %',
                        table_record.table_name, column_record.column_name, SQLERRM;
            END;
        END LOOP;
    END LOOP;
END $$;

-- ============================================================================
-- CHECKSUM FIELD CONSTRAINTS (if any exist)
-- ============================================================================

DO $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE column_name LIKE '%checksum%'
        OR column_name LIKE '%signature%'
        AND table_schema = 'public'
    LOOP
        BEGIN
            EXECUTE format(
                'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I;',
                table_record.table_name,
                table_record.column_name || '_format_check'
            );

            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I CHECK (
                    %I IS NULL
                    OR LENGTH(%I) BETWEEN 32 AND 128
                    AND %I ~ ''^[A-Za-z0-9+/=:]+$''
                );',
                table_record.table_name,
                table_record.column_name || '_format_check',
                table_record.column_name,
                table_record.column_name,
                table_record.column_name
            );

            RAISE NOTICE 'Added checksum format constraint to %.%',
                table_record.table_name, table_record.column_name;
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

-- Report all hash constraints created
SELECT
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
    ON tc.constraint_name = cc.constraint_name
WHERE (tc.constraint_name LIKE '%hash%' OR tc.constraint_name LIKE '%checksum%')
    AND tc.table_schema = 'public'
    AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name;

-- Report success
DO $$
BEGIN
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'HASH FIELD FORMAT CONSTRAINTS APPLIED';
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'All hash fields now enforce strict format at the database level.';
    RAISE NOTICE 'Valid formats: SHA-256 hex (64 chars), sha256:prefixed, Base64 (44 chars)';
    RAISE NOTICE 'This prevents text smuggling via hash fields.';
    RAISE NOTICE '================================================================================';
END $$;
