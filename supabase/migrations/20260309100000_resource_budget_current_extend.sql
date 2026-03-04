-- Extend resource_budget_current with constraint level and confidence fields.
-- Metadata-only. No free text.

CREATE TYPE public.budget_constraint_level AS ENUM ('normal', 'constrained', 'critical');

ALTER TABLE public.resource_budget_current
  ADD COLUMN constraint_level public.budget_constraint_level NOT NULL DEFAULT 'normal',
  ADD COLUMN confidence_score INT NOT NULL DEFAULT 0
    CHECK (confidence_score >= 0 AND confidence_score <= 100),
  ADD COLUMN sample_size INT NOT NULL DEFAULT 0
    CHECK (sample_size >= 0 AND sample_size <= 1000),
  ADD COLUMN data_freshness_hours INT NOT NULL DEFAULT 0
    CHECK (data_freshness_hours >= 0 AND data_freshness_hours <= 720),
  ADD COLUMN is_stale BOOLEAN NOT NULL DEFAULT true;
