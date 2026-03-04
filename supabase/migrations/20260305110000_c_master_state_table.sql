-- Master State: Cross-Domain Risk Aggregator
-- Single-row per user aggregating signals from all domain engines.
-- Metadata-only. No free text. RLS enforced.

CREATE TYPE public.risk_domain AS ENUM (
  'health', 'financial', 'cognitive', 'behavioural', 'governance', 'none'
);

CREATE TABLE IF NOT EXISTS public.master_state_current (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  global_stability_score INT NOT NULL DEFAULT 50 CHECK (global_stability_score >= 0 AND global_stability_score <= 100),
  dominant_risk_domain public.risk_domain NOT NULL DEFAULT 'none',
  energy_budget_flag BOOLEAN NOT NULL DEFAULT false,
  overload_flag BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.master_state_current ENABLE ROW LEVEL SECURITY;

CREATE POLICY master_state_current_isolate ON public.master_state_current
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
