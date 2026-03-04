-- Migration: Phase 6C — Memory retrieval layer (chunks + embeddings).
-- Durable store for memory chunks; embeddings stored as jsonb (no pgvector).

-- 1) memory_chunks
CREATE TABLE IF NOT EXISTS public.memory_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('journal', 'conversation', 'snapshot')),
  source_id UUID NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  token_estimate INT NOT NULL DEFAULT 0,
  embedding JSONB,
  embedding_model TEXT,
  embedded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_chunks_user_type_created
  ON public.memory_chunks(user_id, source_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_chunks_user_embedded
  ON public.memory_chunks(user_id, embedded_at) WHERE embedded_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_chunks_user_type_source
  ON public.memory_chunks(user_id, source_type, source_id);

ALTER TABLE public.memory_chunks
  ADD CONSTRAINT memory_chunks_unique_key UNIQUE (user_id, source_type, source_id, chunk_index, content_hash);

ALTER TABLE public.memory_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own memory_chunks"
  ON public.memory_chunks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memory_chunks"
  ON public.memory_chunks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memory_chunks"
  ON public.memory_chunks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own memory_chunks"
  ON public.memory_chunks FOR DELETE
  USING (auth.uid() = user_id);

-- 2) memory_embed_jobs (optional; no queue, operational safety only)
CREATE TABLE IF NOT EXISTS public.memory_embed_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES public.memory_chunks(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'done', 'error')) DEFAULT 'pending',
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_embed_jobs_status_created
  ON public.memory_embed_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_memory_embed_jobs_user_status
  ON public.memory_embed_jobs(user_id, status);

ALTER TABLE public.memory_embed_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own memory_embed_jobs"
  ON public.memory_embed_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memory_embed_jobs"
  ON public.memory_embed_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memory_embed_jobs"
  ON public.memory_embed_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own memory_embed_jobs"
  ON public.memory_embed_jobs FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.memory_chunks IS 'Phase 6C: memory chunks for retrieval; embedding stored as jsonb array.';
COMMENT ON TABLE public.memory_embed_jobs IS 'Phase 6C: optional job tracking for embedding; no background queue.';
