-- Migration: Phase 1 — Stabilise Memory Infrastructure
-- Option A: Server-side embeddings allowed (metadata only, vectors stored, content remains local)
-- Date: 2026-02-31

-- Phase 1 Changes:
-- 1. memory_chunks unblocked for writes (embeddings only, content column always empty)
-- 2. Added index for efficient user+time queries
-- 3. Added comment documenting local-first contract

-- 1) Add index for (user_id, created_at) - used by getRecentChunks and getRecentEmbeddedChunks
CREATE INDEX IF NOT EXISTS idx_memory_chunks_user_created
  ON public.memory_chunks(user_id, created_at DESC);

-- 2) Update table comment to reflect Phase 1 status
COMMENT ON TABLE public.memory_chunks IS 'Phase 1: memory chunks for retrieval. Embeddings stored as jsonb. Content column always empty (local-first contract). Vectors allowed, raw text never stored.';

-- 3) Add comment on content column documenting it must remain empty
COMMENT ON COLUMN public.memory_chunks.content IS 'Phase 1: ALWAYS EMPTY. Raw content stored locally in IndexedDB only. Hash is used for deduplication.';

-- 4) Add comment on embedding column
COMMENT ON COLUMN public.memory_chunks.embedding IS 'Phase 1: OpenAI text-embedding-3-small vector (1536 dims) stored as jsonb array. Only vector data stored server-side.';

-- Note: pgvector extension NOT used (embeddings stored as jsonb, similarity calculated client-side)
-- This maintains portability and avoids extra extension dependency.
