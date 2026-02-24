-- Migration: Governance tables (strict ENUM + metadata only)
-- behaviour_events, commitments, abstinence_targets, focus_sessions, governance_state
-- No free-text columns. No description, note, or content fields.

-- ---------------------------------------------------------------------------
-- ENUM types
-- ---------------------------------------------------------------------------

CREATE TYPE public.governance_event_type AS ENUM (
  'commitment_created',
  'commitment_completed',
  'commitment_violation',
  'abstinence_start',
  'abstinence_violation',
  'focus_start',
  'focus_end',
  'scheduler_tick'
);

CREATE TYPE public.governance_commitment_code AS ENUM (
  'no_smoking',
  'no_alcohol',
  'focus_block',
  'habit_daily',
  'custom'
);

CREATE TYPE public.governance_subject_code AS ENUM (
  'smoking',
  'alcohol',
  'focus',
  'habit',
  'other'
);

CREATE TYPE public.governance_abstinence_target_code AS ENUM (
  'smoking',
  'alcohol',
  'focus',
  'habit',
  'other'
);

CREATE TYPE public.governance_focus_outcome AS ENUM (
  'completed',
  'abandoned',
  'skipped',
  'expired'
);

CREATE TYPE public.governance_target_status AS ENUM (
  'active',
  'paused',
  'completed',
  'abandoned'
);

-- ---------------------------------------------------------------------------
-- Tables (order: commitments first so behaviour_events can FK it)
-- ---------------------------------------------------------------------------

-- commitments: user commitments (codes only, no free-text)
CREATE TABLE IF NOT EXISTS public.commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  commitment_code public.governance_commitment_code NOT NULL,
  subject_code public.governance_subject_code,
  target_type VARCHAR(50),
  target_value NUMERIC,
  start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at TIMESTAMPTZ,
  status public.governance_target_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commitments_user_id ON public.commitments(user_id);
CREATE INDEX IF NOT EXISTS idx_commitments_user_status ON public.commitments(user_id, status);

-- abstinence_targets: abstinence targets (codes only)
CREATE TABLE IF NOT EXISTS public.abstinence_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  abstinence_target_code public.governance_abstinence_target_code NOT NULL,
  start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_metric INT,
  status public.governance_target_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abstinence_targets_user_id ON public.abstinence_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_abstinence_targets_user_status ON public.abstinence_targets(user_id, status);

-- focus_sessions: focus session outcomes (metadata only)
CREATE TABLE IF NOT EXISTS public.focus_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_seconds INT NOT NULL CHECK (duration_seconds >= 0),
  outcome_code public.governance_focus_outcome NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_id ON public.focus_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_started ON public.focus_sessions(user_id, started_at DESC);

-- behaviour_events: append-only event log (metadata only)
CREATE TABLE IF NOT EXISTS public.behaviour_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type public.governance_event_type NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  commitment_id UUID REFERENCES public.commitments(id) ON DELETE SET NULL,
  subject_code public.governance_subject_code,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_behaviour_events_user_occurred
  ON public.behaviour_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_behaviour_events_user_event_type
  ON public.behaviour_events(user_id, event_type);

-- governance_state: one row per user, derived state (metadata only)
CREATE TABLE IF NOT EXISTS public.governance_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governance_state_last_computed
  ON public.governance_state(last_computed_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abstinence_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.behaviour_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_state ENABLE ROW LEVEL SECURITY;

-- commitments
CREATE POLICY "Users can select own commitments"
  ON public.commitments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own commitments"
  ON public.commitments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own commitments"
  ON public.commitments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own commitments"
  ON public.commitments FOR DELETE USING (auth.uid() = user_id);

-- abstinence_targets
CREATE POLICY "Users can select own abstinence_targets"
  ON public.abstinence_targets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own abstinence_targets"
  ON public.abstinence_targets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own abstinence_targets"
  ON public.abstinence_targets FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own abstinence_targets"
  ON public.abstinence_targets FOR DELETE USING (auth.uid() = user_id);

-- focus_sessions
CREATE POLICY "Users can select own focus_sessions"
  ON public.focus_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own focus_sessions"
  ON public.focus_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own focus_sessions"
  ON public.focus_sessions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own focus_sessions"
  ON public.focus_sessions FOR DELETE USING (auth.uid() = user_id);

-- behaviour_events
CREATE POLICY "Users can select own behaviour_events"
  ON public.behaviour_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own behaviour_events"
  ON public.behaviour_events FOR INSERT WITH CHECK (auth.uid() = user_id);
-- No UPDATE/DELETE for append-only; add if soft-delete needed later
CREATE POLICY "Users can delete own behaviour_events"
  ON public.behaviour_events FOR DELETE USING (auth.uid() = user_id);

-- governance_state
CREATE POLICY "Users can select own governance_state"
  ON public.governance_state FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own governance_state"
  ON public.governance_state FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own governance_state"
  ON public.governance_state FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own governance_state"
  ON public.governance_state FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.commitments IS 'Governance: user commitments (metadata/codes only, no free-text)';
COMMENT ON TABLE public.abstinence_targets IS 'Governance: abstinence targets (metadata/codes only)';
COMMENT ON TABLE public.focus_sessions IS 'Governance: focus session outcomes (metadata only)';
COMMENT ON TABLE public.behaviour_events IS 'Governance: append-only event log (metadata only)';
COMMENT ON TABLE public.governance_state IS 'Governance: one row per user derived state (metadata only)';
