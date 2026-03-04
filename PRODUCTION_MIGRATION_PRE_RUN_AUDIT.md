# PRODUCTION MIGRATION PRE-RUN AUDIT

**Date:** 2026-02-28  
**Scope:** Active migration stream (config.toml), execution order, dependency check, app schema requirements, destructive ops, partial failure, GO/NO-GO.  
**Rules:** Read-only. Evidence only (file + line + commands). Supabase CLI applies migrations in lexicographic order from active config only.

---

## 1) EXECUTION REALITY

### 1.1 Active migrations directory

**Evidence:** `supabase/config.toml` (full file):

```1:14:c:\dev\supabase\config.toml
# ========================================
# Valid Supabase CLI config (clean reset)
# ========================================

[db]
port = 54322

[api]
port = 54321

[studio]
port = 54323
```

**Finding:** No `[db]` `migration_path` or `schema_paths` key. Supabase CLI default: migrations are read from **`supabase/migrations/`** relative to the project root (directory containing `config.toml`). Project root = `c:\dev`.

**Conclusion:** **Active migration stream = `c:\dev\supabase\migrations/` only.**

### 1.2 Exact sorted execution list (supabase/migrations)

**Command run:**  
`Get-ChildItem -Path "c:\dev\supabase\migrations" -Filter "*.sql" | Sort-Object Name | ForEach-Object { $_.Name }`

**Output (lexicographic order = execution order):**

```
20241117_add_core_tables.sql
20250101_drop_sensitive_tables.sql
20250101000000_vella_core_admin.sql
20250217_token_engine.sql
20250218_add_adaptive_traits.sql
20250219_add_nudge_history.sql
20250220_add_feature_tables.sql
20250221_add_progress_features.sql
20250222_add_last_active_at.sql
20251129154622_create_admin_global_config.sql
20251221120000_admin_c_mod_tools.sql
20260210_webhook_events.sql
20260227_admin_config_size_constraints.sql
20260227_root_harden_cache_tables.sql
20260227_root_rls_progress_connection.sql
20260227_root_rls_user_prefs_vella_settings.sql
20260227_root_rls_user_reports_promo_codes.sql
20260228_0001_token_usage_idempotency.sql
20260228_0002_atomic_token_deduct.sql
20260228_0003_token_ledger_write_firewall.sql
20260228_jsonb_forbidden_keys_guard.sql
20260243_token_performance_indexes.sql
20260244_stripe_webhook_idempotency_hardening.sql
```

**24 migrations** will execute in this order.

### 1.3 MOBILE/supabase/migrations not executed

**Evidence:** No `config.toml` under `MOBILE/` (glob `**/supabase/config.toml` under MOBILE → 0 files). Single project uses root `c:\dev\supabase\config.toml`. CLI does not reference `MOBILE/supabase/migrations`.

**Conclusion:** **`MOBILE/supabase/migrations/` is NOT executed** unless a separate process or custom script applies it. For `supabase db push` or `supabase migration up`, only the 24 files above run.

---

## 2) DEPENDENCY CHECK (HARD)

Per-migration: (a) creates, (b) alters, (c) assumes exist. Fail if any migration references an object not created earlier in the same stream.

