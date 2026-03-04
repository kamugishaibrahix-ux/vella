# Production Readiness Forensic Audit

**Date:** 2026-03-01  
**Scope:** MOBILE app (c:\dev\MOBILE), Supabase migrations (c:\dev\supabase)  
**Method:** Evidence-only; file paths, line numbers, terminal output.

---

## SECTION 1 — SCALABILITY (1000+ users)

### 1.1 Concurrency Safety

**Token deduction paths use atomic RPC (atomic_token_deduct).**
- **Evidence:** `MOBILE/lib/tokens/enforceTokenLimits.ts` lines 173–185: `atomicDeduct()` calls `supabaseAdmin.rpc("atomic_token_deduct", { p_user_id, p_request_id, p_tokens, p_source, ... })`. No other code path inserts into `token_usage` for charges.
- **Evidence:** `supabase/migrations/20260228_0003_token_ledger_write_firewall.sql`: REVOKE INSERT/UPDATE/DELETE on `token_usage` and `token_topups` from anon, authenticated, and service_role; only SECURITY DEFINER functions can write.
- **Verdict:** **PASS** — All token deduction goes through `atomic_token_deduct` RPC.

**Advisory locks in SQL.**
- **Evidence:** `supabase/migrations/20260228_0002_atomic_token_deduct.sql` line 99: `PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0)::bigint);` (deduct). Line 287: same lock in `atomic_token_refund`.
- **Evidence:** `supabase/migrations/20260244_stripe_webhook_idempotency_hardening.sql` line 132: `PERFORM pg_advisory_xact_lock(v_lock_key);` for webhook processing.
- **Verdict:** **PASS** — Per-user advisory lock in token RPCs; payment-intent lock in webhook.

**No SELECT-then-UPDATE race.**
- **Evidence:** `MOBILE/lib/tokens/enforceTokenLimits.ts` lines 278–362: Charge path calls `atomicDeduct()` only; no client-side SELECT then INSERT. Balance pre-check at 279 uses `getTokenBalanceForUser()` (read-only); actual enforcement is inside RPC (lock + compute + insert in one transaction). Comments at 304–308 describe concurrency safety.
- **Verdict:** **PASS** — No SELECT-then-UPDATE pattern; single atomic RPC.

### 1.2 Connection Pooling

**Supabase client usage.**
- **Evidence:** `MOBILE/lib/server/supabaseAdmin.ts` lines 50–51, 85–93: Single `createClient(url, serviceKey, { auth: { persistSession: false } })` exported as `supabaseAdmin`. No per-request client creation.
- **Evidence:** `MOBILE/lib/supabase/client.ts` lines 29–45: Browser client uses single `createClientInstance()` (anon key). Server routes use `supabaseAdmin` or `createServerSupabaseClient()` (server-auth).
- **Verdict:** **PASS** — One admin client; one client-side client; no unbounded creation.

**No raw pg pools.**
- **Evidence:** Grep for `new Pool`, `pg.Pool`, `createPool` in MOBILE: no matches. Only `createClient` from `@supabase/supabase-js`.
- **Verdict:** **PASS** — No manual pg pools.

### 1.3 Rate Limiting (monetised endpoints)

**Requirement:** Every monetised endpoint has `routeKey`, enforces `rateLimitResult.allowed`, policy "closed".

**Evidence from route registry and code:**

| Endpoint | routeKey | rateLimitResult.allowed | policy (RATE_LIMIT_POLICY) |
|----------|----------|--------------------------|----------------------------|
| /api/transcribe | transcribe | Yes (line 42) | closed |
| /api/clarity | clarity | Yes (line 39) | closed |
| /api/strategy | strategy | Yes (line 30) | closed |
| /api/compass | compass | Yes (line 36) | closed |
| /api/deepdive | deepdive | Yes (line 50) | closed |
| /api/reflection | reflection | Yes (route has rateLimit + allowed) | closed |
| /api/architect | architect | Yes | closed |
| /api/growth-roadmap | growth_roadmap | Yes (line 53) | closed |
| /api/emotion-intel | emotion_intel | Yes (line 29) | closed |
| /api/insights/generate | insights_generate | Yes (lines 88–97) | closed |
| /api/insights/patterns | insights_patterns | Yes (lines 81–91) | closed |
| /api/audio/vella | audio_vella | Yes (lines 36–46) | closed |
| /api/realtime/offer | realtime_offer | Yes (requireEntitlement then rateLimit) | closed |
| /api/realtime/token | realtime_token | Yes (lines 44–54) | closed |
| /api/vella/text | vella_text | Yes (lines 140–150) | closed |
| /api/stripe/webhook | stripe_webhook | Yes (lines 84–94) | closed |
| /api/admin/user/[id]/suspend | admin_suspend | (admin route) | closed |
| /api/admin/user/[id]/metadata | admin_metadata_write | Yes (lines 22–29) | closed |

