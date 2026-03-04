-- inbox_proposals_meta: metadata-only table for OS signal proposals.
-- No free-text columns. All fields are strict enums or IDs.
-- RLS: users can only read/write their own rows.

CREATE TABLE IF NOT EXISTS inbox_proposals_meta (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'proposal_ready'
             CHECK (type IN ('proposal_ready')),
  domain     TEXT NOT NULL
             CHECK (domain IN (
               'self-mastery','addiction-recovery','emotional-intelligence',
               'relationships','performance-focus','identity-purpose',
               'physical-health','financial-discipline'
             )),
  severity   TEXT NOT NULL
             CHECK (severity IN ('low','moderate','high')),
  proposal_id TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending','confirmed','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for user feed queries
CREATE INDEX IF NOT EXISTS idx_inbox_proposals_meta_user_created
  ON inbox_proposals_meta (user_id, created_at DESC);

-- RLS
ALTER TABLE inbox_proposals_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY inbox_proposals_meta_select
  ON inbox_proposals_meta FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY inbox_proposals_meta_insert
  ON inbox_proposals_meta FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY inbox_proposals_meta_update
  ON inbox_proposals_meta FOR UPDATE
  USING (auth.uid() = user_id);
