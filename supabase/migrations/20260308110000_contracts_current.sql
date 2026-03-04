-- Contracts Current: Active contract instances.
-- Metadata-only. No free text. RLS enforced.

CREATE TABLE IF NOT EXISTS public.contracts_current (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('system', 'user')),
  enforcement_mode TEXT NOT NULL CHECK (enforcement_mode IN ('observe', 'soft', 'strict')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'moderate', 'high')),
  duration_days INT NOT NULL CHECK (duration_days BETWEEN 3 AND 7),
  budget_weight INT NOT NULL CHECK (budget_weight BETWEEN 1 AND 5),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.contracts_current ENABLE ROW LEVEL SECURITY;

CREATE POLICY contracts_current_user_isolation ON public.contracts_current
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
