-- Phase 4: DB-level tier invariant constraints
-- Prevents arbitrary tier strings from ever being stored.
-- This is a fail-closed structural guarantee at the storage layer.

-- subscriptions.plan must be one of the canonical tiers
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_valid;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_valid
  CHECK (plan IN ('free', 'pro', 'elite'));

-- user_metadata.plan may be null (no subscription) but if set, must be canonical
-- Evidence: user_metadata created in 20250101000000_vella_core_admin.sql with plan text
ALTER TABLE public.user_metadata
  DROP CONSTRAINT IF EXISTS user_metadata_plan_valid;

ALTER TABLE public.user_metadata
  ADD CONSTRAINT user_metadata_plan_valid
  CHECK (plan IS NULL OR plan IN ('free', 'pro', 'elite'));
