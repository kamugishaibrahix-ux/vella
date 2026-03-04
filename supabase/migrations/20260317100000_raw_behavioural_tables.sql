-- Migration: Phase 6B — Behavioural metadata tables (journal, check-ins, conversation).
-- Local-first: raw text stored on-device only. Server stores metadata and content hashes.

-- 1) journal_entries (local-first: raw text stored on-device only)
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_hash VARCHAR(128), -- SHA-256 of title (actual title stored locally)
  content_hash VARCHAR(128) NOT NULL, -- SHA-256 of content (actual content stored locally)
  word_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_created
  ON public.journal_entries(user_id, created_at DESC);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own journal_entries"
  ON public.journal_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own journal_entries"
  ON public.journal_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own journal_entries"
  ON public.journal_entries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own journal_entries"
  ON public.journal_entries FOR DELETE
  USING (auth.uid() = user_id);

-- 2) check_ins
CREATE TABLE IF NOT EXISTS public.check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  mood SMALLINT,
  stress SMALLINT,
  energy SMALLINT,
  focus SMALLINT,
  note_hash VARCHAR(128), -- SHA-256 hash of check-in notes (raw stored locally only)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_check_ins_user_entry_date
  ON public.check_ins(user_id, entry_date DESC);

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own check_ins"
  ON public.check_ins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own check_ins"
  ON public.check_ins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own check_ins"
  ON public.check_ins FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own check_ins"
  ON public.check_ins FOR DELETE
  USING (auth.uid() = user_id);

-- 3) conversation_messages (local-first: raw text stored on-device only)
CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content_hash VARCHAR(128) NOT NULL, -- SHA-256 of message (actual content stored locally)
  session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_user_created
  ON public.conversation_messages(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_user_session_created
  ON public.conversation_messages(user_id, session_id, created_at);

ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own conversation_messages"
  ON public.conversation_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversation_messages"
  ON public.conversation_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversation_messages"
  ON public.conversation_messages FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversation_messages"
  ON public.conversation_messages FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.journal_entries IS 'Phase 6B: journal entry metadata. No raw text — content_hash references local-first storage.';
COMMENT ON TABLE public.check_ins IS 'Phase 6B: check-in metrics (mood, stress, energy, focus). No raw text — note_hash references local storage.';
COMMENT ON TABLE public.conversation_messages IS 'Phase 6B: conversation message metadata. No raw text — content_hash references local-first storage.';
