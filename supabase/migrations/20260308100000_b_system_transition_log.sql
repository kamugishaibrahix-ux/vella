-- System Transition Log: Records phase/priority/enforcement changes.
-- Append-only. No free text. RLS enforced.
-- Reuses existing enums: system_phase, risk_domain, enforcement_mode.

CREATE TABLE IF NOT EXISTS public.system_transition_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_phase public.system_phase NOT NULL,
  new_phase public.system_phase NOT NULL,
  previous_priority_domain public.risk_domain NOT NULL,
  new_priority_domain public.risk_domain NOT NULL,
  previous_enforcement_mode public.enforcement_mode NOT NULL,
  new_enforcement_mode public.enforcement_mode NOT NULL,
  triggered_by_domain public.risk_domain,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_transition_log_user_time
  ON public.system_transition_log (user_id, created_at DESC);

ALTER TABLE public.system_transition_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_transition_log_isolate ON public.system_transition_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
