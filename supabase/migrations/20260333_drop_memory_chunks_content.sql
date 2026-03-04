-- MIGRATION: Drop memory_chunks.content Column
-- Single DO block for CLI compatibility.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'memory_chunks'
      AND column_name = 'content'
  ) THEN
    ALTER TABLE public.memory_chunks DROP COLUMN content;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'memory_chunks'
      AND column_name = 'content'
  ) THEN
    RAISE EXCEPTION 'Failed to drop content column from memory_chunks';
  END IF;

  EXECUTE 'COMMENT ON TABLE public.memory_chunks IS ''Phase 6C: memory chunks for retrieval; embedding stored as jsonb array. PII-safe: no content column, only hashes and metadata.''';
END $$;
