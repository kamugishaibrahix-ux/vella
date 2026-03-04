# STRICT MODE — FINAL GO BLOCKER AUDIT (supabase db push)

**Date:** 2026-02-28  
**Scope:** supabase/migrations (root stream)

---

## 1) SECURITY DEFINER SEARCH_PATH (HARD BLOCKER)

**Rule:** Every SECURITY DEFINER function must set `search_path` inside the function definition.

| Function | Has "SET search_path" | File:Line | Snippet | Verdict |
|----------|------------------------|-----------|---------|---------|
| `execute_verification_query(text)` | Yes | `supabase/migrations/20260231_execute_verification_query.sql:7-8` | `SECURITY DEFINER`<br>`SET search_path = public, pg_catalog` | OK |
| `run_phase_m4_purge(uuid)` | Yes | `supabase/migrations/20260227_phase_m4_purge.sql:7-8` | `SECURITY DEFINER`<br>`SET search_path = public` | OK |
| `run_phase_m1_audit()` | Yes | `supabase/migrations/20260223_phase_m1_audit_function.sql:6-7` | `SECURITY DEFINER`<br>`SET search_path = public` | OK |
| `atomic_stripe_webhook_process(...)` | Yes | `supabase/migrations/20260244_stripe_webhook_idempotency_hardening.sql:81-82` | `SECURITY DEFINER`<br>`SET search_path = public` | OK |
| `atomic_stripe_event_record(TEXT,TEXT)` | Yes | `supabase/migrations/20260244_stripe_webhook_idempotency_hardening.sql:287-288` | `SECURITY DEFINER`<br>`SET search_path = public` | OK |
| `atomic_token_deduct(...)` | Yes | `supabase/migrations/20260228_0002_atomic_token_deduct.sql:57-58` | `SECURITY DEFINER`<br>`SET search_path = public` | OK |
| `atomic_token_refund(uuid,uuid,bigint,text)` | Yes | `supabase/migrations/20260228_0002_atomic_token_deduct.sql:248-249` | `SECURITY DEFINER`<br>`SET search_path = public` | OK |
| `is_admin_user()` | **Yes (fixed)** | `supabase/migrations/20250101000000_vella_core_admin.sql:235` | `$$ language plpgsql security definer set search_path = public` | OK |

**Other functions in migrations:**  
- `reset_monthly_tokens()` — not SECURITY DEFINER (`20250217_token_engine.sql:52-59`).  
- `get_forbidden_content_keys()`, `jsonb_has_forbidden_keys(jsonb)` — not SECURITY DEFINER (`20260228_jsonb_forbidden_keys_guard.sql`).

**Result:** All SECURITY DEFINER functions now set `search_path`. **PASS.**

---

## 2) EXECUTE GRANTS (HARD BLOCKER)

**Rule:** Explicit REVOKE/GRANT for each SECURITY DEFINER RPC; `execute_verification_query` not executable by anon/authenticated; Stripe RPCs executable by role used in webhook (service_role).

| Function | GRANT EXECUTE | REVOKE EXECUTE | File:Line | Verdict |
|----------|----------------|----------------|-----------|---------|
| `execute_verification_query(text)` | `service_role` | PUBLIC, anon, authenticated | `20260231_execute_verification_query.sql:19-22` | OK — not executable by anon/authenticated |
| `run_phase_m4_purge(uuid)` | `service_role` | PUBLIC, anon, authenticated | `20260227_phase_m4_purge.sql:84-87` | OK |
| `run_phase_m1_audit()` | `service_role` | PUBLIC, anon, authenticated | `20260223_phase_m1_audit_function.sql:76-79` (added) | OK |
| `atomic_stripe_webhook_process(...)` | `service_role` | PUBLIC, anon, authenticated | `20260244_stripe_webhook_idempotency_hardening.sql` (added) | OK — webhook uses service_role |
| `atomic_stripe_event_record(TEXT,TEXT)` | `service_role` | PUBLIC, anon, authenticated | `20260244_stripe_webhook_idempotency_hardening.sql` (added) | OK |
| `atomic_token_deduct(...)` | `service_role` | PUBLIC, anon, authenticated | `20260228_0002_atomic_token_deduct.sql` (added) | OK |
| `atomic_token_refund(...)` | `service_role` | PUBLIC, anon, authenticated | `20260228_0002_atomic_token_deduct.sql` (added) | OK |
| `is_admin_user()` | (used in RLS policies; no explicit EXECUTE needed for policy evaluation) | — | N/A | OK |