**Source:** `MOBILE/lib/security/routeRegistry.ts` (ROUTE_REGISTRY), `MOBILE/lib/security/rateLimitPolicy.ts` (RATE_LIMIT_POLICY), and grep of each route file for `routeKey` and `rateLimitResult.allowed`.

**Verdict:** **PASS** — Monetised and admin endpoints have routeKey, check `!rateLimitResult.allowed`, and use closed policy.

### 1.4 Memory / Payload Limits

**Stripe webhook body cap.**
- **Evidence:** `MOBILE/app/api/stripe/webhook/route.ts` lines 57–58: `const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;`. Lines 111–122: Content-Length check before body read; lines 126–131: `Buffer.byteLength(body, "utf8")` check after read. Returns 413 if exceeded.
- **Verdict:** **PASS** — 256 KB cap enforced.

**OpenAI payload constraints.**
- **Evidence:** `MOBILE/lib/tokens/enforceTokenLimits.ts` line 63: `const PER_REQUEST_CEILING = 100_000;` (tokens). No explicit request body size limit found for OpenAI proxy routes; Next.js default body parser applies.
- **Verdict:** **RISK** — Token ceiling exists; no explicit JSON body size limit for AI routes (relies on framework defaults).

**Unbounded JSON.**
- **Evidence:** pattern-insight uses `requestSchema` with `z.array(patternStringSchema).max(MAX_PATTERN_ITEMS)` (100) and `patternStringSchema = z.string().max(200)` — `MOBILE/app/api/pattern-insight/route.ts` lines 15–33. Other routes use various zod schemas; no global API body size limit found.
- **Verdict:** **RISK** — No repo-wide unbounded JSON; some routes bound input; no single global cap documented.

### 1.5 Long-running / blocking calls

**External calls:** OpenAI (chat completions, audio, etc.), Stripe (webhooks, checkout, portal), Supabase (DB, auth). Realtime (Vella) uses external APIs.

**Evidence:** No `await openai.*` or `await stripe.*` inside `for`/`while` loops in route handlers. Charge-then-call pattern: chargeTokensForOperation → OpenAI call → refund on failure (e.g. `MOBILE/app/api/vella/text/route.ts`, `MOBILE/app/api/compass/route.ts`). No synchronous CPU-heavy loops found in routes (e.g. no large synchronous crypto or JSON.parse of huge payloads in hot path).

**Verdict:** **PASS** — External calls not in loops; no obvious sync CPU-heavy work in request path.

---

**SCALABILITY VERDICT: PASS (with minor risks)**  
- Atomic RPC + advisory locks + no SELECT-then-UPDATE; single Supabase client pattern; rate limiting with routeKey and fail-closed on monetised routes; webhook body capped.  
- Risks: No global API JSON body limit; no explicit OpenAI request size limit beyond token ceiling.

---

## SECTION 2 — SECURITY / DATA EXFILTRATION

### 2.1 RLS Enforcement

**Source:** Migrations under `supabase/migrations/` (including `20260228_0003_token_ledger_write_firewall.sql`, `20260245_explicit_privileges_subscriptions_user_metadata_webhook_events.sql`, `20260301_rls_hardening_core_tables.sql`, `20260210_webhook_events.sql`, `20250101000000_vella_core_admin.sql`, `20260230_admin_user_flags.sql`).

