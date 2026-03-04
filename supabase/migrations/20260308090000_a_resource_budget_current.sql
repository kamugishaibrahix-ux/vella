-- Resource Budget: Persisted daily resource allocations.
-- Single-row per user. Written exclusively by recomputeProtocol.
-- Metadata-only. No free text. RLS enforced.

CREATE TABLE IF NOT EXISTS public.resource_budget_current (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  max_focus_minutes_today INT NOT NULL DEFAULT 180
    CHECK (max_focus_minutes_today >= 0 AND max_focus_minutes_today <= 360),
  max_decision_complexity INT NOT NULL DEFAULT 10
    CHECK (max_decision_complexity >= 1 AND max_decision_complexity <= 10),
  spending_tolerance_band NUMERIC(10, 2) NOT NULL DEFAULT 100.00
    CHECK (spending_tolerance_band >= 0),
  recovery_required_hours INT NOT NULL DEFAULT 0
    CHECK (recovery_required_hours >= 0 AND recovery_required_hours <= 12),
  budget_confidence INT NOT NULL DEFAULT 0
    CHECK (budget_confidence >= 0 AND budget_confidence <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.resource_budget_current ENABLE ROW LEVEL SECURITY;

CREATE POLICY resource_budget_current_isolate ON public.resource_budget_current
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
