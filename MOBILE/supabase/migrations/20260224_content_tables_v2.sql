-- Phase M2: Metadata-only v2 tables. No content/note/message/summary/title columns.
-- Legacy tables remain; no DROP. Server will write only to _v2.

-- ---------------------------------------------------------------------------
-- 1) journal_entries_v2
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  mood_score int,
  word_count int,
  local_hash text,
  is_deleted boolean NOT NULL DEFAULT false
);

ALTER TABLE public.journal_entries_v2 ADD CONSTRAINT journal_entries_v2_local_hash_len CHECK (local_hash IS NULL OR length(local_hash) <= 128);

CREATE INDEX idx_journal_entries_v2_user_created ON public.journal_entries_v2 (user_id, created_at DESC);

ALTER TABLE public.journal_entries_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY journal_entries_v2_isolate ON public.journal_entries_v2
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2) conversation_metadata_v2 (sessions / aggregates only; no message content)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_metadata_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  mode_enum text,
  message_count int NOT NULL DEFAULT 0,
  token_count int NOT NULL DEFAULT 0,
  model_id text
);

CREATE INDEX idx_conversation_metadata_v2_user_started ON public.conversation_metadata_v2 (user_id, started_at DESC);

ALTER TABLE public.conversation_metadata_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_metadata_v2_isolate ON public.conversation_metadata_v2
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3) check_ins_v2
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.check_ins_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  mood_score int,
  stress int,
  energy int,
  focus int,
  type_enum text,
  trigger_enum text,
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_check_ins_v2_user_created ON public.check_ins_v2 (user_id, created_at DESC);

ALTER TABLE public.check_ins_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY check_ins_v2_isolate ON public.check_ins_v2
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4) user_reports_v2 (no summary, no notes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_reports_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  report_type text NOT NULL,
  severity int NOT NULL,
  status text NOT NULL DEFAULT 'open'
);

CREATE INDEX idx_user_reports_v2_user_created ON public.user_reports_v2 (user_id, created_at DESC);

ALTER TABLE public.user_reports_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_reports_v2_isolate ON public.user_reports_v2
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5) memory_chunks_v2 (metadata + content_hash only; no content)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.memory_chunks_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_chunks_v2 ADD CONSTRAINT memory_chunks_v2_content_hash_len CHECK (length(content_hash) <= 128);

CREATE UNIQUE INDEX idx_memory_chunks_v2_unique ON public.memory_chunks_v2 (user_id, source_type, source_id, content_hash);
CREATE INDEX idx_memory_chunks_v2_user_created ON public.memory_chunks_v2 (user_id, created_at DESC);

ALTER TABLE public.memory_chunks_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY memory_chunks_v2_isolate ON public.memory_chunks_v2
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.journal_entries_v2 IS 'Phase M2: metadata only. No title/content.';
COMMENT ON TABLE public.conversation_metadata_v2 IS 'Phase M2: session metadata only. No message content.';
COMMENT ON TABLE public.check_ins_v2 IS 'Phase M2: metadata only. No note.';
COMMENT ON TABLE public.user_reports_v2 IS 'Phase M2: metadata only. No summary/notes.';
COMMENT ON TABLE public.memory_chunks_v2 IS 'Phase M2: metadata + content_hash only. No content.';
