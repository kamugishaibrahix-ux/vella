# Migration Policy

This document defines how to write and apply Supabase migrations so that rollback and recovery remain possible and production stays safe.

**Scope:** `supabase/migrations/**/*.sql` and `MOBILE/supabase/migrations/**/*.sql`.

---

## Backwards-compatible migration rules

### Allowed

- **CREATE TABLE IF NOT EXISTS** — Add new tables.
- **CREATE INDEX IF NOT EXISTS** — Add new indexes (prefer CONCURRENTLY in production if supported).
- **ALTER TABLE ... ADD COLUMN** with nullable or with a **DEFAULT** — New columns that do not require backfill in the same transaction.
- **CREATE TYPE** / **ADD enum value** (see [Enum changes](#enum-changes)) — When done in the prescribed order.
- **CREATE POLICY** / **DROP POLICY ... IF EXISTS** then **CREATE POLICY** — Adding or replacing RLS policies (see [RLS policy changes](#rls-policy-changes)).
- **CREATE OR REPLACE FUNCTION** — Add or update functions.
- **COMMENT ON** — Metadata only.
- **Idempotent blocks** — `do $$ ... if not exists ... end $$` for conditional DDL.

### Forbidden (CI will fail)

- **DROP TABLE**
- **DROP COLUMN** / **ALTER TABLE ... DROP COLUMN**
- **TRUNCATE**
- **ALTER TABLE ... DROP** (e.g. DROP CONSTRAINT only when it’s part of a safe, documented flow — CI blocks generic ALTER TABLE ... DROP).
- **DELETE FROM** without a **WHERE** clause (whole-table delete).
- **UPDATE** without a **WHERE** clause (whole-table update).

These are enforced by **scripts/check-migrations-safe.mjs** in CI. If you need a destructive change, use the [multi-step deprecation process](#multi-step-deprecation-process-for-destructive-changes) below.

---

## Multi-step deprecation process for destructive changes

When you must drop a table, column, or data:

1. **Step 1 (deploy A):** Application code stops reading/writing the table or column (feature flag or release). Deploy and verify in production.
2. **Step 2 (migration):** Add a migration that performs the destructive change (e.g. DROP COLUMN). This migration will **fail CI** by design; use an **allowlisted** exception only after review (see script docs) or perform the change via a one-off, documented run outside the normal migration folder until the script supports allowlisting.
3. **Alternative:** Move the destructive change to a **separate, manually run** SQL script (e.g. in `docs/ops/` or a runbook), **not** in `supabase/migrations` or `MOBILE/supabase/migrations`, so CI continues to block destructive statements in tracked migrations. Document the script and run order in this policy.

**Rule of thumb:** Destructive DDL only after the app no longer depends on the target object.

---

## Runbook SQL

Destructive DDL **must never** live in `migrations/`. It must live in **runbook-sql/**:

- **supabase/runbook-sql/** — for root Supabase project
- **MOBILE/supabase/runbook-sql/** — for MOBILE Supabase project

Scripts in these folders are **not** applied by the migration runner. They are executed manually following the flow below.

**Manual execution flow:**

1. **Staging rehearsal** — Run the script against a staging (or local) Supabase instance. Confirm schema and, if applicable, data look correct.
2. **Production backup verify** — In Supabase Dashboard → Backups (or PITR), confirm a recent backup exists and you know how to restore.
3. **Execute** — Run the script in production during an agreed window (downtime or low traffic if the script takes locks).
4. **Post-verify** — Smoke test the app and any dependent jobs; confirm no references to dropped objects.

Each runbook SQL file should have a header comment block at the top describing: WHY it exists, WHEN it is allowed to run, preconditions (backup verified, downtime window, staging rehearsal), rollback method (restore / PITR), and a short confirmation checklist. See existing files in `supabase/runbook-sql/` for the format.

---

## Required staging test procedure before prod

1. **Apply migrations in order** in a **staging** Supabase project (or local Supabase).
2. **Smoke test:** Run the same [Post-rollback validation checklist](./ROLLBACK_RUNBOOK.md#post-rollback-validation-checklist) (auth, billing, webhook, rate limit, critical path).
3. **Schema check:** Confirm expected tables, columns, and RLS policies (e.g. `supabase db diff` or manual inspection).
4. **Only then** apply the same migrations to production (same order, no skipping). Prefer applying during low traffic or a maintenance window if the migration is long-running.

---

## Enum changes

- **Adding a new enum value:** Generally safe. Add the value at the **end** to avoid rewriting existing rows. Some engines require a separate migration or a specific syntax (e.g. PostgreSQL `ALTER TYPE ... ADD VALUE` can be run in a separate transaction). Test in staging.
- **Removing or reordering enum values:** Treat as destructive. Stop using the value in application code first, then in a later migration (or manual script) alter the type or column. Prefer deprecation (stop writing the value) before any DDL that might break existing rows.

---

## RLS policy changes

- **Adding a policy:** Use **CREATE POLICY** with a distinct name. Safe.
- **Changing a policy:** Use **DROP POLICY IF EXISTS** then **CREATE POLICY** in the same migration so the new behavior is atomic. Test in staging to avoid lock contention or brief open access.
- **Removing a policy:** **DROP POLICY** is allowed by the current CI rules (no “DROP POLICY” in the block list). If we add it later, use the same pattern: deploy code that does not rely on the policy, then drop in a follow-up migration.
- **Verifying:** After applying, run `SELECT * FROM pg_policies WHERE tablename = 'your_table';` in staging and prod to confirm.

---

## Verifying migration runtime and locking risk

- **Long-running migrations:** Prefer **CREATE INDEX CONCURRENTLY** for large tables (run outside a transaction block in PostgreSQL). Avoid long-running **ALTER TABLE** in a single transaction during peak traffic.
- **Locking:** Check Supabase/PostgreSQL docs for lock levels of each statement (e.g. ADD COLUMN with DEFAULT may rewrite the table). Test on a copy of production data or staging with similar size.
- **Runtime:** Run the migration in staging and measure duration. If it exceeds a few seconds, schedule production run during low traffic and document in the runbook.
- **Rollback:** For additive migrations, “rollback” is usually to deploy an older application version that does not use the new object. For destructive changes, rollback is only via [Supabase restore](./ROLLBACK_RUNBOOK.md#c-supabase-restore-procedure-pitr-backup-restore). See [ROLLBACK_RUNBOOK.md](./ROLLBACK_RUNBOOK.md).

---

## Tier invariant constraints rollout

Migration `20260233_tier_invariant_constraints.sql` adds CHECK constraints to `subscriptions.plan` and `users.plan` restricting values to `('free', 'pro', 'elite')`. This will **fail** if existing rows contain invalid plan values.

**Rollout procedure:**

1. **Step 1 — Preflight.** Run `MOBILE/supabase/runbook-sql/20260233_preflight_tier_invariant.sql` against the target environment. Review the counts and sample rows. If both counts are 0, skip to Step 3.

2. **Step 2 — Cleanup.** If any invalid rows were found, run `MOBILE/supabase/runbook-sql/20260233_cleanup_invalid_tiers.sql`. This quarantines rows with active Stripe links into `tier_corruption_quarantine` and sets orphaned rows to `'free'` or `NULL`. Verify the final counts are 0.

3. **Step 3 — Apply constraint.** Apply migration `MOBILE/supabase/migrations/20260233_tier_invariant_constraints.sql` via the normal migration runner (`supabase db push` or equivalent).

4. **Step 4 — Confirm.** Re-run the preflight SQL. Both counts must be 0. Confirm the constraints exist:
   ```sql
   SELECT conname, consrc FROM pg_constraint
   WHERE conname IN ('subscriptions_plan_valid', 'users_plan_valid');
   ```

**Important:** This migration must NOT be applied until the admin dashboard and all hardening changes are deployed. The application code must be updated before the database constraint, since the constraint will reject any writes with invalid tier values.

**Rollback:** Drop the constraints:
```sql
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_valid;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_valid;
```
Quarantined data remains in `tier_corruption_quarantine` for investigation.

---

## Related

- [ROLLBACK_RUNBOOK.md](./ROLLBACK_RUNBOOK.md) — When and how to roll back code and data.
- **scripts/check-migrations-safe.mjs** — CI script that fails the build on forbidden destructive statements.
