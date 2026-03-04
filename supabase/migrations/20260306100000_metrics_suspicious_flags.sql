-- Phase 3: Add suspicious_input flag to all metrics/entry tables.
-- Enables outlier detection without blocking input.
-- No text columns. Boolean only.

ALTER TABLE public.health_metrics
  ADD COLUMN IF NOT EXISTS suspicious_input BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS suspicious_input BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.decisions
  ADD COLUMN IF NOT EXISTS suspicious_input BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.decision_outcomes
  ADD COLUMN IF NOT EXISTS suspicious_input BOOLEAN NOT NULL DEFAULT false;
