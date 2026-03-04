-- Migration: Phase 6A — Durable behavioural state (deterministic engine)
-- One row per user current state; append-only history for snapshots.

CREATE TABLE IF NOT EXISTS public.behavioural_state_current (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.behavioural_state_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version INT NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('daily', 'weekly', 'triggered')),
  state_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_behavioural_state_history_user_created
  ON public.behavioural_state_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_behavioural_state_history_user_type_created
  ON public.behavioural_state_history(user_id, snapshot_type, created_at DESC);

ALTER TABLE public.behavioural_state_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.behavioural_state_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own current state"
  ON public.behavioural_state_current FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own current state"
  ON public.behavioural_state_current FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own current state"
  ON public.behavioural_state_current FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own current state"
  ON public.behavioural_state_current FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can select own history"
  ON public.behavioural_state_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history"
  ON public.behavioural_state_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own history"
  ON public.behavioural_state_history FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.behavioural_state_current IS 'Single row per user: current deterministic behavioural state (traits, progress, themes, loops, etc.)';
COMMENT ON TABLE public.behavioural_state_history IS 'Append-only snapshots by type (daily, weekly, triggered) for versioned state history';
