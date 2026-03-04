DO $$
BEGIN
  ALTER TABLE public.memory_chunks
  DROP CONSTRAINT IF EXISTS embedding_numeric_only_check;

  ALTER TABLE public.memory_chunks
  ADD CONSTRAINT embedding_numeric_only_check
  CHECK (public.is_numeric_jsonb_array(embedding));
END $$;
