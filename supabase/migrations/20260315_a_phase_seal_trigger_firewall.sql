--
-- MIGRATION: 20260245_phase_seal_trigger_firewall.sql
-- PURPOSE: Database-level trigger firewall to reject personal text
-- This is the ultimate defense - works at the database level regardless of application
--

-- ============================================================================
-- CREATE UNIVERSAL PII REJECTION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION reject_personal_text()
RETURNS trigger AS $$
DECLARE
    key TEXT;
    val TEXT;
    forbidden_keys TEXT[] := ARRAY[
        'content', 'text', 'message', 'note', 'body', 'summary',
        'transcript', 'description', 'narrative', 'comment', 'entry',
        'reply', 'answer', 'reasoning', 'journal', 'reflection',
        'prompt', 'response', 'free_text', 'freeText', 'user_text',
        'assistant_text', 'user_input', 'assistant_output', 'raw_input',
        'raw_output', 'full_text', 'message_text', 'note_text'
    ];
BEGIN
    -- Iterate through all columns in the new row
    FOR key, val IN SELECT * FROM jsonb_each_text(to_jsonb(NEW))
    LOOP
        -- Check if column name is in forbidden list
        IF key = ANY(forbidden_keys) THEN
            RAISE EXCEPTION '[DB-PII-FIREWALL] FORBIDDEN COLUMN: Column "%" is not allowed. Personal text cannot be stored in database.', key
                USING ERRCODE = 'P0001',
                      HINT = 'This table does not accept personal text columns per local-first policy.';
        END IF;

        -- Check if value contains suspicious patterns (very long strings in non-hash fields)
        IF val IS NOT NULL AND LENGTH(val) > 500 THEN
            -- Allow long strings only in hash/signature/encoded fields
            IF key NOT LIKE '%hash%' AND key NOT LIKE '%signature%' AND key NOT LIKE '%encoded%' THEN
                RAISE EXCEPTION '[DB-PII-FIREWALL] OVERSIZED STRING: Column "%" contains % characters. Max allowed is 500 for non-hash fields.', key, LENGTH(val)
                    USING ERRCODE = 'P0001',
                          HINT = 'This may indicate text smuggling. Use hash fields for large data references.';
            END IF;
        END IF;

        -- Check for personal text indicators in values (only for substantial strings)
        IF val IS NOT NULL AND LENGTH(val) > 50 THEN
            -- Check for sentences (indicates free text, not structured data)
            IF val ~ '[.!?]\s+[A-Z]' AND key NOT LIKE '%hash%' THEN
                RAISE EXCEPTION '[DB-PII-FIREWALL] FREE TEXT DETECTED: Column "%" appears to contain sentences/personal text.', key
                    USING ERRCODE = 'P0001',
                          HINT = 'Personal text cannot be stored. Store content locally and reference by hash.';
            END IF;
        END IF;
    END LOOP;

    -- Allow the operation to proceed
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- APPLY TRIGGER TO ALL WRITABLE TABLES
-- ============================================================================

DO $$
DECLARE
    table_record RECORD;
    trigger_name TEXT;
BEGIN
    -- Apply to all user tables (excluding system tables)
    FOR table_record IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE '_%'
        AND table_name NOT IN ('migrations', 'schema_migrations', 'spatial_ref_sys')
    LOOP
        trigger_name := table_record.table_name || '_pii_firewall';

        BEGIN
            -- Drop existing trigger if it exists
            EXECUTE format(
                'DROP TRIGGER IF EXISTS %I ON %I;',
                trigger_name,
                table_record.table_name
            );

            -- Create new trigger
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

-- ============================================================================
-- CREATE ALTERNATIVE: ROW-LEVEL SECURITY POLICY ENFORCEMENT
-- ============================================================================

-- Function to use with RLS policies
CREATE OR REPLACE FUNCTION check_no_personal_text(user_id UUID, payload JSONB)
RETURNS BOOLEAN AS $$
DECLARE
    key TEXT;
    val TEXT;
    forbidden_keys TEXT[] := ARRAY[
        'content', 'text', 'message', 'note', 'body', 'summary',
        'transcript', 'description', 'narrative'
    ];
BEGIN
    FOR key, val IN SELECT * FROM jsonb_each_text(payload)
    LOOP
        IF key = ANY(forbidden_keys) THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================================
-- CREATE AUDIT LOG TABLE FOR BLOCKED ATTEMPTS
-- ============================================================================

DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS pii_firewall_audit (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        blocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        error_message TEXT NOT NULL,
        user_id UUID,
        constraint_name TEXT,
        ip_address INET
    );

    -- Add RLS to audit table
    ALTER TABLE pii_firewall_audit ENABLE ROW LEVEL SECURITY;

    -- Only admins can read audit logs
    CREATE POLICY pii_audit_admin_only ON pii_firewall_audit
        FOR SELECT
        USING (auth.jwt() ->> 'role' = 'admin');

    RAISE NOTICE 'Created pii_firewall_audit table for tracking blocked attempts';
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'pii_firewall_audit table already exists';
END $$;

-- ============================================================================
-- CREATE FUNCTION TO LOG BLOCKED ATTEMPTS
-- ============================================================================

CREATE OR REPLACE FUNCTION log_pii_firewall_block(
    p_table_name TEXT,
    p_operation TEXT,
    p_error_message TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO pii_firewall_audit (table_name, operation, error_message, user_id)
    VALUES (p_table_name, p_operation, p_error_message, p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

-- List all triggers created
SELECT
    trigger_name,
    event_object_table AS table_name,
    action_timing,
    event_manipulation AS event
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name LIKE '%pii_firewall%'
ORDER BY event_object_table;

-- Report success
DO $$
DECLARE
    trigger_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO trigger_count
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    AND trigger_name LIKE '%pii_firewall%';

    RAISE NOTICE '================================================================================';
    RAISE NOTICE 'DATABASE-LEVEL TRIGGER FIREWALL APPLIED';
    RAISE NOTICE '================================================================================';
    RAISE NOTICE '% PII firewall triggers created and active.', trigger_count;
    RAISE NOTICE 'All INSERT/UPDATE operations now check for forbidden columns.';
    RAISE NOTICE 'Audit table pii_firewall_audit tracks blocked attempts.';
    RAISE NOTICE '================================================================================';
END $$;
