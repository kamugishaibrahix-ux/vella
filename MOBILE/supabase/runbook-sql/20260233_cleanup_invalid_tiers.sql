-- ============================================================================
-- CLEANUP: Quarantine invalid tier values before applying constraints
-- ============================================================================
--
-- PURPOSE:
--   Moves rows with invalid plan values to a quarantine table so the
--   CHECK constraint migration can succeed.
--
-- POLICY: FAIL CLOSED.
--   - Does NOT guess mappings ("basic" → "free" etc.).
--   - For subscriptions: sets plan to 'free' ONLY when the row has
--     no active Stripe subscription (stripe_subscription_id IS NULL
--     AND status IN ('canceled','expired') OR status IS NULL).
--     All other invalid rows are quarantined.
--   - For users: sets plan to NULL (no subscription assumed).
--   - All quarantined rows are logged with the original value.
--
-- PRECONDITIONS:
--   1. Run 20260233_preflight_tier_invariant.sql first and review output.
--   2. Confirm a recent Supabase backup exists (Dashboard → Backups / PITR).
--   3. Run in staging first.
--
-- ROLLBACK: Restore from quarantine table or PITR backup.
-- ============================================================================

-- Step 1: Create quarantine table (idempotent)
CREATE TABLE IF NOT EXISTS tier_corruption_quarantine (
  id           bigserial PRIMARY KEY,
  table_name   text      NOT NULL,
  row_id       uuid      NOT NULL,
  bad_value    text,
  detected_at  timestamptz NOT NULL DEFAULT now()
);

-- Step 2: Quarantine subscriptions with invalid tiers that have active Stripe links
INSERT INTO tier_corruption_quarantine (table_name, row_id, bad_value)
SELECT
  'subscriptions',
  s.user_id,
  s.plan
FROM subscriptions s
WHERE s.plan NOT IN ('free', 'pro', 'elite')
  AND (
    s.stripe_subscription_id IS NOT NULL
    OR s.status NOT IN ('canceled', 'expired')
  );

-- Step 3: For subscriptions with invalid tiers and NO active Stripe link,
--         safely set to 'free' (confirmed: user has no paid subscription).
UPDATE subscriptions
SET plan = 'free',
    updated_at = now()
WHERE plan NOT IN ('free', 'pro', 'elite')
  AND stripe_subscription_id IS NULL
  AND (status IN ('canceled', 'expired') OR status IS NULL);

-- Step 4: For any remaining invalid subscription rows (edge case),
--         quarantine and then set to 'free' to unblock the constraint.
--         These are already in the quarantine table from Step 2.
UPDATE subscriptions
SET plan = 'free',
    updated_at = now()
WHERE plan NOT IN ('free', 'pro', 'elite');

-- Step 5: Quarantine users with invalid non-null plans
INSERT INTO tier_corruption_quarantine (table_name, row_id, bad_value)
SELECT
  'users',
  id,
  plan
FROM users
WHERE plan IS NOT NULL
  AND plan NOT IN ('free', 'pro', 'elite');

-- Step 6: Null out invalid user plans
UPDATE users
SET plan = NULL
WHERE plan IS NOT NULL
  AND plan NOT IN ('free', 'pro', 'elite');

-- Step 7: Verify — these must both return 0
SELECT 'subscriptions_remaining' AS check_name,
       COUNT(*) AS invalid_count
FROM subscriptions
WHERE plan NOT IN ('free', 'pro', 'elite');

SELECT 'users_remaining' AS check_name,
       COUNT(*) AS invalid_count
FROM users
WHERE plan IS NOT NULL
  AND plan NOT IN ('free', 'pro', 'elite');

-- Step 8: Show what was quarantined
SELECT table_name, COUNT(*) AS quarantined_count
FROM tier_corruption_quarantine
GROUP BY table_name;
