-- MIGRATION: Drop Raw PII Tables
-- Single DO block for CLI compatibility.
DO $$
BEGIN
  EXECUTE 'DROP TABLE IF EXISTS public.conversation_messages CASCADE';
  EXECUTE 'DROP TABLE IF EXISTS public.journal_entries CASCADE';
  EXECUTE 'DROP TABLE IF EXISTS public.check_ins CASCADE';

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversation_messages') THEN
    RAISE EXCEPTION 'Failed to drop conversation_messages table';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'journal_entries') THEN
    RAISE EXCEPTION 'Failed to drop journal_entries table';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'check_ins') THEN
    RAISE EXCEPTION 'Failed to drop check_ins table';
  END IF;
END $$;
