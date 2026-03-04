-- System Status: Unified OS state authority table.
-- Single-row per user. Written exclusively by recomputeProtocol.
-- Metadata-only. No free text. RLS enforced.

CREATE TYPE public.system_phase AS ENUM (
  'stable', 'growth', 'volatile', 'recovery', 'overloaded'
);

CREATE TYPE public.intervention_type AS ENUM (
  'none', 'checkin_prompt', 'focus_redirect', 'recovery_support', 'overload_pause'
);

CREATE TYPE public.enforcement_mode AS ENUM (
  'observe', 'soft', 'strict'
);

CREATE TABLE IF NOT EXISTS public.system_status_current (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  global_stability_score INT NOT NULL DEFAULT 50
    CHECK (global_stability_score >= 0 AND global_stability_score <= 100),
  system_phase public.system_phase NOT NULL DEFAULT 'stable',
  top_priority_domain public.risk_domain NOT NULL DEFAULT 'none',
  urgency_level INT NOT NULL DEFAULT 0
    CHECK (urgency_level >= 0 AND urgency_level <= 100),
  enforcement_mode public.enforcement_mode NOT NULL DEFAULT 'observe',
  stability_trend_7d INT NOT NULL DEFAULT 0
    CHECK (stability_trend_7d >= -100 AND stability_trend_7d <= 100),
  confidence_score INT NOT NULL DEFAULT 0
    CHECK (confidence_score >= 0 AND confidence_score <= 100),
  sample_size INT NOT NULL DEFAULT 0
    CHECK (sample_size >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_status_current ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_status_current_isolate ON public.system_status_current
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
