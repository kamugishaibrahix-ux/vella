-- Phase 1: Add confidence, sample_size, freshness, staleness to all state_current tables.
-- Enables input-sufficiency checks and enforcement-readiness.
-- No text columns. Backfill with safe defaults.

-- ─── health_state_current ────────────────────────────────────────────────────

ALTER TABLE public.health_state_current
  ADD COLUMN IF NOT EXISTS confidence_score INT NOT NULL DEFAULT 0
    CHECK (confidence_score >= 0 AND confidence_score <= 100),
  ADD COLUMN IF NOT EXISTS sample_size INT NOT NULL DEFAULT 0
    CHECK (sample_size >= 0),
  ADD COLUMN IF NOT EXISTS data_freshness_hours INT NOT NULL DEFAULT 999
    CHECK (data_freshness_hours >= 0),
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT true;

-- ─── financial_state_current ─────────────────────────────────────────────────

ALTER TABLE public.financial_state_current
  ADD COLUMN IF NOT EXISTS confidence_score INT NOT NULL DEFAULT 0
    CHECK (confidence_score >= 0 AND confidence_score <= 100),
  ADD COLUMN IF NOT EXISTS sample_size INT NOT NULL DEFAULT 0
    CHECK (sample_size >= 0),
  ADD COLUMN IF NOT EXISTS data_freshness_hours INT NOT NULL DEFAULT 999
    CHECK (data_freshness_hours >= 0),
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT true;

-- ─── cognitive_state_current ─────────────────────────────────────────────────

ALTER TABLE public.cognitive_state_current
  ADD COLUMN IF NOT EXISTS confidence_score INT NOT NULL DEFAULT 0
    CHECK (confidence_score >= 0 AND confidence_score <= 100),
  ADD COLUMN IF NOT EXISTS sample_size INT NOT NULL DEFAULT 0
    CHECK (sample_size >= 0),
  ADD COLUMN IF NOT EXISTS data_freshness_hours INT NOT NULL DEFAULT 999
    CHECK (data_freshness_hours >= 0),
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT true;

-- ─── master_state_current ────────────────────────────────────────────────────

ALTER TABLE public.master_state_current
  ADD COLUMN IF NOT EXISTS confidence_score INT NOT NULL DEFAULT 0
    CHECK (confidence_score >= 0 AND confidence_score <= 100),
  ADD COLUMN IF NOT EXISTS sample_size INT NOT NULL DEFAULT 0
    CHECK (sample_size >= 0),
  ADD COLUMN IF NOT EXISTS data_freshness_hours INT NOT NULL DEFAULT 999
    CHECK (data_freshness_hours >= 0),
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT true;
