# CHANGELOG — Migration stream fix (2026-02-28)

## Summary

Makes production migrations executable and safe by fixing inverted dependencies and missing tables. No new dependencies. No app logic changes except schema-related fixes. Minimal, explicit changes.

---

## 1. Token ledger migration ordering

**Problem:** Lexicographic order ran `20260228_atomic_token_deduct.sql` before `20260228_token_usage_idempotency.sql`, so the atomic function referenced columns that did not exist yet.

**Change:** Renamed three migrations with sortable numeric prefixes so they run in dependency order:

| Old filename | New filename |
|--------------|--------------|
| `supabase/migrations/20260228_token_usage_idempotency.sql` | `supabase/migrations/20260228_0001_token_usage_idempotency.sql` |
| `supabase/migrations/20260228_atomic_token_deduct.sql` | `supabase/migrations/20260228_0002_atomic_token_deduct.sql` |
| `supabase/migrations/20260228_token_ledger_write_firewall.sql` | `supabase/migrations/20260228_0003_token_ledger_write_firewall.sql` |

**References updated:**
- `PRODUCTION_MIGRATION_FORENSIC_AUDIT.md` — execution order table and isolation/ordering sections
- `ATOMIC_TOKEN_ENFORCEMENT_AUDIT_REPORT.md` — evidence paths (filename only; line numbers unchanged)

---

## 2. Stripe webhook hardening dependency

**Problem:** `supabase/migrations/20260244_stripe_webhook_idempotency_hardening.sql` references `public.webhook_events`, which was only created in `MOBILE/supabase/migrations/20260210_webhook_events.sql` (not in the active root stream).

**Change:** Copied webhook_events creation into the root migration stream with a filename that sorts before 20260244:

- **Added:** `supabase/migrations/20260210_webhook_events.sql` (same content as MOBILE version: `CREATE TABLE IF NOT EXISTS public.webhook_events`, indexes, RLS, policy, comments)

`MOBILE/supabase/migrations/20260210_webhook_events.sql` is unchanged (no move; root gets a copy so the single-project CLI stream is self-contained).

---

## 3. Destructive DROP COLUMN migration quarantined

**Problem:** `MOBILE/supabase/migrations/20260229_phase_m4_5_drop_legacy_content.sql` performs irreversible DROP COLUMN on text columns. It must run only after purge audit confirms `rows_with_text = 0` for all users.

**Change:**
- **Moved:** `MOBILE/supabase/migrations/20260229_phase_m4_5_drop_legacy_content.sql` → `supabase/runbook-sql/20260229_phase_m4_5_drop_legacy_content.sql`
- **Added** at top of runbook file: header comment  
  `DESTRUCTIVE — RUN ONLY AFTER purge audit confirms rows_with_text = 0`  
  plus runbook-style WHY/WHEN/PRECONDITIONS/ROLLBACK.

File content (DROP COLUMN + updated `run_phase_m4_purge`, `run_phase_m4_audit_user`, `run_phase_m1_audit`) unchanged; execution is manual only.

---

## 4. Broken table reference in tier constraints

**Problem:** `MOBILE/supabase/migrations/20260233_tier_invariant_constraints.sql` referenced `ALTER TABLE users` and `users_plan_valid`, but no `public.users` table exists (only `profiles` and `user_metadata`).

**Change:** Corrected to the real table that holds a plan field:
- **Evidence:** `supabase/migrations/20250101000000_vella_core_admin.sql` creates `public.user_metadata` with `plan text`.
- **Edit:** In `MOBILE/supabase/migrations/20260233_tier_invariant_constraints.sql`:
  - Replaced `ALTER TABLE users` / `users_plan_valid` with `ALTER TABLE public.user_metadata` / `user_metadata_plan_valid` and the same CHECK (`plan IS NULL OR plan IN ('free', 'pro', 'elite')`).
  - Replaced unqualified `ALTER TABLE subscriptions` with `ALTER TABLE public.subscriptions` for consistency.

No new table created. No behaviour change beyond applying the constraint to the correct table.

---

## 5. Verification script

**Added:** `MOBILE/scripts/verify-migration-stream-safe.mjs`

- Reads `supabase/migrations/` filenames in sorted order.
- Asserts `token_usage_idempotency` (0001) comes before `atomic_token_deduct` (0002).
- Asserts `atomic_token_deduct` (0002) comes before `token_ledger_write_firewall` (0003).
- Asserts a migration containing `webhook_events` exists and runs before `20260244_stripe_webhook_idempotency_hardening`.
- Asserts no migration file in `supabase/migrations` contains `DROP COLUMN` (excluding comments).
- Exit 0 on PASS, 1 on FAIL. No external services.

**Run:** `node MOBILE/scripts/verify-migration-stream-safe.mjs` (from repo root or MOBILE). Verified: script exits 0 with current stream.

---

## File list (modified / added / moved / removed)

| Path | Action |
|------|--------|
| `supabase/migrations/20260228_0001_token_usage_idempotency.sql` | Added (content from old token_usage_idempotency) |
| `supabase/migrations/20260228_0002_atomic_token_deduct.sql` | Added (content from old atomic_token_deduct) |
| `supabase/migrations/20260228_0003_token_ledger_write_firewall.sql` | Added (content from old token_ledger_write_firewall) |
| `supabase/migrations/20260228_token_usage_idempotency.sql` | Removed |
| `supabase/migrations/20260228_atomic_token_deduct.sql` | Removed |
| `supabase/migrations/20260228_token_ledger_write_firewall.sql` | Removed |
| `supabase/migrations/20260210_webhook_events.sql` | Added (copy of MOBILE version) |
| `supabase/runbook-sql/20260229_phase_m4_5_drop_legacy_content.sql` | Added (from MOBILE migrations + header comment) |
| `MOBILE/supabase/migrations/20260229_phase_m4_5_drop_legacy_content.sql` | Removed |
| `MOBILE/supabase/migrations/20260233_tier_invariant_constraints.sql` | Modified (users → user_metadata, public. prefix) |
| `MOBILE/scripts/verify-migration-stream-safe.mjs` | Added |
| `PRODUCTION_MIGRATION_FORENSIC_AUDIT.md` | Modified (filenames and ordering text) |
| `ATOMIC_TOKEN_ENFORCEMENT_AUDIT_REPORT.md` | Modified (evidence paths: 20260228_0002_atomic_token_deduct.sql) |

---

**End of changelog.**
