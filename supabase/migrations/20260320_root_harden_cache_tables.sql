-- ==========================================================================
-- B2 FIX: RLS + constraints on micro_rag_cache, social_models, vella_personality
-- ==========================================================================
-- All three tables: PK = user_id → auth.users, single JSONB column, no RLS.
--
-- Schema (from 20250220_add_feature_tables.sql):
--   micro_rag_cache (user_id PK, data jsonb NOT NULL, updated_at)
--   social_models   (user_id PK, model jsonb NOT NULL, updated_at)
--   vella_personality (user_id PK, traits jsonb NOT NULL, updated_at)
--
-- Risk: unbounded JSONB could store user content. micro_rag_cache name
-- suggests RAG text cache — must be bounded and documented.
--
-- Fix: Enable RLS, add size constraints, add comments.
-- ==========================================================================

-- -----------------------------------------------------------------------
-- 1) micro_rag_cache — RAG metadata cache (NO raw text content allowed)
-- -----------------------------------------------------------------------
ALTER TABLE public.micro_rag_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "micro_rag_cache_select_own" ON public.micro_rag_cache;
CREATE POLICY "micro_rag_cache_select_own" ON public.micro_rag_cache
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "micro_rag_cache_insert_own" ON public.micro_rag_cache;
CREATE POLICY "micro_rag_cache_insert_own" ON public.micro_rag_cache
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "micro_rag_cache_update_own" ON public.micro_rag_cache;
CREATE POLICY "micro_rag_cache_update_own" ON public.micro_rag_cache
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "micro_rag_cache_delete_own" ON public.micro_rag_cache;
CREATE POLICY "micro_rag_cache_delete_own" ON public.micro_rag_cache
  FOR DELETE USING (auth.uid() = user_id);

-- Hard size cap: 32KB max for the data column
ALTER TABLE public.micro_rag_cache
  DROP CONSTRAINT IF EXISTS micro_rag_cache_data_max_size;
ALTER TABLE public.micro_rag_cache
  ADD CONSTRAINT micro_rag_cache_data_max_size
  CHECK (pg_column_size(data) <= 32768);

COMMENT ON TABLE public.micro_rag_cache IS 'RAG metadata cache per user. MUST NOT store raw user text — hashes, vectors, and scores only. Max 32KB. RLS enforced.';
COMMENT ON COLUMN public.micro_rag_cache.data IS 'Structured RAG metadata (hashes, similarity scores, chunk IDs). NO raw text content, NO journal/conversation/note text.';

-- -----------------------------------------------------------------------
-- 2) social_models — derived social/relationship model (no user content)
-- -----------------------------------------------------------------------
ALTER TABLE public.social_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_models_select_own" ON public.social_models;
CREATE POLICY "social_models_select_own" ON public.social_models
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "social_models_insert_own" ON public.social_models;
CREATE POLICY "social_models_insert_own" ON public.social_models
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "social_models_update_own" ON public.social_models;
CREATE POLICY "social_models_update_own" ON public.social_models
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "social_models_delete_own" ON public.social_models;
CREATE POLICY "social_models_delete_own" ON public.social_models
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.social_models
  DROP CONSTRAINT IF EXISTS social_models_model_max_size;
ALTER TABLE public.social_models
  ADD CONSTRAINT social_models_model_max_size
  CHECK (pg_column_size(model) <= 16384);

COMMENT ON TABLE public.social_models IS 'Derived social/relationship model per user. Numeric scores and category codes only. No user content. Max 16KB. RLS enforced.';
COMMENT ON COLUMN public.social_models.model IS 'Structured social model (scores, category codes). NO free text, NO user-generated content.';

-- -----------------------------------------------------------------------
-- 3) vella_personality — AI personality config (no user content)
-- -----------------------------------------------------------------------
ALTER TABLE public.vella_personality ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vella_personality_select_own" ON public.vella_personality;
CREATE POLICY "vella_personality_select_own" ON public.vella_personality
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "vella_personality_insert_own" ON public.vella_personality;
CREATE POLICY "vella_personality_insert_own" ON public.vella_personality
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vella_personality_update_own" ON public.vella_personality;
CREATE POLICY "vella_personality_update_own" ON public.vella_personality
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vella_personality_delete_own" ON public.vella_personality;
CREATE POLICY "vella_personality_delete_own" ON public.vella_personality
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.vella_personality
  DROP CONSTRAINT IF EXISTS vella_personality_traits_max_size;
ALTER TABLE public.vella_personality
  ADD CONSTRAINT vella_personality_traits_max_size
  CHECK (pg_column_size(traits) <= 8192);

COMMENT ON TABLE public.vella_personality IS 'AI personality traits per user. Structured scores/codes only. No user content. Max 8KB. RLS enforced.';
COMMENT ON COLUMN public.vella_personality.traits IS 'Personality trait scores and codes. NO free text, NO user-generated content.';
