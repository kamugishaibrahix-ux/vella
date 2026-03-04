-- ============================================================================
-- RUN THIS BEFORE APPLYING MIGRATION 20260233_tier_invariant_constraints.sql
-- ============================================================================
--
-- PURPOSE:
--   Reports counts and samples of rows that violate the tier invariant
--   (plan must be one of: 'free', 'pro', 'elite') BEFORE applying
--   CHECK constraints. If any rows are returned, the constraint migration
--   WILL FAIL. Run the cleanup script first.
--
-- SAFE:  Read-only. No mutations. Can be run repeatedly.
-- SCOPE: subscriptions.plan, users.plan
-- ============================================================================

-- 1) Count invalid subscriptions.plan values
SELECT
  'subscriptions' AS table_name,
  COUNT(*)        AS invalid_count
FROM subscriptions
WHERE plan NOT IN ('free', 'pro', 'elite');

-- 2) Sample invalid subscriptions rows (limit 50)
SELECT
  id,
  user_id,
  plan       AS bad_plan_value,
  status,
  created_at
FROM subscriptions
WHERE plan NOT IN ('free', 'pro', 'elite')
ORDER BY created_at DESC
LIMIT 50;

-- 3) Count invalid users.plan values (non-null but not canonical)
SELECT
  'users' AS table_name,
  COUNT(*) AS invalid_count
FROM users
WHERE plan IS NOT NULL
  AND plan NOT IN ('free', 'pro', 'elite');

-- 4) Sample invalid users rows (limit 50)
SELECT
  id,
  plan       AS bad_plan_value,
  created_at
FROM users
WHERE plan IS NOT NULL
  AND plan NOT IN ('free', 'pro', 'elite')
ORDER BY created_at DESC
LIMIT 50;

-- 5) Summary: if both counts are 0, the constraint migration is safe to apply.
SELECT
  CASE
    WHEN (SELECT COUNT(*) FROM subscriptions WHERE plan NOT IN ('free','pro','elite')) = 0
     AND (SELECT COUNT(*) FROM users WHERE plan IS NOT NULL AND plan NOT IN ('free','pro','elite')) = 0
    THEN '✅ SAFE: No invalid tier values found. Constraint migration can proceed.'
    ELSE '❌ BLOCKED: Invalid tier values exist. Run cleanup script first.'
  END AS preflight_result;
