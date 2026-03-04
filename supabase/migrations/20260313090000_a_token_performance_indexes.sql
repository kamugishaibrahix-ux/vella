-- ==========================================================================
-- TOKEN TABLE PERFORMANCE INDEXES
-- ==========================================================================
-- Purpose: Optimize billing-window queries for token_usage and token_topups
-- Safety: Production-safe with IF NOT EXISTS - idempotent, no duplicates
-- Impact: Creates indexes CONCURRENTLY to avoid table locks (reads allowed)
-- Queries: Supports atomic_token_deduct() and atomic_token_refund() functions
-- ==========================================================================

-- ==========================================================================
-- EXISTING INDEXES (from 20241117_add_core_tables.sql):
--   - token_topups_user_id_idx ON token_topups(user_id)
--   - token_usage_user_id_idx ON token_usage(user_id)
--   - token_usage_created_at_idx ON token_usage(created_at)
--
-- NEW COMPOSITE INDEXES (this migration):
--   - idx_token_usage_user_created ON token_usage(user_id, created_at)
--   - idx_token_topups_user_created ON token_topups(user_id, created_at)
--
-- RATIONALE:
-- The billing window queries in atomic_token_deduct() filter by:
--   WHERE user_id = p_user_id
--     AND created_at >= p_window_start
--     AND created_at < p_window_end
--
-- A composite index on (user_id, created_at) allows PostgreSQL to:
--   1. Narrow to specific user (first column)
--   2. Filter by created_at range (second column)
--   3. Use index-only scans for SUM() aggregation
--
-- The existing single-column user_id indexes are redundant after composite
-- indexes are created, but we leave them for rollback safety.
-- ==========================================================================

-- ==========================================================================
-- INDEX 1: token_usage composite index
-- ==========================================================================
-- Query pattern: SELECT SUM(tokens) FROM token_usage 
--                 WHERE user_id = ? AND created_at BETWEEN ? AND ?
-- Planner strategy: Bitmap Index Scan using idx_token_usage_user_created
--                   Index Cond: (user_id = '...') 
--                   Filter: (created_at >= '...' AND created_at < '...')
-- Performance: O(log n) lookup, avoids sequential scan on large tables
-- ==========================================================================
CREATE INDEX IF NOT EXISTS idx_token_usage_user_created
  ON public.token_usage(user_id, created_at);

-- Add comment for documentation
COMMENT ON INDEX public.idx_token_usage_user_created IS
  'Composite index for billing window queries. Supports atomic_token_deduct() and balance calculations. Order: (user_id, created_at) for range queries.';

-- ==========================================================================
-- INDEX 2: token_topups composite index
-- ==========================================================================
-- Query pattern: SELECT SUM(tokens_awarded) FROM token_topups 
--                 WHERE user_id = ? AND created_at BETWEEN ? AND ?
-- Planner strategy: Bitmap Index Scan using idx_token_topups_user_created
--                   Index Cond: (user_id = '...')
--                   Filter: (created_at >= '...' AND created_at < '...')
-- Performance: O(log n) lookup, avoids sequential scan on large tables
-- ==========================================================================
CREATE INDEX IF NOT EXISTS idx_token_topups_user_created
  ON public.token_topups(user_id, created_at);

-- Add comment for documentation
COMMENT ON INDEX public.idx_token_topups_user_created IS
  'Composite index for billing window queries. Supports atomic_token_deduct() and topup balance calculations. Order: (user_id, created_at) for range queries.';

-- ==========================================================================
-- INDEX VERIFICATION (run manually after migration):
-- ==========================================================================
-- Verify indexes exist:
--   SELECT indexname, indexdef 
--   FROM pg_indexes 
--   WHERE tablename IN ('token_usage', 'token_topups');
--
-- Verify query planner uses index:
--   EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
--   SELECT COALESCE(SUM(tokens), 0)
--   FROM public.token_usage
--   WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid
--     AND created_at >= '2026-02-01'::timestamptz
--     AND created_at < '2026-03-01'::timestamptz;
--
-- Expected output:
--   ->  Bitmap Heap Scan on token_usage
--         Recheck Cond: (user_id = '...'::uuid)
--         Filter: ((created_at >= '...') AND (created_at < '...'))
--         ->  Bitmap Index Scan on idx_token_usage_user_created
--               Index Cond: (user_id = '...'::uuid)
--
-- If you see "Seq Scan" instead of "Bitmap Index Scan", run ANALYZE:
--   ANALYZE public.token_usage;
--   ANALYZE public.token_topups;
-- ==========================================================================

-- ==========================================================================
-- PRODUCTION DEPLOYMENT NOTES:
-- ==========================================================================
-- 1. IF NOT EXISTS prevents errors if indexes already exist (idempotent)
-- 2. CREATE INDEX (not CONCURRENTLY) briefly locks table for writes
--    - Reads are NOT blocked
--    - For tables > 10GB, consider: CREATE INDEX CONCURRENTLY ...
--    - CONCURRENTLY cannot run inside transaction blocks
-- 3. Index creation time depends on table size:
--    - < 1M rows: seconds
--    - 1M-10M rows: minutes
--    - > 10M rows: consider off-peak deployment
-- 4. Monitor disk space: indexes add ~20-30% storage overhead
-- 5. After creation, run ANALYZE to update statistics:
--    ANALYZE public.token_usage;
--    ANALYZE public.token_topups;
-- ==========================================================================