**Evidence — execute_verification_query not executable by authenticated/anon:**  
- `supabase/migrations/20260231_execute_verification_query.sql:19-21`:  
  `REVOKE EXECUTE ON FUNCTION public.execute_verification_query(text) FROM PUBLIC;`  
  `REVOKE ... FROM anon;`  
  `REVOKE ... FROM authenticated;`  
  `GRANT EXECUTE ... TO service_role;`

**Evidence — Stripe RPCs executable by webhook role:**  
- `MOBILE/app/api/stripe/webhook/route.ts:9`: `import { supabaseAdmin, fromSafe } from "@/lib/supabase/admin";`  
- `MOBILE/lib/server/supabaseAdmin.ts:50`: `const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY` → client uses service_role.  
- Webhook calls `supabaseAdmin.rpc('atomic_stripe_webhook_process', ...)` / `atomic_stripe_event_record`.  
- Both RPCs now have `GRANT EXECUTE ... TO service_role` and REVOKE from anon/authenticated.

**Result:** All SECURITY DEFINER RPCs have explicit revoke/grant; execute_verification_query locked to service_role; Stripe RPCs executable by service_role. **PASS.**

---

## 3) execute_verification_query EXPLOIT SURFACE

**Rule:** Only service_role may reach `execute_verification_query`. No authenticated route may call it.

| Call site | File:Line | Snippet | Reached by |
|------------|-----------|---------|------------|
| `validateStructuralSealingWithDB(supabaseAdmin)` (uses `.rpc("execute_verification_query", ...)`) | `MOBILE/lib/security/systemSeal.ts:348-414` | `await supabaseAdmin.rpc("execute_verification_query", { query: ... })` | Server-only; client is parameter |
| No other call sites | — | — | — |

**Evidence:**  
- Grep for `validateStructuralSealingWithDB(`: only definition in `MOBILE/lib/security/systemSeal.ts`; no route or client code invokes it with a user-supplied client.  
- `validateStructuralSealingWithDB` is async and takes a `supabaseAdmin`-like client; the only legitimate caller would be server code that has `supabaseAdmin` from `@/lib/server/supabaseAdmin` (service_role).  
- No API route in `MOBILE/app/api/**` calls `validateStructuralSealingWithDB` or `.rpc("execute_verification_query", ...)`.

**Result:** Only service_role can reach execute_verification_query. **PASS.**

---

## 4) PARTIAL FAILURE STATE: 0002 BEFORE 0003

**Scenario:** Migration fails after `20260228_0002_atomic_token_deduct.sql` and before `20260228_0003_token_ledger_write_firewall.sql`.

**Are direct inserts possible?**  
- **Yes.**  
- `20241117_add_core_tables.sql:205-206` creates policy `users_insert_own_usage` on `token_usage` (INSERT with check auth.uid() = user_id).  
- `20241117_add_core_tables.sql:189-190` creates policy `users_insert_own_topups` on `token_topups` (INSERT with check auth.uid() = user_id).  
- Before 0003, these policies are still present and no REVOKE has been applied to token_usage/token_topups.  
- So authenticated users can still insert into token_usage and token_topups (own rows only) via RLS.

**Immediate remediation step:**  
- Run the next migration: `20260228_0003_token_ledger_write_firewall.sql`.  
- It revokes INSERT/UPDATE/DELETE on token_usage and token_topups from anon, authenticated, and service_role (lines 55-65), and drops the INSERT/UPDATE/DELETE policies (lines 77-151).  
- Single, deterministic step: apply 0003.

**Result:** Remediation is deterministic (run 0003). **PASS.**

---

## 5) FIXES APPLIED DURING AUDIT

1. **is_admin_user()** — Added `SET search_path = public` to function definition in `20250101000000_vella_core_admin.sql`.  
2. **run_phase_m1_audit()** — Added REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role in `20260223_phase_m1_audit_function.sql`.  
3. **atomic_stripe_webhook_process**, **atomic_stripe_event_record** — Added REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role in `20260244_stripe_webhook_idempotency_hardening.sql`.  
4. **atomic_token_deduct**, **atomic_token_refund** — Added same REVOKE/GRANT in `20260228_0002_atomic_token_deduct.sql`.

---

## FINAL VERDICT

**GO** for running `supabase db push` today, provided:

- All migrations are applied in order and the fixes above are present in the migration files.
- Post-migration: run `node MOBILE/scripts/verify-migration-stream-safe.mjs` and `node MOBILE/scripts/verify-tables-in-migrations.mjs` as a sanity check.

**Summary:** SECURITY DEFINER search_path set for all such functions; EXECUTE locked to service_role where required; execute_verification_query only reachable via service_role; partial failure after 0002 has a single deterministic remediation (run 0003).
