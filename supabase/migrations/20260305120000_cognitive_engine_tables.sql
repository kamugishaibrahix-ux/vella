-- Cognitive Performance Engine: decisions, decision_outcomes, cognitive_state_current
-- Deterministic Cognitive Performance domain tables.
-- Metadata-only. No free-text decision descriptions. RLS enforced.

-- ─── decision_type enum ─────────────────────────────────────────────────────

CREATE TYPE public.decision_type AS ENUM (
  'career', 'financial', 'relationship', 'health',
  'lifestyle', 'commitment', 'priority', 'other'
);

-- ─── decisions: append-only decision signal recordings ──────────────────────

CREATE TABLE IF NOT EXISTS public.decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_type public.decision_type NOT NULL,
  confidence_score INT NOT NULL CHECK (confidence_score >= 1 AND confidence_score <= 10),
  emotional_intensity INT NOT NULL CHECK (emotional_intensity >= 1 AND emotional_intensity <= 10),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_decisions_user_recorded
  ON public.decisions (user_id, recorded_at DESC);

ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY decisions_isolate ON public.decisions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── decision_outcomes: linked outcome reviews ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.decision_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outcome_rating INT NOT NULL CHECK (outcome_rating >= 1 AND outcome_rating <= 10),
  regret_score INT NOT NULL CHECK (regret_score >= 1 AND regret_score <= 10),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_decision_outcomes_decision
  ON public.decision_outcomes (decision_id);

CREATE INDEX idx_decision_outcomes_user_reviewed
  ON public.decision_outcomes (user_id, reviewed_at DESC);

ALTER TABLE public.decision_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY decision_outcomes_isolate ON public.decision_outcomes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── cognitive_state_current: single-row computed state per user ─────────────

CREATE TABLE IF NOT EXISTS public.cognitive_state_current (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  avg_confidence NUMERIC(4,2) NOT NULL DEFAULT 5 CHECK (avg_confidence >= 0 AND avg_confidence <= 10),
  regret_index INT NOT NULL DEFAULT 0 CHECK (regret_index >= 0 AND regret_index <= 100),
  bias_frequency_score INT NOT NULL DEFAULT 0 CHECK (bias_frequency_score >= 0 AND bias_frequency_score <= 100),
  decision_volatility INT NOT NULL DEFAULT 0 CHECK (decision_volatility >= 0 AND decision_volatility <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cognitive_state_current ENABLE ROW LEVEL SECURITY;

CREATE POLICY cognitive_state_current_isolate ON public.cognitive_state_current
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
