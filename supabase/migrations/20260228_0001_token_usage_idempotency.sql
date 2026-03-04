-- ==========================================================================
-- TOKEN USAGE IDEMPOTENCY: DB-level duplicate charge/refund prevention
-- ==========================================================================
-- Purpose: Make network retries mathematically safe via UNIQUE constraints
-- Strategy: Add request_id + kind columns with UNIQUE constraint
-- Guarantees: Exactly-once charge and refund semantics enforced by Postgres
-- ==========================================================================

-- ==========================================================================
-- STEP 1: Add request_id and kind columns to token_usage
-- ==========================================================================
DO $$
BEGIN
  -- Add request_id column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'token_usage'
      AND column_name = 'request_id'
  ) THEN
    ALTER TABLE public.token_usage
    ADD COLUMN request_id UUID NULL;
  END IF;

  -- Add kind column if not exists (default 'charge' for backwards compatibility)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'token_usage'
      AND column_name = 'kind'
  ) THEN
    ALTER TABLE public.token_usage
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'charge';
  END IF;
END $$;

-- ==========================================================================
-- STEP 2: Add CHECK constraints
-- ==========================================================================
DO $$
BEGIN
  -- Ensure tokens can never be zero (charges positive, refunds negative)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'token_usage_tokens_not_zero'
    AND conrelid = 'public.token_usage'::regclass
  ) THEN
    ALTER TABLE public.token_usage
    ADD CONSTRAINT token_usage_tokens_not_zero
    CHECK (tokens <> 0);
  END IF;

  -- Ensure kind is only 'charge' or 'refund'
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'token_usage_kind_valid'
    AND conrelid = 'public.token_usage'::regclass
  ) THEN
    ALTER TABLE public.token_usage
    ADD CONSTRAINT token_usage_kind_valid
    CHECK (kind IN ('charge', 'refund'));
  END IF;
END $$;

-- ==========================================================================
-- STEP 3: Add UNIQUE constraint for idempotency
-- ==========================================================================
-- This is the core invariant: (user_id, request_id, kind) must be unique
-- WHERE request_id IS NOT NULL allows legacy rows without request_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'token_usage_idempotency_unique'
  ) THEN
    CREATE UNIQUE INDEX token_usage_idempotency_unique
    ON public.token_usage (user_id, request_id, kind)
    WHERE request_id IS NOT NULL;
  END IF;
END $$;

COMMENT ON INDEX public.token_usage_idempotency_unique IS
  'Prevents duplicate charges/refunds for the same request_id. NULL request_id allowed for legacy rows.';

-- ==========================================================================
-- STEP 4: Add supporting indexes for performance
-- ==========================================================================
-- Index for charge lookups by request_id (used by refund function)
CREATE INDEX IF NOT EXISTS idx_token_usage_request_id_lookup
ON public.token_usage (user_id, request_id, kind)
WHERE request_id IS NOT NULL;

-- Index for user + source queries (performance, non-unique)
CREATE INDEX IF NOT EXISTS idx_token_usage_user_source
ON public.token_usage (user_id, source);

-- ==========================================================================
-- VERIFICATION QUERIES (run manually after migration):
-- ==========================================================================
--
-- 1. Verify columns exist:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'token_usage' AND column_name IN ('request_id', 'kind');
--
-- 2. Verify constraints exist:
--   SELECT conname, pg_get_constraintdef(oid) as definition
--   FROM pg_constraint
--   WHERE conrelid = 'public.token_usage'::regclass;
--
-- 3. Verify unique index exists:
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE indexname = 'token_usage_idempotency_unique';
--
-- ==========================================================================
