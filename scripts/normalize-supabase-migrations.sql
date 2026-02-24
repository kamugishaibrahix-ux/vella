-- ============================================================================
-- Supabase Migration Engine Complete Normalization Script
-- ============================================================================
-- Execute this script ONCE to normalize the migration engine tables.
-- This ensures supabase migration up --linked and supabase db pull work correctly.
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Ensure schema exists
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

-- ============================================================================
-- STEP 2: Create/fix supabase_migrations.schema_migrations table
-- ============================================================================
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version text PRIMARY KEY,
    name text NOT NULL,
    hash text NOT NULL,
    executed_at timestamptz NOT NULL DEFAULT now(),
    statements jsonb
);

-- Add missing columns
DO $$
BEGIN
    -- Add hash column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'supabase_migrations' 
        AND table_name = 'schema_migrations' 
        AND column_name = 'hash'
    ) THEN
        ALTER TABLE supabase_migrations.schema_migrations 
        ADD COLUMN hash text NOT NULL DEFAULT 'placeholder';
    END IF;

    -- Add executed_at column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'supabase_migrations' 
        AND table_name = 'schema_migrations' 
        AND column_name = 'executed_at'
    ) THEN
        ALTER TABLE supabase_migrations.schema_migrations 
        ADD COLUMN executed_at timestamptz NOT NULL DEFAULT now();
    END IF;

    -- Add statements column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'supabase_migrations' 
        AND table_name = 'schema_migrations' 
        AND column_name = 'statements'
    ) THEN
        ALTER TABLE supabase_migrations.schema_migrations 
        ADD COLUMN statements jsonb;
    END IF;

    -- Fix column types if wrong
    -- Ensure hash is text
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'supabase_migrations' 
        AND table_name = 'schema_migrations' 
        AND column_name = 'hash'
        AND data_type != 'text'
    ) THEN
        ALTER TABLE supabase_migrations.schema_migrations 
        ALTER COLUMN hash TYPE text;
    END IF;

    -- Ensure executed_at is timestamptz
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'supabase_migrations' 
        AND table_name = 'schema_migrations' 
        AND column_name = 'executed_at'
        AND data_type != 'timestamp with time zone'
    ) THEN
        ALTER TABLE supabase_migrations.schema_migrations 
        ALTER COLUMN executed_at TYPE timestamptz;
    END IF;
END $$;

-- ============================================================================
-- STEP 3: Create/fix supabase_migrations.migrations table (if it exists)
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'supabase_migrations' 
        AND table_name = 'migrations'
    ) THEN
        -- Add missing columns
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'supabase_migrations' 
            AND table_name = 'migrations' 
            AND column_name = 'hash'
        ) THEN
            ALTER TABLE supabase_migrations.migrations 
            ADD COLUMN hash text NOT NULL DEFAULT 'placeholder';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'supabase_migrations' 
            AND table_name = 'migrations' 
            AND column_name = 'executed_at'
        ) THEN
            ALTER TABLE supabase_migrations.migrations 
            ADD COLUMN executed_at timestamptz NOT NULL DEFAULT now();
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'supabase_migrations' 
            AND table_name = 'migrations' 
            AND column_name = 'statements'
        ) THEN
            ALTER TABLE supabase_migrations.migrations 
            ADD COLUMN statements jsonb;
        END IF;

        -- Fix column types
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'supabase_migrations' 
            AND table_name = 'migrations' 
            AND column_name = 'hash'
            AND data_type != 'text'
        ) THEN
            ALTER TABLE supabase_migrations.migrations 
            ALTER COLUMN hash TYPE text;
        END IF;

        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'supabase_migrations' 
            AND table_name = 'migrations' 
            AND column_name = 'executed_at'
            AND data_type != 'timestamp with time zone'
        ) THEN
            ALTER TABLE supabase_migrations.migrations 
            ALTER COLUMN executed_at TYPE timestamptz;
        END IF;
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Remove invalid entries (versions not in remote list)
-- ============================================================================
DELETE FROM supabase_migrations.schema_migrations
WHERE version NOT IN (
    '20241117',
    '20250101',
    '20250101000000',
    '20250217',
    '20250218',
    '20250219',
    '20250220',
    '20250221',
    '20250222',
    '20250223',
    '20251129154622',
    '20251219',
    '20251220'
);

-- Also remove from migrations table if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'supabase_migrations' 
        AND table_name = 'migrations'
    ) THEN
        DELETE FROM supabase_migrations.migrations
        WHERE version NOT IN (
            '20241117',
            '20250101',
            '20250101000000',
            '20250217',
            '20250218',
            '20250219',
            '20250220',
            '20250221',
            '20250222',
            '20250223',
            '20251129154622',
            '20251219',
            '20251220'
        );
    END IF;
END $$;

