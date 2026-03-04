--
-- CRITICAL PATCH: 20260246_embedding_deep_smuggling_patch.sql
-- Purpose: Fix Gap A (embedding dimension/range) and Gap B (JSONB deep value scanning)
-- Location: runbook-sql/ (destructive/hardening SQL per governance)
--

-- ============================================================================
-- GAP A FIX: Embedding Dimension and Numeric Range Constraints
-- ============================================================================

-- Expected dimension for text-embedding-3-small
DO $$
DECLARE
    expected_dimension CONSTANT integer := 1536;
BEGIN
    -- memory_chunks: Add dimension constraint
    ALTER TABLE memory_chunks
    DROP CONSTRAINT IF EXISTS embedding_dimension_exact;
    
    ALTER TABLE memory_chunks
    ADD CONSTRAINT embedding_dimension_exact
    CHECK (
        embedding IS NULL
        OR (
            jsonb_typeof(embedding) = 'array'
            AND jsonb_array_length(embedding) = expected_dimension
        )
    );
    
    RAISE NOTICE 'Added embedding dimension constraint (%) to memory_chunks', expected_dimension;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table memory_chunks does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column embedding does not exist';
END $$;

-- memory_snapshots: Add dimension constraint
DO $$
DECLARE
    expected_dimension CONSTANT integer := 1536;
BEGIN
    ALTER TABLE memory_snapshots
    DROP CONSTRAINT IF EXISTS embedding_dimension_exact;
    
    ALTER TABLE memory_snapshots
    ADD CONSTRAINT embedding_dimension_exact
    CHECK (
        embedding IS NULL
        OR (
            jsonb_typeof(embedding) = 'array'
            AND jsonb_array_length(embedding) = expected_dimension
        )
    );
    
    RAISE NOTICE 'Added embedding dimension constraint (%) to memory_snapshots', expected_dimension;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table memory_snapshots does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column embedding does not exist';
END $$;

-- memory_clusters: Add dimension constraint
DO $$
DECLARE
    expected_dimension CONSTANT integer := 1536;
BEGIN
    ALTER TABLE memory_clusters
    DROP CONSTRAINT IF EXISTS embedding_dimension_exact;
    
    ALTER TABLE memory_clusters
    ADD CONSTRAINT embedding_dimension_exact
    CHECK (
        embedding IS NULL
        OR (
            jsonb_typeof(embedding) = 'array'
            AND jsonb_array_length(embedding) = expected_dimension
        )
    );
    
    RAISE NOTICE 'Added embedding dimension constraint (%) to memory_clusters', expected_dimension;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table memory_clusters does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column embedding does not exist';
END $$;

-- ============================================================================
-- GAP B FIX: Deep JSONB String Value Scanner
-- ============================================================================

-- Create function to recursively scan JSONB and detect non-whitelisted string values
CREATE OR REPLACE FUNCTION public.jsonb_contains_invalid_strings(
    obj jsonb,
    max_string_length integer DEFAULT 128,
    allowed_patterns text[] DEFAULT ARRAY[
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',  -- UUID
        '^[a-f0-9]{64}$',  -- SHA-256 hex
        '^[A-F0-9]{64}$',  -- SHA-256 hex uppercase
        '^sha256:[a-f0-9]{64}$',  -- Prefixed SHA-256
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}',  -- ISO timestamp
        '^[A-Za-z0-9_-]{1,64}$',  -- Safe identifiers (enums, codes)
        '^[0-9]+$',  -- Numeric strings
        '^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$',  -- Scientific notation
        '^[a-z_]{1,32}$',  -- Snake_case enums
        '^[a-z]+(_[a-z]+)*$'  -- Multi-word enums
    ]
)
RETURNS boolean AS $$
DECLARE
    key text;
    val jsonb;
    str_val text;
    pattern text;
    is_allowed boolean;
BEGIN
    -- Handle null
    IF obj IS NULL THEN
        RETURN false;
    END IF;
    
    -- Handle arrays
    IF jsonb_typeof(obj) = 'array' THEN
        FOR val IN SELECT jsonb_array_elements(obj)
        LOOP
            IF public.jsonb_contains_invalid_strings(val, max_string_length, allowed_patterns) THEN
                RETURN true;
            END IF;
        END LOOP;
        RETURN false;
    END IF;
    
    -- Handle objects
    IF jsonb_typeof(obj) = 'object' THEN
        FOR key, val IN SELECT * FROM jsonb_each(obj)
        LOOP
            -- Check the key itself isn't suspiciously long (indicates smuggling)
            IF LENGTH(key) > 64 THEN
                RETURN true;
            END IF;
            
            -- Recursively check value
            IF jsonb_typeof(val) IN ('object', 'array') THEN
                IF public.jsonb_contains_invalid_strings(val, max_string_length, allowed_patterns) THEN
                    RETURN true;
                END IF;
            ELSIF jsonb_typeof(val) = 'string' THEN
                str_val := val #>> '{}';
                
                -- Empty strings are allowed
                IF str_val IS NULL OR str_val = '' THEN
                    CONTINUE;
                END IF;
                
                -- Check length (long strings are suspicious)
                IF LENGTH(str_val) > max_string_length THEN
                    RETURN true;
                END IF;
                
                -- Check against whitelist patterns
                is_allowed := false;
                FOREACH pattern IN ARRAY allowed_patterns
                LOOP
                    IF str_val ~ pattern THEN
                        is_allowed := true;
                        EXIT;
                    END IF;
                END LOOP;
                
                -- If no pattern matched, it's an arbitrary string (potential smuggling)
                IF NOT is_allowed THEN
                    RETURN true;
                END IF;
            END IF;
        END LOOP;
        RETURN false;
    END IF;
    
    -- Handle string values directly
    IF jsonb_typeof(obj) = 'string' THEN
        str_val := obj #>> '{}';
        
        IF str_val IS NULL OR str_val = '' THEN
            RETURN false;
        END IF;
        
        IF LENGTH(str_val) > max_string_length THEN
            RETURN true;
        END IF;
        
        is_allowed := false;
        FOREACH pattern IN ARRAY allowed_patterns
        LOOP
            IF str_val ~ pattern THEN
                is_allowed := true;
                EXIT;
            END IF;
        END LOOP;
        
        RETURN NOT is_allowed;
    END IF;
    
    -- Numbers, booleans, null are always fine
    RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- GAP B FIX: Apply Deep String Check to JSONB Columns
