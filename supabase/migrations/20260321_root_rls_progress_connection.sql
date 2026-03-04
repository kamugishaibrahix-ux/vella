-- ==========================================================================
-- B3 FIX: Enable RLS on progress_metrics and connection_depth
-- ==========================================================================
-- Both tables are user-scoped (PK/FK = user_id → auth.users).
-- Neither has RLS. Content is numeric scores only — not PII, but
-- cross-user reads violate privacy guarantees.
--
-- Schema (from 20250220/20250221):
--   progress_metrics (user_id PK, consistency_score, emotional_openness,
--     improvement_score, stability_score, connection_index, data jsonb, updated_at)
--   connection_depth (user_id PK, depth_score, last_increase,
--     last_reciprocated, updated_at)
-- ==========================================================================

-- -----------------------------------------------------------------------
-- 1) progress_metrics
-- -----------------------------------------------------------------------
ALTER TABLE public.progress_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "progress_metrics_select_own" ON public.progress_metrics;
CREATE POLICY "progress_metrics_select_own" ON public.progress_metrics
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "progress_metrics_insert_own" ON public.progress_metrics;
CREATE POLICY "progress_metrics_insert_own" ON public.progress_metrics
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "progress_metrics_update_own" ON public.progress_metrics;
CREATE POLICY "progress_metrics_update_own" ON public.progress_metrics
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "progress_metrics_delete_own" ON public.progress_metrics;
CREATE POLICY "progress_metrics_delete_own" ON public.progress_metrics
  FOR DELETE USING (auth.uid() = user_id);

-- Bound the optional data JSONB column (nullable)
ALTER TABLE public.progress_metrics
  DROP CONSTRAINT IF EXISTS progress_metrics_data_max_size;
ALTER TABLE public.progress_metrics
  ADD CONSTRAINT progress_metrics_data_max_size
  CHECK (data IS NULL OR pg_column_size(data) <= 8192);

COMMENT ON TABLE public.progress_metrics IS 'Per-user progress scores (numeric only) + optional bounded metadata JSONB. No user content. RLS enforced.';
COMMENT ON COLUMN public.progress_metrics.data IS 'Optional structured metadata (score breakdowns). Max 8KB. NO user-generated content.';

-- -----------------------------------------------------------------------
-- 2) connection_depth
-- -----------------------------------------------------------------------
ALTER TABLE public.connection_depth ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connection_depth_select_own" ON public.connection_depth;
CREATE POLICY "connection_depth_select_own" ON public.connection_depth
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "connection_depth_insert_own" ON public.connection_depth;
CREATE POLICY "connection_depth_insert_own" ON public.connection_depth
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "connection_depth_update_own" ON public.connection_depth;
CREATE POLICY "connection_depth_update_own" ON public.connection_depth
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "connection_depth_delete_own" ON public.connection_depth;
CREATE POLICY "connection_depth_delete_own" ON public.connection_depth
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.connection_depth IS 'Per-user connection depth metric (numeric score + timestamps). No user content. RLS enforced.';
