-- Financial Discipline Engine: financial_entries + financial_state_current
-- Deterministic Financial Discipline domain tables.
-- Metadata-only. No free text. No merchant names. No descriptions. RLS enforced.

-- ─── financial_entries: append-only transaction signals ──────────────────────

CREATE TYPE public.financial_category AS ENUM ('income', 'expense', 'savings');
CREATE TYPE public.financial_behavior_flag AS ENUM ('planned', 'impulse');

CREATE TABLE IF NOT EXISTS public.financial_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  category public.financial_category NOT NULL,
  behavior_flag public.financial_behavior_flag NOT NULL DEFAULT 'planned',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_financial_entries_user_recorded
  ON public.financial_entries (user_id, recorded_at DESC);

ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY financial_entries_isolate ON public.financial_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── financial_state_current: single-row computed state per user ─────────────

CREATE TABLE IF NOT EXISTS public.financial_state_current (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_spending NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_spending >= 0),
  impulse_spend_count INT NOT NULL DEFAULT 0 CHECK (impulse_spend_count >= 0),
  savings_ratio NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (savings_ratio >= 0 AND savings_ratio <= 1),
  financial_stress_index INT NOT NULL DEFAULT 0 CHECK (financial_stress_index >= 0 AND financial_stress_index <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_state_current ENABLE ROW LEVEL SECURITY;

CREATE POLICY financial_state_current_isolate ON public.financial_state_current
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
