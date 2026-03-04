-- Migration: Phase 3 — Structured Memory Layer
-- Elite-only features: Memory consolidation, episodic clustering, narrative layer
-- Date: 2026-02-32

-- 1) memory_snapshots: Consolidated summaries of older chunks (metadata only)
-- Elite only. No raw content stored (content_hash references local data).
CREATE TABLE IF NOT EXISTS public.memory_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Temporal boundaries of consolidated period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Metadata only (no raw content)
  summary_hash TEXT NOT NULL, -- SHA256 of summary (stored locally)
  summary_token_estimate INT NOT NULL DEFAULT 0,
  
  -- Source tracking (which chunks were consolidated)
  source_chunk_count INT NOT NULL DEFAULT 0,
  source_chunk_hashes JSONB DEFAULT '[]'
    CHECK (source_chunk_hashes IS NULL OR pg_column_size(source_chunk_hashes) <= 32768), -- Array of content_hashes
  
  -- Thematic tags (extracted during consolidation)
  dominant_themes JSONB DEFAULT '[]'
    CHECK (dominant_themes IS NULL OR pg_column_size(dominant_themes) <= 4096),
  emotional_tone TEXT, -- e.g., "reflective", "tense", "hopeful"
  
  -- Embedding for similarity search (Elite only)
  embedding JSONB
    CHECK (embedding IS NULL OR (jsonb_typeof(embedding) = 'array' AND pg_column_size(embedding) <= 65536)),
  embedding_model TEXT,
  embedded_at TIMESTAMPTZ,
  
  -- Tier enforcement
  tier TEXT NOT NULL DEFAULT 'elite' CHECK (tier IN ('elite')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient retrieval
CREATE INDEX IF NOT EXISTS idx_memory_snapshots_user_period
  ON public.memory_snapshots(user_id, period_start DESC, period_end DESC);

-- Separate indexes: B-tree for uuid, GIN for structured themes

CREATE INDEX IF NOT EXISTS idx_memory_snapshots_user_id
ON public.memory_snapshots(user_id);

CREATE INDEX IF NOT EXISTS idx_memory_snapshots_dominant_themes
ON public.memory_snapshots
USING GIN(dominant_themes);

CREATE INDEX IF NOT EXISTS idx_memory_snapshots_user_embedded
  ON public.memory_snapshots(user_id, embedded_at) 
  WHERE embedded_at IS NOT NULL;

COMMENT ON TABLE public.memory_snapshots IS 'Phase 3: Elite-only consolidated memory summaries. No raw content - metadata and hashes only.';

-- 2) memory_clusters: Episodic groupings of related chunks
-- Elite only. Cluster metadata for narrative layer.
CREATE TABLE IF NOT EXISTS public.memory_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Cluster identity
  cluster_key TEXT NOT NULL, -- deterministic key for idempotency
  
  -- Temporal boundaries
  time_range_start TIMESTAMPTZ NOT NULL,
  time_range_end TIMESTAMPTZ NOT NULL,
  
  -- Thematic metadata
  dominant_theme TEXT NOT NULL,
  secondary_themes JSONB DEFAULT '[]'
    CHECK (secondary_themes IS NULL OR pg_column_size(secondary_themes) <= 4096),
  
  -- Summary metadata (hash only, content local)
  summary_hash TEXT NOT NULL,
  summary_token_estimate INT NOT NULL DEFAULT 0,
  
  -- Source tracking
  member_chunk_hashes JSONB DEFAULT '[]'
    CHECK (member_chunk_hashes IS NULL OR pg_column_size(member_chunk_hashes) <= 32768), -- Array of content_hashes in cluster
  member_count INT NOT NULL DEFAULT 0,
  
  -- Cohesion score (thematic similarity within cluster)
  cohesion_score NUMERIC(4,3) CHECK (cohesion_score >= 0 AND cohesion_score <= 1),
  
  -- Embedding for cluster similarity (Elite only)
  embedding JSONB
    CHECK (embedding IS NULL OR (jsonb_typeof(embedding) = 'array' AND pg_column_size(embedding) <= 65536)),
  embedding_model TEXT,
  embedded_at TIMESTAMPTZ,
  
  -- Tier enforcement
  tier TEXT NOT NULL DEFAULT 'elite' CHECK (tier IN ('elite')),
  
  -- Soft delete for recalculation
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Unique constraint: one cluster per key per user
  UNIQUE(user_id, cluster_key)
);

-- Indexes for cluster retrieval
CREATE INDEX IF NOT EXISTS idx_memory_clusters_user_active_theme
  ON public.memory_clusters(user_id, is_active, dominant_theme);

CREATE INDEX IF NOT EXISTS idx_memory_clusters_user_time_range
  ON public.memory_clusters(user_id, time_range_start DESC, time_range_end DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_memory_clusters_user_embedded
  ON public.memory_clusters(user_id, embedded_at)
  WHERE embedded_at IS NOT NULL AND is_active = true;

COMMENT ON TABLE public.memory_clusters IS 'Phase 3: Elite-only episodic memory clusters. Groups related chunks by temporal and thematic proximity.';

-- RLS Policies for memory_snapshots
ALTER TABLE public.memory_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own memory_snapshots"
  ON public.memory_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memory_snapshots"
  ON public.memory_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memory_snapshots"
  ON public.memory_snapshots FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for memory_clusters
ALTER TABLE public.memory_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own memory_clusters"
  ON public.memory_clusters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memory_clusters"
  ON public.memory_clusters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memory_clusters"
  ON public.memory_clusters FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Comments on key columns
COMMENT ON COLUMN public.memory_snapshots.summary_hash IS 'SHA256 of summary text. Actual summary stored locally (local-first contract).';
COMMENT ON COLUMN public.memory_snapshots.source_chunk_hashes IS 'Array of content_hashes referencing local chunks. No raw content stored.';
COMMENT ON COLUMN public.memory_clusters.summary_hash IS 'SHA256 of cluster summary. Full summary stored locally (local-first contract).';
COMMENT ON COLUMN public.memory_clusters.member_chunk_hashes IS 'Array of content_hashes for chunks in this cluster. References local data.';
