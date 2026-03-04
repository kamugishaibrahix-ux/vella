-- ==========================================================================
-- Size constraints for Phase 3 memory JSONB columns
-- Enforces bounded storage for metadata-only JSONB arrays and embeddings.
-- ==========================================================================

-- memory_snapshots: source_chunk_hashes (array of SHA256 hashes, bounded)
ALTER TABLE public.memory_snapshots
  DROP CONSTRAINT IF EXISTS memory_snapshots_source_hashes_size;
ALTER TABLE public.memory_snapshots
  ADD CONSTRAINT memory_snapshots_source_hashes_size
  CHECK (source_chunk_hashes IS NULL OR pg_column_size(source_chunk_hashes) <= 32768);

-- memory_snapshots: dominant_themes (small theme tag array)
ALTER TABLE public.memory_snapshots
  DROP CONSTRAINT IF EXISTS memory_snapshots_themes_size;
ALTER TABLE public.memory_snapshots
  ADD CONSTRAINT memory_snapshots_themes_size
  CHECK (dominant_themes IS NULL OR pg_column_size(dominant_themes) <= 4096);

-- memory_snapshots: embedding (vector array, bounded)
ALTER TABLE public.memory_snapshots
  DROP CONSTRAINT IF EXISTS memory_snapshots_embedding_size;
ALTER TABLE public.memory_snapshots
  ADD CONSTRAINT memory_snapshots_embedding_size
  CHECK (embedding IS NULL OR pg_column_size(embedding) <= 65536);

-- memory_clusters: secondary_themes (small theme tag array)
ALTER TABLE public.memory_clusters
  DROP CONSTRAINT IF EXISTS memory_clusters_themes_size;
ALTER TABLE public.memory_clusters
  ADD CONSTRAINT memory_clusters_themes_size
  CHECK (secondary_themes IS NULL OR pg_column_size(secondary_themes) <= 4096);

-- memory_clusters: member_chunk_hashes (array of SHA256 hashes, bounded)
ALTER TABLE public.memory_clusters
  DROP CONSTRAINT IF EXISTS memory_clusters_member_hashes_size;
ALTER TABLE public.memory_clusters
  ADD CONSTRAINT memory_clusters_member_hashes_size
  CHECK (member_chunk_hashes IS NULL OR pg_column_size(member_chunk_hashes) <= 32768);

-- memory_clusters: embedding (vector array, bounded)
ALTER TABLE public.memory_clusters
  DROP CONSTRAINT IF EXISTS memory_clusters_embedding_size;
ALTER TABLE public.memory_clusters
  ADD CONSTRAINT memory_clusters_embedding_size
  CHECK (embedding IS NULL OR pg_column_size(embedding) <= 65536);

COMMENT ON COLUMN public.memory_snapshots.source_chunk_hashes IS 'Array of SHA256 content hashes. Size-bounded (32KB). No user content.';
COMMENT ON COLUMN public.memory_snapshots.dominant_themes IS 'Theme tag codes. Size-bounded (4KB). No user content.';
COMMENT ON COLUMN public.memory_snapshots.embedding IS 'Vector embedding array. Size-bounded (64KB). No user content.';
COMMENT ON COLUMN public.memory_clusters.secondary_themes IS 'Secondary theme codes. Size-bounded (4KB). No user content.';
COMMENT ON COLUMN public.memory_clusters.member_chunk_hashes IS 'Array of SHA256 content hashes. Size-bounded (32KB). No user content.';
COMMENT ON COLUMN public.memory_clusters.embedding IS 'Vector embedding array. Size-bounded (64KB). No user content.';