| Table | RLS enabled | FORCE ROW LEVEL SECURITY | Policies |
|-------|-------------|---------------------------|----------|
| token_usage | Yes (0003, 20260301) | Yes (0003, 20260301) | users_select_own_usage (SELECT only); writes via SECURITY DEFINER only |
| token_topups | Yes (0003, 20260301) | Yes (0003, 20260301) | users_select_own_topups (SELECT only); writes via SECURITY DEFINER only |
| subscriptions | Yes (20260301, 41117) | Yes (20260301) | users_select_own_subscriptions (SELECT); no client write policies |
| webhook_events | Yes (20260210) | — | "Service role only" USING (false) |
| user_metadata | Yes (vella_core_admin, 20260301) | Yes (20260301) | user_metadata_read_own (SELECT); admin writes via service_role |
| admin_user_flags | Yes (20260230) | — | No policies for anon/authenticated; service_role only |

**Verdict:** **PASS** — All six tables have RLS enabled; core tables have FORCE RLS and least-privilege policies.

**Note:** Migration `20260301_rls_hardening_core_tables.sql` revokes ALL on token_usage and token_topups from service_role. `MOBILE/lib/tokens/balance.ts` (lines 103–107, 135–139) uses `supabaseAdmin` (service_role) to SELECT from token_usage and token_topups. After applying 20260301, those reads will fail unless service_role is granted SELECT or balance is read via an RPC/authenticated client. **RISK:** Apply 20260301 only after restoring service_role SELECT for balance or switching balance to RPC/authenticated path.

### 2.2 Public Routes

**Unauthenticated routes (no requireUserId / requireActiveUser / requireAdminRole / requireEntitlement before main logic):**

| Route | DB writes | OpenAI | Token deduction | Rate limiting |
|-------|-----------|--------|-----------------|---------------|
| /api/stripe/webhook | Yes (via service_role / RPC) | No | No (credits via RPC) | Yes, routeKey stripe_webhook, 100/60s per IP |
| /api/regulation-strategies | No | No | No | Yes, IP 60/60s |
| /api/pattern-insight | No | No | No | Yes, routeKey pattern_insight, IP 60/60s |

**Evidence:** regulation-strategies: `MOBILE/app/api/regulation-strategies/route.ts` — static JSON return, no DB/OpenAI. pattern-insight: `MOBILE/app/api/pattern-insight/route.ts` — getDictionary + interpolate, no DB/OpenAI. stripe webhook: signature verification (line 136), then handlers; idempotency via recordStripeEvent / atomic_stripe_webhook_process.

**Verdict:** **PASS** — Only three unauthenticated routes; two are read-only and rate-limited; webhook has signature verification, body cap, and idempotency before mutation.

### 2.3 Admin Escalation Risk

**Admin auth uses app_metadata.role only.**
- **Evidence:** `MOBILE/lib/admin/requireAdminRole.ts` lines 57–60: `const role = (user.app_metadata as { role?: string } | undefined)?.role;` and `isAdminRole(role)`. ADMIN_ROLES = super_admin, ops_admin, analyst, support_agent, read_only (lines 9–14).
- **Verdict:** **PASS** — Admin gate is app_metadata.role only.

**No user_metadata for auth decisions.**
- **Evidence:** requireAdminRole does not read user_metadata; it uses only supabase.auth.getUser() and user.app_metadata.role. Grep for "user_metadata" in admin routes: used for data read/write (e.g. admin/user/[id]/metadata), not for "is this user an admin?".
- **Verdict:** **PASS** — Admin identity from JWT app_metadata only.

**No client-side admin flags.**
- **Evidence:** Admin routes call requireAdminRole() server-side. No search hit for client-side role or admin flag driving auth.
- **Verdict:** **PASS** — Admin is server-only.

### 2.4 Secrets Exposure

**Search for sk_live_, STRIPE_SECRET, SERVICE_ROLE, SUPABASE_SERVICE_ROLE_KEY:**
- **Evidence:** `MOBILE/lib/payments/stripe.ts` line 3: `process.env.STRIPE_SECRET_KEY` (server). `MOBILE/lib/server/supabaseAdmin.ts` line 51: `process.env.SUPABASE_SERVICE_ROLE_KEY`. Scripts under MOBILE/scripts/ and test files reference SUPABASE_SERVICE_ROLE_KEY for test clients — not in app client bundle. No `sk_live_` literal in repo. `MOBILE/lib/server/env.ts` lists required server env (STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY etc.) — server module.
- **Evidence:** `MOBILE/lib/server/supabaseAdmin.ts` lines 26–44: `isClient()` throws SERVER_ONLY_MODULE_VIOLATION if run in browser. Scripts `verify-admin-client-isolation.mjs` and `check-service-role-usage.ts` enforce server-only usage of service role key.
- **Verdict:** **PASS** — Secrets only in server/env/scripts; runtime guard on supabaseAdmin; no evidence of process.env secrets in client bundles.

