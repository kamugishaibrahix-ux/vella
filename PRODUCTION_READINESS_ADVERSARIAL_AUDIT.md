# FINAL ADVERSARIAL PRODUCTION READINESS AUDIT (DEPLOYMENT GATE)

**Date:** 2026-02-28  
**Scope:** Migration stream, schema consistency, RLS/privileges, token ledger invariants, Stripe/webhook safety, RPC existence, app-schema drift, partial deployment risk.  
**Rules:** Read-only. Evidence: file paths + line numbers. No assumptions. Verdict: GO or NO-GO.

---

## STEP 1 — SCHEMA VS APPLICATION DRIFT SCAN (CRITICAL)

### 1.1 Required objects from codebase (evidence)

**Tables required by `.from("<table>")`:**

| Object | Required By (file:line) | Exists In Root Migration? | Safe? |
|--------|-------------------------|----------------------------|--------|
| admin_ai_config | apps/vella-control (multiple routes), MOBILE/lib/admin/adminConfig.ts:191,218 | Yes — 20250101000000_vella_core_admin.sql | Yes |
| admin_activity_log | apps/vella-control (multiple routes) | Yes — 20250101000000 | Yes |
| admin_user_flags | MOBILE/lib/auth/requireActiveUser.ts:60 | **No** — only MOBILE/supabase/migrations/20260230_admin_user_flags.sql | **NO-GO (MOBILE)** |
| analytics_counters | apps/vella-control/app/api/admin/system-health/route.ts:47, analytics/get | Yes — 20250101000000 | Yes |
| feedback | apps/vella-control engagement, insights, feedback/list | Yes — 20250101000000 | Yes |
| promo_codes | apps/vella-control promo-codes/*, list, create, update, delete, deactivate | Yes — 20251221120000_admin_c_mod_tools.sql | Yes |
| subscriptions | apps/vella-control (multiple), MOBILE/lib/auth/requireActiveUser.ts:65, MOBILE/app/profile/page.tsx:449 | Yes — 20241117_add_core_tables.sql | Yes |
| system_logs | apps/vella-control alerts, logs/list, engagement, system-health, analytics | Yes — 20250101000000 | Yes |
| token_ledger | apps/vella-control/app/api/admin/users/update-tokens/route.ts:71 | Yes — 20250101000000 (audit trail; not firewall-protected by design) | Yes |
| token_usage | apps/vella-control tokens/list, engagement, insights | Yes — 20241117 | Yes |
| user_metadata | apps/vella-control users/* (list, update-plan, update-notes, etc.) | Yes — 20250101000000 | Yes |
| user_reports | apps/vella-control reports/*, user-reports/* | Yes — 20251221120000 | Yes |
| webhook_events | MOBILE/test ref; Stripe idempotency uses RPCs that write to it | Yes — 20260210_webhook_events.sql | Yes |
| journal_entries | MOBILE/scripts/test-build-detector.ts:36 (test script only) | No — not in root | Test-only; N/A |

**RPCs required by `.rpc("<function>")`:**

| Object | Required By (file:line) | Exists In Root Migration? | Safe? |
|--------|-------------------------|----------------------------|--------|
| atomic_token_deduct | MOBILE/lib/tokens/enforceTokenLimits.ts:179 | Yes — 20260228_0002_atomic_token_deduct.sql:45 | Yes |
| atomic_token_refund | MOBILE/lib/tokens/enforceTokenLimits.ts:234 | Yes — 20260228_0002:240 | Yes |
| atomic_stripe_webhook_process | MOBILE/app/api/stripe/webhook/route.ts:490 | Yes — 20260244_stripe_webhook_idempotency_hardening.sql:70 | Yes |
| atomic_stripe_event_record | MOBILE/app/api/stripe/webhook/route.ts:529 | Yes — 20260244:281 | Yes |
| run_phase_m4_purge | MOBILE/app/api/internal/migration/purge/route.ts:72 | **No** — MOBILE/supabase/migrations/20260227_phase_m4_purge.sql | **Blocker if purge route used** |
| run_phase_m1_audit | MOBILE/app/api/internal/migration/audit/route.ts:54 | **No** — MOBILE/supabase/migrations/20260223_phase_m1_audit_function.sql | **Blocker if audit cron used** |
| execute_verification_query | MOBILE/lib/security/systemSeal.ts:348,376,384,392,400,412 | **No** — not in root migrations | **Blocker if systemSeal validates at startup** |

**Enums:** `subscription_plan` ('free','pro','elite') — created 20241117; referenced by subscriptions. Root has it. Safe.

**Constraints assumed by logic:**  
- Token idempotency: UNIQUE (user_id, request_id, kind) on token_usage — 20260228_0001:76.  
- Stripe: UNIQUE(event_id) on webhook_events — 20260210:6 (column), 20260244 adds webhook_events_event_id_unique if missing; UNIQUE(stripe_payment_intent_id) on token_topups — 20260244:26.  
All present in root. Safe.

### 1.2 Verdict Step 1

- **admin_user_flags** is required by MOBILE at runtime (requireActiveUser) and exists **only** in MOBILE migrations → **NO-GO for MOBILE deployment** unless 20260230 is merged into root.
- **run_phase_m4_purge**, **run_phase_m1_audit**, **execute_verification_query** exist only in MOBILE/runbook → NO-GO if those code paths are used in production; otherwise conditional.

---

## STEP 2 — RLS EFFECTIVE STATE SIMULATION

### 2.1 token_usage and token_topups (final state after all migrations)

**Evidence:**  
- 20241117: RLS enabled; policies users_select_own_usage, users_insert_own_usage, users_update_own_usage, users_delete_own_usage (token_usage); same pattern for token_topups.  
- 20260228_0003_token_ledger_write_firewall.sql:  
  - RLS enabled + **FORCE ROW LEVEL SECURITY** (lines 46–47).  
  - REVOKE INSERT, UPDATE, DELETE from anon, authenticated, **service_role** (54–64).  
  - GRANT SELECT to authenticated (69–71).  
  - DROP policies: users_insert_own_usage, users_update_own_usage, users_delete_own_usage (token_usage); same for token_topups (76–154).  
  - CREATE only users_select_own_usage, users_select_own_topups (159–184).

**Effective state:**  
- RLS: ON. FORCE RLS: ON.  
- Policies: SELECT only (own row by auth.uid()). No INSERT/UPDATE/DELETE policies.  
- anon: no DML. authenticated: SELECT only. **service_role: no INSERT/UPDATE/DELETE** (explicit REVOKE).  
- SECURITY DEFINER functions (atomic_token_deduct, atomic_token_refund, atomic_stripe_webhook_process) run as function owner (postgres); they bypass RLS for owner and perform INSERT. So only RPCs can write. **Safe.**

### 2.2 webhook_events

**Evidence:** 20260210_webhook_events.sql:19–24 — RLS enabled; policy "Service role only" FOR ALL USING (false). So no role satisfies the policy via RLS. Table owner (postgres) bypasses RLS (FORCE not set). SECURITY DEFINER functions (atomic_stripe_webhook_process, atomic_stripe_event_record) run as owner and can INSERT. Application code does not insert into webhook_events directly (only via RPC). **Safe.**

### 2.3 token_ledger (admin audit trail)

**Evidence:** 20250101000000:216, 310–317 — RLS enabled; policy admin_only_token_ledger FOR ALL USING (service_role or is_admin_user()). No REVOKE in 20260228_0003 (only token_usage/token_topups). So **service_role retains default table privileges**. vella-control uses service_role (apps/vella-control/lib/supabase/adminClient.ts — SUPABASE_SERVICE_ROLE_KEY). So admin panel can INSERT into token_ledger. **By design.** Safe.

### 2.4 Admin tables (admin_ai_config, admin_activity_log, user_metadata, etc.)

Root migrations grant/admin via RLS policies (e.g. is_admin_user() or service_role). user_reports and promo_codes: REVOKE ALL from anon/authenticated; GRANT SELECT, INSERT, UPDATE to service_role (20260227_root_rls_user_reports_promo_codes.sql:22–24, 66–68). Admin panel uses service_role. **No privilege escalation; no lockout** for intended admin paths.

### 2.5 Privilege matrix (summary)

| Role | token_usage | token_topups | webhook_events | token_ledger |
|------|-------------|--------------|----------------|--------------|
| anon | SELECT no (no policy match) | same | no | no |
| authenticated | SELECT own | SELECT own | no | no (policy denies) |
| service_role | **No INSERT/UPDATE/DELETE** (REVOKE) | same | no via RLS (policy false); **writes only via DEFINER** | INSERT/UPDATE/DELETE (allowed) |
| DEFINER (postgres) | INSERT via atomic_token_* | INSERT via atomic_stripe_* | INSERT via atomic_stripe_* | — |

- **service_role cannot directly insert into token_usage or token_topups** — evidence: 20260228_0003:62–64.  
- **SECURITY DEFINER functions still execute** — they run as owner, bypass RLS (owner), and have no REVOKE on function execution.  
- **No policy grants broader SELECT than intended** — token_usage/token_topups only users_select_own_* (auth.uid() = user_id).

**Verdict Step 2:** No privilege escalation; no accidental lockout. **GO** for RLS/privileges.

---

## STEP 3 — TOKEN LEDGER INVARIANT STRESS TEST

### 3.1 No double-charge (network retry / duplicate RPC)

- **Idempotency:** UNIQUE index token_usage_idempotency_unique ON (user_id, request_id, kind) WHERE request_id IS NOT NULL — 20260228_0001:76–78.  
- **Function:** atomic_token_deduct checks for existing row with same request_id (104–108, 109–143); if FOUND and kind = 'charge', returns already_charged without inserting — 20260228_0002:104–142.  
- **Second INSERT with same (user_id, request_id, kind)** would violate unique index; function never reaches INSERT if row exists. So **no double-charge** even on retry or duplicate call.

**Proof chain:** 20260228_0001 (UNIQUE) → 20260228_0002 (SELECT then INSERT; idempotent return) → 20260228_0003 (REVOKE direct writes). **Safe.**

### 3.2 No negative balance (concurrent requests / exception mid-flow)

- **Advisory lock:** pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0)::bigint) — 20260228_0002:98. Serializes all token operations for same user within transaction.  
- **Balance check:** v_remaining := p_allowance + v_topups - v_used; IF v_remaining < p_tokens THEN RETURN insufficient_balance — lines 168–169, 174–179.  
- **CHECK constraint:** token_usage_tokens_not_zero (tokens <> 0) — 20260228_0001:48–50. Kind is 'charge' or 'refund' only — token_usage_kind_valid.  
- **Direct INSERT/UPDATE revoked** — no path for app to decrement balance without going through RPC. RPC computes balance under lock and only inserts if sufficient. **No overdraft path.**

**Proof chain:** Lock (98) → SUM usage/topups (147–164) → check v_remaining >= p_tokens (174–179) → INSERT (186+). Exception before INSERT rolls back transaction (EXCEPTION WHEN OTHERS at end of function). **Safe.**

### 3.3 request_id uniqueness enforced before function logic

- UNIQUE index created in 20260228_0001 (migration 18). atomic_token_deduct (migration 19) runs after; it first checks existing row (104–108), then INSERT. So **constraint exists before any RPC that relies on it.** **Safe.**

### 3.4 No migration temporarily leaves ledger writable without firewall

- Order: 20260228_0001 (idempotency columns + UNIQUE) → 20260228_0002 (atomic_token_deduct/refund) → 20260228_0003 (REVOKE direct writes).  
- Between 0001 and 0003: direct INSERT still allowed (old policies + no REVOKE yet). So **after 0002, before 0003**, both RPC and direct write can insert. That is a **temporary** state only during migration run; after 0003 applies, only RPC can write. So **no permanent** path; **partial failure** addressed in Step 5.

**Verdict Step 3:** No double-charge; no negative balance; request_id uniqueness before use; no permanent ledger write without firewall. **GO** for token ledger invariants.

---

## STEP 4 — STRIPE HARDENING ATTACK SIMULATION

| Attack Scenario | Prevented? | Evidence |
|-----------------|------------|----------|
| Duplicate webhook event delivery | Yes | UNIQUE(event_id) — 20260210:6 (column), 20260244:49–52 (constraint webhook_events_event_id_unique). atomic_stripe_webhook_process checks PERFORM 1 FROM webhook_events WHERE event_id = p_event_id (137–149); returns already_processed. INSERT in BEGIN...EXCEPTION WHEN unique_violation (179–192) returns already_processed. |
| Out-of-order event delivery | Yes | Per-event idempotency by event_id; payment intent idempotency by stripe_payment_intent_id. No ordering assumption. |
| Payment intent replay | Yes | UNIQUE(stripe_payment_intent_id) WHERE NOT NULL — 20260244:26–28. Function checks SELECT tokens_awarded FROM token_topups WHERE stripe_payment_intent_id = p_payment_intent_id (155–172); if FOUND, marks event processed and returns without credit. INSERT topup in BEGIN...EXCEPTION WHEN unique_violation (208–225). |
| Malicious forged event without DB constraints | Mitigated | Route calls atomic_stripe_webhook_process (490); no code path credits tokens outside RPC. RPC validates p_event_id, p_payment_intent_id, p_user_id, p_tokens_to_award; invalid returns error. Duplicate event_id/payment_intent_id caught by UNIQUE. Signature verification is application-layer (not in scope). |

**Evidence:**  
- atomic_stripe_webhook_process: unique_violation handled for webhook_events insert (183) and token_topups insert (215).  
- atomic_stripe_event_record: unique_violation handled (306).  
- No .from("token_topups").insert or .from("webhook_events").insert in MOBILE/app/api/stripe/webhook/route.ts (grep: no matches).

**Verdict Step 4:** No double-credit path; UNIQUEs and RPC exception handling in place. **GO** for Stripe hardening.

---

## STEP 5 — PARTIAL MIGRATION FAILURE CHAOS TEST

Execution order: 20241117 → 20250101 → 20250101000000 → … → 20260243 → 20260244 (24 total).

| Failure After | DB Safe? | Why / Why Not |
|---------------|----------|----------------|
| 20241117 | Yes | Core tables exist; no dependent migration assumes more. |
| 20250101 | Yes | No-op placeholder. |
| 20250101000000 | Yes | Admin tables + token_ledger; 20250217 alters subscriptions/profiles which exist. |
| … through 20260227_* | Yes | Each migration alters/creates objects that exist from prior. |
| 20260228_0001 | Yes | token_usage has idempotency columns + UNIQUE; 0002 not yet run so no RPC yet; 0003 not run so direct write still allowed. **Runtime:** App may call atomic_token_deduct which does not exist → error. No inconsistent schema. |
| 20260228_0002 | **Risky** | RPCs exist; 0003 not applied. **service_role and authenticated still have INSERT on token_usage/token_topups** (policies from 20241117). So direct INSERT still possible; ledger not yet fully firewalled. **DB consistent** but **runtime not fully safe** until 0003. |
| 20260228_0003 | Yes | Firewall applied; only RPCs can write. Safe. |
| 20260228_jsonb_forbidden_keys_guard | Yes | Only adds functions; no table ALTER. |
| 20260243 | Yes | Indexes only. |
| 20260244 | Yes | Stripe RPCs + constraints. |

**RLS revoke before replacement:** 20260228_0003 drops INSERT/UPDATE/DELETE policies then creates only SELECT. So no period where INSERT is allowed by a new policy after REVOKE. **Safe.**

**Functions reference columns not yet created:** atomic_token_deduct uses request_id, kind — added in 20260228_0001; 0002 runs after 0001. **Safe.**

**Constraints rely on missing indexes:** UNIQUE and CHECK in 0001 are on token_usage which exists. 20260244 adds constraint on webhook_events (exists from 20260210). **Safe.**

**Verdict Step 5:** One **temporary** risk: failure after 0002 but before 0003 leaves direct writes possible. Mitigation: run migrations in one batch; if 0003 fails, re-run to complete. No **permanent** unsafe state. **GO** with caveat: ensure 0003 always runs after 0002 in same run or immediate retry.

---

## STEP 6 — ENUM + CHECK CONSTRAINT SAFETY

- **ALTER TYPE ADD VALUE:** Grep in supabase/migrations: no matches. No enum value removal. **Safe.**  
- **CHECK on existing tables:** 20260227_admin_config_size_constraints (admin_ai_config, admin_activity_log, system_logs, user_metadata) — size/length limits. 20260228_0001: token_usage_tokens_not_zero, token_usage_kind_valid. 20260227_root_*: various length/size CHECKs. All use IF NOT EXISTS or ADD CONSTRAINT only if missing; existing rows must satisfy (e.g. config size, kind IN ('charge','refund')). **Risk:** If existing data violated a new CHECK, migration would fail; no silent corruption. **Safe** for idempotent additions.  
- **NOT NULL without default:** 20260228_0001 adds kind TEXT NOT NULL DEFAULT 'charge'. request_id UUID NULL. No NOT NULL added without default in scanned migrations. **Safe.**  
- **Enum value removal:** None. **Safe.**

**Verdict Step 6:** No production constraint failure from existing data. **GO.**

---

## STEP 7 — FUTURE MIGRATION LANDMINES

- **Migration with date after today:** Lexicographic names 20260243, 20260244 are after 20260228; they are version stamps, not calendar dates. No migration file with calendar date after 2026-02-28. **No landmine.**  
- **DROP COLUMN / DROP TABLE in root:** Grep supabase/migrations for DROP COLUMN, DROP TABLE, TRUNCATE, ALTER TYPE ... DROP: **no matches**. Destructive DDL only in runbook-sql. **No landmine.**  
- **Commented-out SQL accidentally activated:** No scan of commented multi-line SQL that could be uncommented by mistake; manual review recommended. **No evidence of landmine.**

**Verdict Step 7:** No landmines in active stream. **GO.**

---

## STEP 8 — FINAL VERDICT

**NO-GO**

Production deployment is **blocked** until the following are satisfied.

### Exact blockers

1. **Table `admin_user_flags`**  
   - Required by: `MOBILE/lib/auth/requireActiveUser.ts:60`.  
   - Not created in `supabase/migrations`; only in `MOBILE/supabase/migrations/20260230_admin_user_flags.sql`.  
   - Effect: All MOBILE routes using `requireActiveUser()` return 403 (relation does not exist).

### Minimal corrective actions (safety only; no refactors)

1. **Merge admin_user_flags into active stream**  
   Copy `MOBILE/supabase/migrations/20260230_admin_user_flags.sql` to `supabase/migrations/20260230_admin_user_flags.sql`. Run migrations. No code changes.

2. **(Only if internal migration routes are used in production)**  
   - Merge RPC `run_phase_m4_purge` (MOBILE 20260227_phase_m4_purge.sql) into root, or apply MOBILE migrations.  
   - Merge RPC `run_phase_m1_audit` (MOBILE 20260223_phase_m1_audit_function.sql) into root, or apply MOBILE migrations.  
   - If systemSeal startup validation is required, add RPC `execute_verification_query` to root or make seal non-fatal when RPC is missing.

After blocker (1) is fixed, **GO** for MOBILE. vella-control and Stripe/token paths are **GO** with root-only migrations today.

---

*Evidence: file paths and line numbers cited above. No summaries without proof.*