-- ============================================================================

-- journal_entries_meta.signals
DO $$
BEGIN
    ALTER TABLE journal_entries_meta
    DROP CONSTRAINT IF EXISTS no_arbitrary_strings_in_signals;
    
    ALTER TABLE journal_entries_meta
    ADD CONSTRAINT no_arbitrary_strings_in_signals
    CHECK (
        signals IS NULL
        OR NOT public.jsonb_contains_invalid_strings(signals, 128)
    );
    
    RAISE NOTICE 'Added deep string check to journal_entries_meta.signals';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table journal_entries_meta does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column signals does not exist';
END $$;

-- vella_settings.voice_hud
DO $$
BEGIN
    ALTER TABLE vella_settings
    DROP CONSTRAINT IF EXISTS no_arbitrary_strings_in_voice_hud;
    
    ALTER TABLE vella_settings
    ADD CONSTRAINT no_arbitrary_strings_in_voice_hud
    CHECK (
        voice_hud IS NULL
        OR NOT public.jsonb_contains_invalid_strings(voice_hud, 128)
    );
    
    RAISE NOTICE 'Added deep string check to vella_settings.voice_hud';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table vella_settings does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column voice_hud does not exist';
END $$;

-- vella_settings.privacy_flags
DO $$
BEGIN
    ALTER TABLE vella_settings
    DROP CONSTRAINT IF EXISTS no_arbitrary_strings_in_privacy_flags;
    
    ALTER TABLE vella_settings
    ADD CONSTRAINT no_arbitrary_strings_in_privacy_flags
    CHECK (
        privacy_flags IS NULL
        OR NOT public.jsonb_contains_invalid_strings(privacy_flags, 128)
    );
    
    RAISE NOTICE 'Added deep string check to vella_settings.privacy_flags';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table vella_settings does not exist';
    WHEN undefined_column THEN
        RAISE NOTICE 'Column privacy_flags does not exist';
END $$;

-- ============================================================================
-- GAP C FIX: Ensure Trigger Attached to All _meta Tables
-- ============================================================================

DO $$
DECLARE
    table_record RECORD;
    trigger_name TEXT;
BEGIN
    -- Find all _meta tables without the trigger
    FOR table_record IN
        SELECT t.table_name
        FROM information_schema.tables t
        LEFT JOIN information_schema.triggers trg
            ON t.table_name = trg.event_object_table
            AND trg.trigger_name LIKE '%pii_firewall%'
        WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name LIKE '%_meta%'
        AND trg.trigger_name IS NULL
    LOOP
        trigger_name := table_record.table_name || '_pii_firewall';
        
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
            
            RAISE NOTICE 'Applied PII firewall trigger to %', table_record.table_name;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not apply trigger to %: %', table_record.table_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- Also ensure inbox_proposals_meta has trigger specifically
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'inbox_proposals_meta'
        AND table_schema = 'public'
    ) THEN
        DROP TRIGGER IF EXISTS inbox_proposals_meta_pii_firewall ON inbox_proposals_meta;
        
        CREATE TRIGGER inbox_proposals_meta_pii_firewall
        BEFORE INSERT OR UPDATE ON inbox_proposals_meta
        FOR EACH ROW
        EXECUTE FUNCTION reject_personal_text();
        
        RAISE NOTICE 'Applied PII firewall trigger to inbox_proposals_meta';
    END IF;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 
    'EMBEDDING DIMENSION CONSTRAINTS' as check_type,
    tc.table_name,
    tc.constraint_name
FROM information_schema.table_constraints tc
WHERE tc.constraint_name LIKE '%embedding_dimension%'
AND tc.table_schema = 'public'
ORDER BY tc.table_name;

SELECT 
    'JSONB STRING CHECK CONSTRAINTS' as check_type,
    tc.table_name,
    tc.constraint_name
FROM information_schema.table_constraints tc
WHERE tc.constraint_name LIKE '%no_arbitrary_strings%'
AND tc.table_schema = 'public'
ORDER BY tc.table_name;

SELECT 
    'PII FIREWALL TRIGGERS' as check_type,
    event_object_table as table_name,
    trigger_name
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name LIKE '%pii_firewall%'
ORDER BY event_object_table;

DO $$
BEGIN
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'CRITICAL PATCHES APPLIED';
    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'Gap A: Embedding dimension constraints (1536) added';
    RAISE NOTICE 'Gap B: Deep JSONB string value scanner added';
    RAISE NOTICE 'Gap C: PII firewall trigger attached to all _meta tables';
    RAISE NOTICE '================================================================================';
END $$;
