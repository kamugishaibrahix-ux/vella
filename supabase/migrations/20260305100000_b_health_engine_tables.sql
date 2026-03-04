-- Health Engine: health_metrics + health_state_current
-- Deterministic Physical Health & Energy domain tables.
-- Metadata-only. No free text. RLS enforced.

-- ─── health_metrics: append-only health signal recordings ────────────────────

CREATE TABLE IF NOT EXISTS public.health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sleep_hours NUMERIC(4,2) NOT NULL CHECK (sleep_hours >= 0 AND sleep_hours <= 24),
  sleep_quality INT NOT NULL CHECK (sleep_quality >= 1 AND sleep_quality <= 10),
  exercise_minutes INT NOT NULL CHECK (exercise_minutes >= 0),
  recovery_score INT NOT NULL CHECK (recovery_score >= 0 AND recovery_score <= 100),
  energy_level INT NOT NULL CHECK (energy_level >= 1 AND energy_level <= 10),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_health_metrics_user_recorded
  ON public.health_metrics (user_id, recorded_at DESC);

ALTER TABLE public.health_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY health_metrics_isolate ON public.health_metrics
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── health_state_current: single-row computed state per user ────────────────

CREATE TABLE IF NOT EXISTS public.health_state_current (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  energy_index INT NOT NULL DEFAULT 50 CHECK (energy_index >= 0 AND energy_index <= 100),
  sleep_debt_score INT NOT NULL DEFAULT 0 CHECK (sleep_debt_score >= 0 AND sleep_debt_score <= 100),
  recovery_index INT NOT NULL DEFAULT 50 CHECK (recovery_index >= 0 AND recovery_index <= 100),
  volatility_flag BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.health_state_current ENABLE ROW LEVEL SECURITY;

CREATE POLICY health_state_current_isolate ON public.health_state_current
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