| # | Migration | Creates | Alters | Assumes exist | Safe in order? |
|---|-----------|---------|--------|----------------|----------------|
| 1 | 20241117_add_core_tables.sql | profiles, subscription_plan enum, subscriptions, token_topups, token_usage, conversation_sessions | — | pgcrypto, auth.users | Yes |
| 2 | 20250101_drop_sensitive_tables.sql | — | — | — | Yes (no-op placeholder) |
| 3 | 20250101000000_vella_core_admin.sql | admin_ai_config, user_metadata, system_logs, admin_activity_log, feedback, token_ledger, analytics_counters, is_admin_user() | admin_global_config (add column if exists) | admin_global_config optional; auth.users; profiles | Yes (alter guarded by IF EXISTS) |
| 4 | 20250217_token_engine.sql | token_rates, user_preferences, vella_settings, reset_monthly_tokens() | subscriptions, profiles | subscriptions, profiles | Yes |
| 5 | 20250218_add_adaptive_traits.sql | user_traits, user_traits_history | — | auth.users | Yes |
| 6 | 20250219_add_nudge_history.sql | user_nudges | user_nudges (RLS) | auth.users | Yes |
| 7 | 20250220_add_feature_tables.sql | micro_rag_cache, progress_metrics, social_models, vella_personality | progress_metrics (add columns) | auth.users | Yes |
| 8 | 20250221_add_progress_features.sql | connection_depth, progress_metrics (IF NOT EXISTS) | profiles, progress_metrics | auth.users | Yes |
| 9 | 20250222_add_last_active_at.sql | — | profiles | profiles | Yes |
| 10 | 20251129154622_create_admin_global_config.sql | admin_global_config | — | — | Yes |
| 11 | 20251221120000_admin_c_mod_tools.sql | user_reports, promo_codes | user_metadata | user_metadata | Yes |
| 12 | 20260210_webhook_events.sql | webhook_events | — | — | Yes |
| 13 | 20260227_admin_config_size_constraints.sql | — | admin_ai_config, admin_activity_log, system_logs, user_metadata | All these tables | Yes |
| 14 | 20260227_root_harden_cache_tables.sql | — | micro_rag_cache, social_models, vella_personality | All | Yes |
| 15 | 20260227_root_rls_progress_connection.sql | — | progress_metrics, connection_depth | Both | Yes |
| 16 | 20260227_root_rls_user_prefs_vella_settings.sql | — | user_preferences, vella_settings | Both | Yes |
| 17 | 20260227_root_rls_user_reports_promo_codes.sql | — | user_reports, promo_codes | Both | Yes |
| 18 | 20260228_0001_token_usage_idempotency.sql | request_id, kind, constraints, token_usage_idempotency_unique, indexes | token_usage | token_usage | Yes |
| 19 | 20260228_0002_atomic_token_deduct.sql | atomic_token_deduct(), atomic_token_refund(), indexes | — | token_usage (with request_id, kind), token_topups | Yes |
| 20 | 20260228_0003_token_ledger_write_firewall.sql | — | token_usage, token_topups (RLS, FORCE RLS, REVOKE, policies) | token_usage, token_topups | Yes |
| 21 | 20260228_jsonb_forbidden_keys_guard.sql | get_forbidden_content_keys(), jsonb_has_forbidden_keys() | — | — | Yes (functions only; no table ALTERs) |
| 22 | 20260243_token_performance_indexes.sql | indexes | — | token_usage, token_topups | Yes |
| 23 | 20260244_stripe_webhook_idempotency_hardening.sql | atomic_stripe_webhook_process(), atomic_stripe_event_record(), index | webhook_events, token_topups | webhook_events, token_topups | Yes (webhook_events at #12) |

**Note:** 20260228_jsonb_forbidden_keys_guard.sql was restored to contain only the two functions (no ALTER on tables), so it does not reference any MOBILE-only tables and is safe in the root-only stream.

---

## 3) APP SCHEMA REQUIREMENTS CHECK (MOST IMPORTANT)

### 3.1 Required tables and RPCs (evidence)

**MOBILE server/runtime code:**

| Object | Type | Reference (file:line) | In root migrations? |
|--------|------|------------------------|---------------------|
| admin_user_flags | table | MOBILE/lib/auth/requireActiveUser.ts:60 | **No** — created only in MOBILE/supabase/migrations/20260230_admin_user_flags.sql |
| subscriptions | table | MOBILE/lib/auth/requireActiveUser.ts:65 | Yes (20241117) |
| admin_ai_config | table | MOBILE/lib/admin/adminConfig.ts:191, 218 | Yes (20250101000000) |
| webhook_events | table | MOBILE/test refs; Stripe webhook uses RPCs that write to it | Yes (20260210) |
| atomic_token_deduct | RPC | MOBILE/lib/tokens/enforceTokenLimits.ts:179 | Yes (20260228_0002) |
| atomic_token_refund | RPC | MOBILE/lib/tokens/enforceTokenLimits.ts:234 | Yes (20260228_0002) |
| atomic_stripe_webhook_process | RPC | MOBILE/app/api/stripe/webhook/route.ts:490 | Yes (20260244) |
| atomic_stripe_event_record | RPC | MOBILE/app/api/stripe/webhook/route.ts:529 | Yes (20260244) |
| run_phase_m4_purge | RPC | MOBILE/app/api/internal/migration/purge/route.ts:72 | **No** — created in MOBILE/supabase/migrations/20260227_phase_m4_purge.sql |
| run_phase_m1_audit | RPC | MOBILE/app/api/internal/migration/audit/route.ts:54 | **No** — created in MOBILE/supabase/migrations/20260223_phase_m1_audit.sql |
| execute_verification_query | RPC | MOBILE/lib/security/systemSeal.ts:348, 376, 384, 392, 400, 412 | Not found in root migrations (MOBILE-only or runbook) |

**apps/vella-control:** All referenced tables (subscriptions, user_metadata, admin_activity_log, user_reports, token_usage, feedback, system_logs, admin_ai_config, promo_codes, analytics_counters) are created in root migrations. No vella-control-only blockers.

### 3.2 Blockers for MOBILE app

1. **Table `admin_user_flags`**  
   - **Required by:** `requireActiveUser()` (MOBILE/lib/auth/requireActiveUser.ts:60–62).  
   - **Effect if missing:** Every request that uses `requireActiveUser()` gets `flagsResult.error` (relation does not exist) → 403 ACCOUNT_INACTIVE.  
   - **Created only in:** MOBILE/supabase/migrations/20260230_admin_user_flags.sql.  
   - **Minimal merge:** Copy `MOBILE/supabase/migrations/20260230_admin_user_flags.sql` into `supabase/migrations/` (e.g. `20260230_admin_user_flags.sql`) so it runs in the active stream.

2. **RPC `run_phase_m4_purge`**  
   - **Required by:** POST /api/internal/migration/purge (MOBILE/app/api/internal/migration/purge/route.ts:72).  
   - **Created in:** MOBILE/supabase/migrations/20260227_phase_m4_purge.sql (and runbook variants).  
   - **Blocker only if:** This route is deployed and used in production. If internal migration purge is not yet used, it is a soft dependency; if used, merge 20260227 into root or run MOBILE migrations separately.

3. **RPC `run_phase_m1_audit`**  
   - **Required by:** POST /api/internal/migration/audit (MOBILE/app/api/internal/migration/audit/route.ts:54).  
   - **Created in:** MOBILE/supabase/migrations/20260223_phase_m1_audit_function.sql.  
   - **Blocker only if:** Migration audit cron is used in production; otherwise soft.

4. **Migration file 20260228_jsonb_forbidden_keys_guard.sql**  
   - **Resolved:** File was restored with SQL that creates only `get_forbidden_content_keys()` and `jsonb_has_forbidden_keys()` (no table ALTERs), so the dependency check passes and no MOBILE-only tables are referenced.

### 3.3 Required-object summary

- **Root-only run:** All vella-control and Stripe webhook / token ledger paths are satisfied by root migrations.
- **MOBILE app (auth + token + webhook):** Satisfied by root **only if** `admin_user_flags` is added to root (merge 20260230). Internal migration routes (purge, audit) require MOBILE-only RPCs unless those migrations are merged into root.

---

## 4) DESTRUCTIVE OPERATIONS CHECK

**Grep command:**  
`Select-String -Path "c:\dev\supabase\migrations\*.sql" -Pattern "DROP COLUMN|DROP TABLE|TRUNCATE|DELETE FROM|ALTER TYPE.*DROP VALUE"`

**Result:** No matches in `supabase/migrations/`.

**Evidence (runbook only):**  
- `supabase/runbook-sql/20260229_phase_m4_5_drop_legacy_content.sql` — DROP COLUMN (lines 20–21, 23, 25, 27, 29–30, 34).  
- `supabase/runbook-sql/20251219_drop_legacy_vella_settings_fields.sql` — DROP COLUMN.  
- `supabase/runbook-sql/20250223_remove_checkin_note.sql` — DROP COLUMN.

**Conclusion:** No destructive DDL in the active migration stream. Destructive DROP COLUMN migrations exist only in `supabase/runbook-sql/`. **No blocker from destructive ops** in `supabase/migrations/`.

---

## 5) PARTIAL FAILURE SAFETY

### 5.1 Token ledger order (0001 → 0002 → 0003)

- **0001** adds idempotency columns and constraints to `token_usage`.  
- **0002** creates `atomic_token_deduct` / `atomic_token_refund` (assume 0001 applied).  
- **0003** enables RLS and firewall on `token_usage` / `token_topups`.

**Failure after 0001, before 0002:** Idempotency columns exist; RPCs do not. App calls to `atomic_token_deduct` fail (function does not exist). **Effect:** Token spend broken until 0002 is applied.

**Failure after 0002, before 0003:** RPCs exist; direct table writes still allowed. **Effect:** Auth/token still work; ledger invariant (only RPCs write) not yet enforced until 0003.

**Failure after 0003:** Full enforcement. Safe.

### 5.2 Webhook: webhook_events before 20260244

- **20260210** creates `webhook_events`.  
- **20260244** adds unique constraint and `atomic_stripe_webhook_process` / `atomic_stripe_event_record` (and references `webhook_events`).

**Failure after 20260210, before 20260244:** `webhook_events` exists; idempotency RPCs do not. Webhook route would need to use non-atomic path or fail. **Effect:** Stripe webhook idempotency not guaranteed until 20260244.

**Failure before 20260210:** 20260244 would fail (table webhook_events does not exist). Order in current list is correct (20260210 before 20260244).

### 5.3 Most dangerous mid-stream failure points

1. **After 20260228_0002, before 20260228_0003**  
   - **DB state:** Token RPCs exist; direct INSERT/UPDATE on token_usage/token_topups still allowed.  
   - **Auth/token/webhook:** Auth OK; token deduct/refund work; webhook depends on 20260244. Ledger firewall not yet active.

2. **After 20260210, before 20260244**  
   - **DB state:** webhook_events table exists; atomic webhook RPCs missing.  
   - **Auth/token/webhook:** Auth and token OK; Stripe webhook not hardened (double-credit risk if replay).

3. **At 20260228_jsonb_forbidden_keys_guard.sql**  
   - **DB state:** (After restore) Creates two functions only; no table changes.  
   - **Effect:** No partial-failure risk from this migration.

---

## 6) FINAL VERDICT

### GO / NO-GO

**NO-GO** for running the current `supabase/migrations` stream **if the MOBILE app is deployed and uses `requireActiveUser()`**, because table `admin_user_flags` is missing in the root stream.

**GO** for running the current `supabase/migrations` stream for **vella-control only** or for a MOBILE deployment that does not rely on `requireActiveUser()` or the internal migration purge/audit routes.

### Blockers (must-fix for full MOBILE)

1. **MOBILE app: table `admin_user_flags` missing in root**  
   If MOBILE is deployed and uses `requireActiveUser()`, merge `MOBILE/supabase/migrations/20260230_admin_user_flags.sql` into `supabase/migrations/` (e.g. `20260230_admin_user_flags.sql`).

2. **(Conditional) Internal migration routes**  
   If POST /api/internal/migration/purge or /audit are used in production, merge the RPCs `run_phase_m4_purge` and `run_phase_m1_audit` into the root stream (e.g. copy the corresponding MOBILE migrations into `supabase/migrations/`).

### Safe-to-run subset (if NO-GO and root-only)

- **Safe for vella-control + Stripe webhook + token RPCs:** Run all 24 root migrations as listed in §1.2. No need to skip any file.
- **Safe for MOBILE only if:** Either (1) `admin_user_flags` is merged into root (20260230), or (2) MOBILE does not use `requireActiveUser()` in production.

### Command sequence to run migrations safely (no guesses)

1. **(If MOBILE uses requireActiveUser)** Copy `MOBILE/supabase/migrations/20260230_admin_user_flags.sql` to `supabase/migrations/20260230_admin_user_flags.sql`.
2. **Verify:** Run `node MOBILE/scripts/verify-migration-stream-safe.mjs` from repo root (or from MOBILE); expect exit 0.
3. **Apply migrations (production):**  
   From repo root, linked to production project:  
   `cd c:\dev`  
   `supabase db push`  
   Or, if using migration up:  
   `supabase migration up --linked`  
   (Exact command depends on your Supabase CLI workflow; `db push` applies pending migrations to the linked remote DB.)

**Do not run** any file from `supabase/runbook-sql/` as part of the normal migration flow; runbook scripts are manual and may be destructive.

---

*End of audit. Evidence: file paths and line numbers above; command outputs from §1.2 and §4.*
