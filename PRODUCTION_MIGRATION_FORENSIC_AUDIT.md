# PRODUCTION MIGRATION FORENSIC AUDIT (DEPLOYMENT BLOCKER)

**Audit date:** 2026-02-28  
**Scope:** Exact migration execution reality, order dependencies, destructive operations, ledger invariants, privilege state, partial failure, migration identity.  
**Verdict:** **BLOCK DEPLOYMENT**

---

## STEP 1 — MIGRATION EXECUTION REALITY CHECK

### 1.1 Exact directory tree

**Command executed:** `Get-ChildItem -Path "c:\dev\supabase\migrations" -File | Sort-Object Name`  
**Command executed:** `Get-ChildItem -Path "c:\dev\MOBILE\supabase\migrations" -File | Sort-Object Name`  
**Command executed:** `Get-ChildItem -Path "c:\dev\supabase\runbook-sql" -File`

**supabase/migrations/** (22 files, lexicographic order):

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
20260227_admin_config_size_constraints.sql
20260227_root_harden_cache_tables.sql
20260227_root_rls_progress_connection.sql
20260227_root_rls_user_prefs_vella_settings.sql
20260227_root_rls_user_reports_promo_codes.sql
20260228_0001_token_usage_idempotency.sql
20260228_0002_atomic_token_deduct.sql
20260228_0003_token_ledger_write_firewall.sql
20260243_token_performance_indexes.sql
20260244_stripe_webhook_idempotency_hardening.sql
```

**MOBILE/supabase/migrations/** (39 files, lexicographic order):

```
20250227_inbox_proposals_meta.sql
20260210_webhook_events.sql
... (37 more through 20260245_phase_seal_trigger_firewall.sql)
```

**supabase/runbook-sql/** (not migrations; manual execution only):

```
20250223_remove_checkin_note.sql
20251219_drop_legacy_vella_settings_fields.sql
20251220_fix_vella_settings.sql
20260227_preflight_cache_tables.sql
20260228_user_hard_delete.sql
README.md
```

### 1.2 Which directory is applied by Supabase CLI?

**Evidence:** Single `supabase/config.toml` at repo root (`c:\dev\supabase\config.toml`). No `config.toml` under `MOBILE/` (Glob **/supabase/config.toml in MOBILE → 0 files).

**Conclusion:** Supabase CLI when run from repo root uses **only** `supabase/migrations/`. The folder `MOBILE/supabase/migrations/` is **not** the active migrations directory for the single project. If both folders are ever applied together, execution order is **ambiguous**.

### 1.3 Real execution sequence (root-only)

Supabase applies migrations in **lexicographic order by filename**. Execution order for **root** `supabase/migrations/`:

| Execution Order | File | Directory | Will Execute? |
|-----------------|------|-----------|---------------|
| 1 | 20241117_add_core_tables.sql | supabase/migrations | YES (if root applied) |
| 2 | 20250101_drop_sensitive_tables.sql | supabase/migrations | YES |
| 3 | 20250101000000_vella_core_admin.sql | supabase/migrations | YES |
| 4 | 20250217_token_engine.sql | supabase/migrations | YES |
| 5 | 20250218_add_adaptive_traits.sql | supabase/migrations | YES |
| 6 | 20250219_add_nudge_history.sql | supabase/migrations | YES |
| 7 | 20250220_add_feature_tables.sql | supabase/migrations | YES |
| 8 | 20250221_add_progress_features.sql | supabase/migrations | YES |
| 9 | 20250222_add_last_active_at.sql | supabase/migrations | YES |
| 10 | 20251129154622_create_admin_global_config.sql | supabase/migrations | YES |
| 11 | 20251221120000_admin_c_mod_tools.sql | supabase/migrations | YES |
| 12 | 20260227_admin_config_size_constraints.sql | supabase/migrations | YES |
| 13 | 20260227_root_harden_cache_tables.sql | supabase/migrations | YES |
| 14 | 20260227_root_rls_progress_connection.sql | supabase/migrations | YES |
| 15 | 20260227_root_rls_user_prefs_vella_settings.sql | supabase/migrations | YES |
| 16 | 20260227_root_rls_user_reports_promo_codes.sql | supabase/migrations | YES |
| 17 | **20260228_0001_token_usage_idempotency.sql** | supabase/migrations | YES |
| 18 | 20260228_jsonb_forbidden_keys_guard.sql | supabase/migrations | YES |
| 19 | **20260228_0002_atomic_token_deduct.sql** | supabase/migrations | YES |
| 20 | **20260228_0003_token_ledger_write_firewall.sql** | supabase/migrations | YES |
| 21 | 20260243_token_performance_indexes.sql | supabase/migrations | YES |
| 22 | 20260244_stripe_webhook_idempotency_hardening.sql | supabase/migrations | YES |