### 2.5 Webhook Hardening

**Signature before any DB write.**
- **Evidence:** `MOBILE/app/api/stripe/webhook/route.ts` lines 106–138: Get signature → get body (with size check) → `stripe.webhooks.constructEvent(body, signature, webhookSecret)` → then switch (event.type) and handlers. All handlers run after constructEvent; no DB write before line 135.
- **Verdict:** **PASS** — Signature verified before processing.

**Idempotency before mutation.**
- **Evidence:** handleSubscriptionCheckout (line 191): `const recorded = await recordStripeEvent(eventId, "checkout.session.completed"); if (recorded.already_processed) return;` then upsertSubscriptionForUser. handleSubscriptionCreated (line 289), handleSubscriptionUpdated (315), etc. — same pattern: recordStripeEvent first, return if already_processed, then mutate. Token credit path uses atomicStripeWebhookProcess (DB-side idempotency).
- **Verdict:** **PASS** — Idempotency check (record event / atomic RPC) before mutation.

**Unique constraint on webhook_events.event_id.**
- **Evidence:** `supabase/migrations/20260210_webhook_events.sql` line 6: `event_id TEXT NOT NULL UNIQUE`.
- **Verdict:** **PASS** — UNIQUE on event_id.

---

**SECURITY VERDICT: PASS (with one migration risk)**  
- RLS and FORCE RLS on core tables; public routes minimal and safe; admin from app_metadata only; secrets server-only; webhook signature → idempotency → mutation, UNIQUE event_id.  
- Risk: 20260301 revokes service_role SELECT on token_usage/token_topups; balance.ts uses service_role for reads — must fix before or with 20260301.

---

## SECTION 3 — BUILD INTEGRITY

### 3.1 Lint

**Command:** `pnpm lint` (from c:\dev\MOBILE)

**Result:** Exit code 0. Warnings only (react-hooks/exhaustive-deps, no-img-element). No errors.

**Verdict:** **PASS**

### 3.2 Type check

**Command:** `npx tsc --noEmit` (from c:\dev\MOBILE)

**Result:** Errors: TS6053 File '.next/types/...' not found for many files (tsconfig includes .next/types). Stale/missing generated types.

**Command (build-time):** `pnpm build` runs Next.js type check.

**Result:** Type error in `.next/types/app/api/system/health/route.ts:8`: `resetHealthQueryCounter` (and related exports) do not satisfy route module constraint `{ [x: string]: never }` for non-handler exports.

**Evidence:** `MOBILE/app/api/system/health/route.ts` lines 27–32: `export let healthEndpointQueryCounter`, `export function resetHealthQueryCounter()`, `export function getHealthQueryCount()`.

**Verdict:** **FAIL** — Standalone tsc fails due to .next/types; build fails due to system/health route exporting non-route symbols.

### 3.3 Production build

**Command:** `pnpm build`

**Result:** prebuild steps passed (check-no-tier-logic, detect-pii-write, check-migrations-schema-guard). Next.js compiled successfully. Linting and type check failed: type error above. Exit code 1.

**Verdict:** **FAIL** — Build fails on type error in system/health route.

---

**BUILD STATUS: FAIL**  
- Lint passes; type check and production build fail due to `MOBILE/app/api/system/health/route.ts` exporting `resetHealthQueryCounter` / `getHealthQueryCount` / `healthEndpointQueryCounter`, which violate Next.js route module types.

---

## SECTION 4 — SYSTEM COMPLETENESS

### 4.1 End-to-end flow verification

**Flows traced from route → service → DB (evidence only):**

