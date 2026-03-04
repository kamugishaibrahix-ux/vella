-- LOCAL-FIRST JOURNAL: metadata-only table.
-- No TEXT free-form content columns. Raw journal text stays on-device.

CREATE TYPE journal_processing_mode AS ENUM ('private', 'signals_only');

CREATE TABLE IF NOT EXISTS journal_entries_meta (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  word_count  int NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  local_hash  text NOT NULL CHECK (length(local_hash) = 64),
  processing_mode journal_processing_mode NOT NULL DEFAULT 'private',
  signals     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (pg_column_size(signals) <= 65536),
  is_deleted  boolean NOT NULL DEFAULT false
);

-- RLS: user isolation
ALTER TABLE journal_entries_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own journal meta"
  ON journal_entries_meta
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for user listing
CREATE INDEX idx_journal_meta_user_created
  ON journal_entries_meta (user_id, created_at DESC)
  WHERE is_deleted = false;