**If both directories merged by path string:** `MOBILE/` < `supabase/` lexicographically, so all 39 MOBILE files run before any root file → MOBILE runs without `profiles`, `token_usage`, `token_topups` → failures. **Ambiguous → BLOCK.**

---

## STEP 2 — ORDER DEPENDENCY VERIFICATION

| Migration | Depends On | Safe In This Order? | Evidence |
|-----------|------------|---------------------|----------|
| 20260228_atomic_token_deduct.sql | Columns `request_id`, `kind` on `token_usage` | **NO** | atomic_token_deduct.sql lines 105–109: `SELECT kind INTO v_existing_kind FROM public.token_usage WHERE user_id = p_user_id AND request_id = p_request_id`. Lines 186–189: `INSERT INTO public.token_usage (user_id, request_id, kind, source, tokens, from_allocation)`. Those columns are created in 20260228_token_usage_idempotency.sql (lines 21–34). Idempotency runs at position 20; atomic_deduct runs at position 17. **Dependency inverted.** |
| 20260228_token_usage_idempotency.sql | Table `token_usage` (from 20241117) | YES | 20241117_add_core_tables.sql creates token_usage. |
| 20260228_token_ledger_write_firewall.sql | Functions atomic_token_deduct, atomic_token_refund | YES | Firewall revokes DML; callers use SECURITY DEFINER functions from atomic_token_deduct.sql. |
| 20260244_stripe_webhook_idempotency_hardening.sql | Table `public.webhook_events` | **NO** | 20260244 lines 46–51: `ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_event_id_unique`. Lines 138, 163, 181, 200, 298, 331–332 reference `public.webhook_events`. Table created only in MOBILE/supabase/migrations/20260210_webhook_events.sql. Root does not create it. **Missing dependency.** |
| MOBILE 20260233_tier_invariant_constraints.sql | Table `public.users` | **NO** | File lines 14–18: `ALTER TABLE users ... ADD CONSTRAINT users_plan_valid`. No migration creates `public.users`. **Broken dependency.** |

**Verdict:** (1) token_usage idempotency must run before atomic_token_deduct; (2) root 20260244 requires webhook_events. **BLOCK.**

---

## STEP 3 — DESTRUCTIVE OPERATION FORENSIC CHECK

**Root supabase/migrations:** No DROP COLUMN, DROP TABLE, TRUNCATE, or DELETE FROM (grep).

**MOBILE supabase/migrations:**

| File | Line | Operation | Data lost | Reversible? | Safe for empty DB only? |
|------|------|-----------|-----------|-------------|-------------------------|
| 20260229_phase_m4_5_drop_legacy_content.sql | 4 | DROP COLUMN IF EXISTS title | journal_entries.title | No | No |
| 20260229_phase_m4_5_drop_legacy_content.sql | 5 | DROP COLUMN IF EXISTS content | journal_entries.content | No | No |
| 20260229_phase_m4_5_drop_legacy_content.sql | 7 | DROP COLUMN IF EXISTS content | conversation_messages.content | No | No |
| 20260229_phase_m4_5_drop_legacy_content.sql | 9 | DROP COLUMN IF EXISTS note | check_ins.note | No | No |
| 20260229_phase_m4_5_drop_legacy_content.sql | 11 | DROP COLUMN IF EXISTS content | memory_chunks.content | No | No |
| 20260229_phase_m4_5_drop_legacy_content.sql | 13 | DROP COLUMN IF EXISTS summary | user_reports.summary | No | No |
| 20260229_phase_m4_5_drop_legacy_content.sql | 14 | DROP COLUMN IF EXISTS notes | user_reports.notes | No | No |
| 20260229_phase_m4_5_drop_legacy_content.sql | 18 | DROP COLUMN IF EXISTS message | user_nudges.message | No | No |