- **Signup / Login:** Supabase Auth (server-auth, createServerSupabaseClient); no stub found; flows use standard auth.
- **Vella text session:** `/api/vella/text` → requireUserId (server-auth) → rate limit (vella_text, closed) → entitlement → chargeTokensForOperation (enforceTokenLimits) → atomic_token_deduct → OpenAI; refund on failure. Path present in `MOBILE/app/api/vella/text/route.ts`; no TODO/stub for charge or refund.
- **Token deduction:** Single path: chargeTokensForOperation → atomicDeduct → rpc("atomic_token_deduct") — `MOBILE/lib/tokens/enforceTokenLimits.ts` lines 362–363, 173–185.
- **Stripe checkout:** `/api/stripe/create-checkout-session` and `/api/stripe/topups/create-checkout-session` → requireUserId → Stripe session create; no stub.
- **Stripe webhook:** POST → rate limit → signature → body size → constructEvent → handlers → recordStripeEvent / atomicStripeWebhookProcess; idempotency in DB and in handler order.
- **Subscription downgrade/upgrade:** Handled in webhook (customer.subscription.updated, handlePlanTransition); downgradePolicy.ts used; no stub found.
- **Admin dashboard:** /api/admin/* routes use requireAdminRole() (app_metadata.role); analytics, subscribers, user metadata, suspend — all gated.

**Dead feature flags / TODOs:** Not exhaustively audited; no critical TODOs in the traced monetised paths above.

**Verdict:** **PARTIAL** — Core flows (auth, vella text, token charge/refund, Stripe checkout/webhook, admin) are implemented and wired; build failure blocks full deployment verification.

### 4.2 Environment sanity

**Required env (from codebase):**
- **Server:** SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY (or similar), OPENAI_API_KEY, REDIS_URL (for production rate limiting). Listed in `MOBILE/lib/server/env.ts` and used in api routes.
- **Client:** NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (client.ts, env.ts).

**Local .env / production config:** Not read (sensitive). Audit assumes required vars are set in local and production per env.ts and route usage.

**Verdict:** **PARTIAL** — Required vars identified in code; no automated check of .env presence in this audit.

---

**SYSTEM FUNCTIONALITY VERDICT: PARTIAL**  
- Core flows implemented and traceable; build failure prevents full E2E; env vars documented in code.

---

## FINAL OUTPUT

| Area | Verdict |
|------|--------|
| **SCALABILITY** | PASS (minor risks: no global JSON body limit) |
| **SECURITY** | PASS (risk: 20260301 breaks service_role balance reads) |
| **BUILD** | FAIL |
| **SYSTEM COMPLETENESS** | PARTIAL |

### Top 5 remaining risks

1. **Build failure:** `MOBILE/app/api/system/health/route.ts` exports `resetHealthQueryCounter`, `getHealthQueryCount`, `healthEndpointQueryCounter` — Next.js route modules must not export non-handler symbols. Fix: move instrumentation to a separate module or remove exports.
2. **RLS migration 20260301:** Revokes service_role SELECT on token_usage and token_topups. `MOBILE/lib/tokens/balance.ts` uses supabaseAdmin (service_role) to read those tables. Either grant service_role SELECT for these two tables (e.g. in migration or later) or add an RPC/authenticated path for balance and switch balance.ts to it.
3. **No global API body size limit:** Stripe webhook has 256 KB; no single documented limit for other JSON APIs; reliance on Next.js defaults.
4. **tsc --noEmit:** Fails when .next/types is included and stale; consider excluding .next from tsc or running type check only via `next build`.
5. **Lint warnings:** react-hooks/exhaustive-deps and no-img-element in several files; low severity but should be cleaned for consistency.

### Exact files that need fixes

- **Build (required):** `MOBILE/app/api/system/health/route.ts` — remove or relocate exports `resetHealthQueryCounter`, `getHealthQueryCount`, `healthEndpointQueryCounter` so the file only exports GET (and allowed route handlers).
- **Before applying 20260301:** Either change `supabase/migrations/20260301_rls_hardening_core_tables.sql` to grant SELECT on token_usage and token_topups to service_role, or change `MOBILE/lib/tokens/balance.ts` to use an RPC or authenticated client for balance reads.

### SAFE TO DEPLOY

**CONDITIONAL**

- **No** until build passes (fix system/health route exports).
- **No** until 20260301 is reconciled with balance reads (service_role SELECT or balance via RPC/authenticated client).
- After those two items: **Yes** from a scalability and security evidence perspective, with accepted minor risks (payload limits, lint).
