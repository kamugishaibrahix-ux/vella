-- Extend system_transition_log with constraint level tracking, trigger source,
-- and boolean change flags. Tighten policy to append-only.
-- Metadata-only. No free text.

CREATE TYPE public.transition_trigger_source AS ENUM (
  'session_close', 'scheduler_tick', 'user_action', 'system_recompute'
);

ALTER TABLE public.system_transition_log
  ADD COLUMN previous_constraint_level public.budget_constraint_level NOT NULL DEFAULT 'normal',
  ADD COLUMN new_constraint_level public.budget_constraint_level NOT NULL DEFAULT 'normal',
  ADD COLUMN trigger_source public.transition_trigger_source NOT NULL DEFAULT 'system_recompute',
  ADD COLUMN changed_phase BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN changed_priority BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN changed_enforcement BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN changed_budget BOOLEAN NOT NULL DEFAULT false;

-- Replace FOR ALL policy with append-only (SELECT + INSERT only)
DROP POLICY IF EXISTS system_transition_log_isolate ON public.system_transition_log;
CREATE POLICY stl_select ON public.system_transition_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY stl_insert ON public.system_transition_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);