No migration or trigger enforces that purge has been run for all users before 20260229. **Irreversible data loss without enforced precondition → BLOCK** (for any deployment that includes this migration).

---

## STEP 4 — TOKEN LEDGER INVARIANT VALIDATION

| Invariant | Preserved? | Evidence |
|-----------|------------|----------|
| token_usage_idempotency runs BEFORE atomic_token_deduct | **NO** | Lexicographic order: 20260228_atomic_token_deduct (17) before 20260228_token_usage_idempotency (20). |
| atomic_token_deduct runs BEFORE token_ledger_write_firewall | YES | 17 then 19. |
| UNIQUE constraints exist before functions that rely on them | **NO** | token_usage_idempotency_unique created in (20); atomic_token_deduct (17) assumes it. |
| No migration re-enables DML on ledger after firewall | YES | No GRANT/ALTER re-enabling DML. |
| SECURITY DEFINER functions exist when RLS/REVOKE applied | YES | Functions at (17); firewall at (19). |

**Verdict:** Ledger invariant “idempotency before atomic_deduct” **broken**. **BLOCK.**

---

## STEP 5 — PRIVILEGE & RLS REGRESSION CHECK

If all root migrations ran and succeeded: token_usage and token_topups would have RLS, FORCE RLS, no INSERT/UPDATE/DELETE policies, service_role cannot direct insert (20260228_token_ledger_write_firewall.sql lines 47–65, 76–185).

20260244 references `public.webhook_events`; in root-only run that table does not exist, so 20260244 fails at ALTER/CREATE. No consistent final state. **BLOCK.**

---

## STEP 6 — PARTIAL FAILURE SIMULATION

| Failure point | Leaves DB safe? | Explanation |
|---------------|-----------------|-------------|
| After 20260228_atomic_token_deduct (17), before 20260228_token_usage_idempotency (20) | **No** | atomic_token_deduct/refund use request_id, kind. Added only in (20). Calls fail. |
| 20260244 fails | **No** | Fails at ALTER webhook_events (table missing). Webhook path broken. |
| 20260228_token_ledger_write_firewall (19) fails after REVOKE | **Risky** | DML already revoked; policies might be inconsistent. |

**BLOCK.**

---

## STEP 7 — IDENTITY OF “FUTURE” MIGRATIONS

No migration dated after 2026-02-28. Runbook SQL is in runbook-sql/, not in migrations/. 20260229 is destructive and must not run until purge preconditions are enforced.

---

## STEP 8 — FINAL VERDICT

**BLOCK DEPLOYMENT**

### Migrations to isolate

1. **supabase/migrations/20260228_0002_atomic_token_deduct.sql** — Runs after 20260228_0001_token_usage_idempotency.sql (ordering enforced by numeric prefix).
2. **supabase/migrations/20260244_stripe_webhook_idempotency_hardening.sql** — Ensure `public.webhook_events` exists (e.g. create in root or apply from path that includes 20260210_webhook_events.sql).
3. **MOBILE/supabase/migrations/20260229_phase_m4_5_drop_legacy_content.sql** — Do not run until purge complete for all users and verified.
4. **MOBILE/supabase/migrations/20260233_tier_invariant_constraints.sql** — Fix or remove; table `public.users` does not exist.

### Ordering fixes required

- In supabase/migrations: 20260228_0001_token_usage_idempotency.sql runs before 20260228_0002_atomic_token_deduct.sql (enforced by 0001/0002/0003 prefix).
- 20260244 must not run until webhook_events exists.

### Preconditions required

- Before 20260229: run run_phase_m4_purge for every user; run run_phase_m4_audit_user; confirm rows_with_text = 0.
- Fix 20260233 (users table) before running.

Audit only; no code changes proposed.