-- ============================================================================
-- STEP 5: Sync remote history into schema_migrations
-- ============================================================================
INSERT INTO supabase_migrations.schema_migrations (version, name, hash, executed_at, statements)
VALUES
    ('20241117', '20241117_add_core_tables', 'placeholder', COALESCE((SELECT executed_at FROM supabase_migrations.schema_migrations WHERE version = '20241117'), now()), '[]'::jsonb),
    ('20250101', '20250101_drop_sensitive_tables', 'placeholder', COALESCE((SELECT executed_at FROM supabase_migrations.schema_migrations WHERE version = '20250101'), now()), '[]'::jsonb),
    ('20250101000000', '20250101000000_vella_core_admin', 'placeholder', COALESCE((SELECT executed_at FROM supabase_migrations.schema_migrations WHERE version = '20250101000000'), now()), '[]'::jsonb),
    ('20250217', '20250217_token_engine', 'placeholder', COALESCE((SELECT executed_at FROM supabase_migrations.schema_migrations WHERE version = '20250217'), now()), '[]'::jsonb),
    ('20250218', '20250218_add_adaptive_traits', 'placeholder', COALESCE((SELECT executed_at FROM supabase_migrations.schema_migrations WHERE version = '20250218'), now()), '[]'::jsonb),
    ('20250219', '20250219_add_nudge_history', 'placeholder', COALESCE((SELECT executed_at FROM supabase_migrations.schema_migrations WHERE version = '20250219'), now()), '[]'::jsonb),
    ('20250220', '20250220_add_feature_tables', 'placeholder', COALESCE((SELECT executed_at FROM supabase_migrations.schema_migrations WHERE version = '20250220'), now()), '[]'::jsonb),
    ('20250221', '20250221_add_progress_features', 'placeholder', COALESCE((SELECT executed_at FROM supabase_migrations.schema_migrations WHERE version = '20250221'), now()), '[]'::jsonb),
    ('20250222', '20250222_add_last_active_at', 'placeholder', COALESCE((SELECT executed_at FROM supabase_migrations.schema_migrations WHERE version = '20250222'), now()), '[]'::jsonb),
    ('20250223', '20250223_remove_checkin_note', 'placeholder', COALESCE((SELECT executed_at FROM supabase_migrations.schema_migrations WHERE version = '20250223'), now()), '[]'::jsonb),
    ('20251129154622', '20251129154622_create_admin_global_config', 'placeholder', COALESCE((SELECT executed_at FROM supabase_migrations.schema_migrations WHERE version = '20251129154622'), now()), '[]'::jsonb),
    ('20251219', '20251219_drop_legacy_vella_settings_fields', 'placeholder', COALESCE((SELECT executed_at FROM supabase_migrations.schema_migrations WHERE version = '20251219'), now()), '[]'::jsonb),
    ('20251220', '20251220_fix_vella_settings', 'placeholder', COALESCE((SELECT executed_at FROM supabase_migrations.schema_migrations WHERE version = '20251220'), now()), '[]'::jsonb)
ON CONFLICT (version) 
DO UPDATE SET
    name = EXCLUDED.name,
    hash = COALESCE(NULLIF(schema_migrations.hash, ''), 'placeholder'),
    executed_at = COALESCE(schema_migrations.executed_at, EXCLUDED.executed_at),
    statements = COALESCE(schema_migrations.statements, '[]'::jsonb);

-- ============================================================================
-- STEP 6: Sync to migrations table if it exists
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'supabase_migrations' 
        AND table_name = 'migrations'
    ) THEN
        INSERT INTO supabase_migrations.migrations (version, name, hash, executed_at, statements)
        SELECT version, name, hash, executed_at, statements
        FROM supabase_migrations.schema_migrations
        ON CONFLICT (version) DO UPDATE SET
            name = EXCLUDED.name,
            hash = EXCLUDED.hash,
            executed_at = EXCLUDED.executed_at,
            statements = EXCLUDED.statements;
    END IF;
END $$;

-- ============================================================================
-- STEP 7: Ensure no NULL values
-- ============================================================================
UPDATE supabase_migrations.schema_migrations
SET 
    hash = COALESCE(NULLIF(hash, ''), 'placeholder'),
    executed_at = COALESCE(executed_at, now()),
    statements = COALESCE(statements, '[]'::jsonb)
WHERE hash IS NULL OR hash = '' OR executed_at IS NULL OR statements IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'supabase_migrations' 
        AND table_name = 'migrations'
    ) THEN
        UPDATE supabase_migrations.migrations
        SET 
            hash = COALESCE(NULLIF(hash, ''), 'placeholder'),
            executed_at = COALESCE(executed_at, now()),
            statements = COALESCE(statements, '[]'::jsonb)
        WHERE hash IS NULL OR hash = '' OR executed_at IS NULL OR statements IS NULL;
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- VALIDATION QUERIES (run after commit to verify)
-- ============================================================================
-- SELECT version, name, hash, executed_at 
-- FROM supabase_migrations.schema_migrations 
-- ORDER BY version;
--
-- SELECT version, name, hash, executed_at 
-- FROM supabase_migrations.migrations 
-- ORDER BY version;

