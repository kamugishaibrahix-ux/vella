# Forensic Audit: Front-to-Back Wiring & Mock/Stub Integrity

**Scope:** `c:\dev\MOBILE` (excluding `test/**`, `scripts/**`)  
**Objective:** Evidence-only audit — no code changes. Prove whether the app is fully wired with NO mock data, stub handlers, dead feature flags, or placeholder logic in production paths.

---

## STEP 1 — Mock / Stub / Placeholder Patterns

### Table: Production-path findings (excludes test/**)

| File | Line | Pattern | Production Path? | Risk Level |
|------|------|---------|------------------|------------|
| `lib/plans/pricingConfig.ts` | 5 | "Hardcoded prices (temporary)" | Yes | **Medium** – single source of truth; comment says will be replaced by Stripe |
| `lib/ai/agents.ts` | 348–518 | `mockClarity`, `mockStrategy`, `mockDeepDive`, `mockCompass`, `mockArchitect`, `mockEmotion`, `mockAttachment`, `mockIdentity` | Yes | **High** – returned when `!openai` or on error; **runLifeArchitect** always returns `mockArchitect()` (no OpenAI) |
| `lib/ai/agents.ts` | 574, 606, 613, 644, 652, 678, 685, 713, 718, 722, 749, 754, 779, 784, 811 | `if (!openai) return mock*` / `return mock*` | Yes | **High** – production fallback to mock when OpenAI unavailable or for architect |
| `lib/nudges/nudgeEngine.ts` | 4–5, 21–26 | "Path B placeholder", "stub", `createAndStoreNudge` always returns `null` | Yes | **High** – API surface intact but handler is stub; POST /api/nudge returns `{ nudge: null }` |
| `i18n/dictionaries/fr.ts` | 135–140, 423–464 | "timeline.mock.*", "[TODO: translate]" | Yes (i18n only) | **Low** – UI strings; mock keys may display in FR locale |
| `app/profile/page.tsx` | 395 | "placeholder" | No | **None** – input placeholder text only |
| `app/insights/page.tsx` | 124–140 | "MOCK DATA GENERATION", `generateDeterministicData()` | Yes | **High** – Insights page uses deterministic mock data only; **no fetch to /api/insights/snapshot** or any API |

### console.log in app/api and lib (production paths)

- **app/api:** No `console.log` in `app/api/**`.
- **lib:** Multiple files have `console.log` in production code (no `NODE_ENV` guard):  
  `lib/security/systemSeal.ts`, `lib/audio/vellaAudioCatalog.ts`, `lib/audio/vellaUnifiedAudio.ts`, `lib/realtime/realtimeClient.ts`, `lib/realtime/useRealtimeVella.ts`, `lib/stoic/insights.ts`, `lib/budget/usageEngine.ts`, `lib/plans/resolvePlanEntitlements.ts`, `lib/admin/adminConfig.ts`, `lib/plans/downgradePolicy.ts`, `lib/payments/webhookIdempotency.ts`, `lib/security/observability.ts`, `lib/telemetry/voiceTelemetry.ts`, `lib/server/env.ts`, `lib/ai/textEngine.ts`, `lib/ai/circuitBreaker.ts`, `lib/tokens/tokenDryRunLog.ts`.  
  Many are behind `NODE_ENV === "development"` in the same files; the ones above are either unguarded or in code paths that run in production.

### Dev-only conditionals (NODE_ENV !== "production" / === "development")

- Used for: logging, debug UI (inbox banner, journal), anon session allowlist, rate-limit fallback, encryption check skip, admin bypass in dev, token dry-run logging.  
- **Risk:** Low for behaviour; production behaviour does not rely on mock data from these branches.  
- **Notable:** `lib/nudges/nudgeEngine.ts` line 22: in non-production, logs "Nudges temporarily disabled"; in production still returns `null` (stub).

---

## STEP 2 — API Wiring Verification

**Criteria:** Fully wired = auth → rateLimit → entitlement (if monetised) → token charge (if monetised) → DB or external call → proper error handling.  
**Abbreviations:** Auth = requires auth (requireUserId / requireActiveUser / requireAdminRole / service key); Ent = entitlement check; DB = fromSafe/supabaseAdmin; OpenAI = OpenAI call; Stripe = Stripe call; Hardcoded = returns static JSON without DB/external.

| Route | Requires Auth? | Requires Entitlement? | Calls DB? | Calls OpenAI? | Calls Stripe? | Returns Hardcoded? | Fully Wired? |
|-------|----------------|------------------------|------------|---------------|---------------|--------------------|--------------|
| account/delete | Yes (requireUserId) | No | Yes | No | No | No | Yes |
| account/entitlements | Yes (requireActiveUser) | No | Yes (tier/entitlements) | No | No | No (on error RESTRICTED_DEFAULTS) | Yes |
| account/export | Yes | No | Yes | No | No | No | Yes |
| account/plan | Yes | No | Yes (getUserPlanTier) | No | No | No | Yes |
| account/token-balance | Yes (requireActiveUser) | No | Yes | No | No | No | Yes |
| admin/analytics/overview | Yes (requireAdminRole) | No | Yes | No | No | No | Yes |
| admin/subscribers | Yes (requireAdminRole) | No | Yes | No | No | No | Yes |
| admin/user/[id]/metadata | Yes (requireAdminRole) | No | Yes | No | No | No | Yes |
| admin/user/[id]/suspend | Yes (requireAdminRole) | No | Yes | No | No | No | Yes |
| architect | Yes (requireEntitlement) | Yes (architect) | No | **No (mock only)** | No | No | **Partial** – auth+ent+token+mock result |
| audio/vella | Yes (requireEntitlement) | Yes (audio_vella) | No | No (external audio) | No | No | Yes |
| behavioural-state | Yes | No | Yes | No | No | No | Yes |
| check-in/contracts | Yes (requireActiveUser) | Plan tier | Yes | No | No | No | Yes |
| check-ins | Yes | No | Yes | No | No | No | Yes |
| check-ins/weekly-focus | Yes | No | Yes | No | No | No | Yes |
| clarity | Yes (requireEntitlement) | Yes | No | Yes (or mock if !openai) | No | No | Partial (mock fallback) |
| cognitive-distortions | Yes | No | Yes (lib) | No | No | No | Yes |
| commitments/create | Yes | No | Yes | No | No | No | Yes |
| commitments/list | Yes | No | Yes | No | No | No | Yes |
| commitments/outcome | Yes | No | Yes | No | No | No | Yes |
| commitments/status | Yes | No | Yes | No | No | No | Yes |
| compass | Yes (requireEntitlement) | Yes | No | Yes (or mock) | No | No | Partial (mock fallback) |
| connection-depth | Yes | No | Yes | No | No | No | Yes |
| connection-index | Yes | No | Yes | No | No | No | Yes |
| deep-insights | Yes (requireEntitlement) | Yes | No | Yes (or mock) | No | No | Partial (mock fallback) |
| deepdive | Yes (requireEntitlement) | Yes | No | Yes (or mock) | No | No | Partial (mock fallback) |
| distortions | Yes | No | Yes | No | No | No | Yes |
| emotion-intel | Yes (requireEntitlement) | Yes | No | Yes (or mock) | No | No | Partial (mock fallback) |
| emotion-memory | Yes | No | Yes | No | No | No | Yes |
| execution/trigger/log | Yes | No | Yes | No | No | No | Yes |
| execution/trigger/suppressed | Yes | No | Yes | No | No | No | Yes |
| feedback/create | Yes | No | Yes (supabaseAdmin) | No | No | No | Yes |
| focus/week | Yes | No | Yes | No | No | No | Yes |
| focus/week/review | Yes | No | Yes | No | No | No | Yes |
| forecast | Yes | No | Yes (lib) | No | No | No | Yes |
| governance/state | Yes | No | Yes (readState) | No | No | No | Yes |
| goals | Yes | No | Yes | No | No | No | Yes |
| growth-roadmap | Yes (requireEntitlement) | Yes | No | Yes | No | No | Yes |
| identity | Yes | No | Yes (or mock if !openai) | Yes/mock | No | No | Partial (mock fallback) |
| inbox | Yes (requireActiveUser) | No | Yes | No | No | No | Yes |
| inbox/proposals | Yes (requireActiveUser) | No | Yes | No | No | No | Yes |
| insights/generate | Yes (requireEntitlement) | Yes | No | Yes | No | No | Yes |
| insights/patterns | Yes (requireEntitlement) | Yes | Yes | Yes | No | No | Yes |
| insights/snapshot | Yes | No | Yes | No | No | No | Yes |
| internal/governance/daily | Service/key | No | Yes | No | No | No | Yes |
| internal/migration/audit | Service key | No | Yes (RPC) | No | No | No | Yes |
| internal/migration/purge | Service key | No | Yes (RPC) | No | No | No | Yes |
| journal | Yes | No | Yes | No | No | No | Yes |
| journal/console | Yes | No | Yes | No | No | No | Yes |
| journal/preview | Yes | No | Yes | No | No | No | Yes |
| journal-themes | Yes | No | Yes | No | No | No | Yes |
| life-themes | Yes | No | Yes | No | No | No | Yes |
| loops | Yes | No | Yes | No | No | No | Yes |
| memory/chunk | Service key | No | Yes | No | No | No | Yes |
| memory/embed | Service key | No | Yes | No | No | No | Yes |
| memory/reindex | Service key | No | Yes | No | No | No | Yes |
| memory/search | Yes (requireEntitlement) | Yes | Yes | No | No | No | Yes |
| memory/snapshot | Service key | No | Yes | No | No | No | Yes |
| migration/complete | Yes | No | Yes | No | No | No | Yes |
| migration/export/* | Yes + token | No | No (410 or export) | No | No | **410 JSON** (intended) | Yes (by design) |
| migration/start | Yes | No | Yes | No | No | No | Yes |
| migration/status | Yes | No | Yes | No | No | No | Yes |
| nudge | Yes | No | **No** | No | No | **Yes ({ nudge: null })** | **No** – stub handler |
| pattern-insight | Yes | No | Yes | No | No | No | Yes |
| patterns | Yes | No | Yes | No | No | No | Yes |
| prediction | Yes | No | Yes | No | No | No | Yes |
| progress | Yes | No | Yes | No | No | No | Yes |
| roadmap | Yes | No | Yes | No | No | No | Yes |
| regulation | Yes | No | Yes | No | No | No | Yes |
| regulation-strategies | Yes | No | Yes | No | No | No | Yes |
| reports/create | Yes | No | Yes | No | No | No | Yes |
| realtime/token | Yes (requireEntitlement) | Yes | No | No | No | No | Yes |
| realtime/offer | Yes (requireEntitlement) | Yes | No | No | No | No | Yes |
| session/confirm-contract | Yes (requireActiveUser) | Plan | Yes | No | No | No | Yes |
| state/current | Yes | No | Yes | No | No | No (default empty state) | Yes |
| state/history | Yes | No | Yes | No | No | No | Yes |
| state/recompute | Yes | No | Yes | No | No | No | Yes |
| stripe/create-checkout-session | Yes | No | Yes | No | Yes | No | Yes |
| stripe/portal | Yes | No | Yes | No | Yes | No | Yes |
| stripe/token-pack | Yes | No | Yes | No | Yes | No | Yes |
| stripe/topups/create-checkout-session | Yes | No | Yes | No | Yes | No | Yes |
| stripe/webhook | No (signature) | No | Yes | No | Yes | No | Yes |
| strategy | Yes (requireEntitlement) | Yes | No | Yes (or mock) | No | No | Partial (mock fallback) |
| strengths-values | Yes | No | Yes | No | No | No | Yes |
| system/health | Yes | No | Yes | No | No | No (DEFAULT_RESPONSE on error) | Yes |
| themes | Yes | No | Yes | No | No | No | Yes |
| traits | Yes | No | Yes | No | No | No | Yes |
| transcribe | Yes (requireEntitlement) | Yes | No | Yes | No | No | Yes |
| vella/session/close | Yes | No | Yes | No | No | No | Yes |
| vella/text | Yes (requireEntitlement) | Yes | No | Yes (or mock) | No | No | Partial (mock fallback) |
| weekly-review | Yes | No | Yes | No | No | No | Yes |

**Summary Step 2:**  
- **Stub / mock in production path:** `architect` (always mock), `nudge` (always `null`).  
- **Mock fallback when OpenAI missing/error:** clarity, compass, deepdive, strategy, emotion-intel, identity, attachment, vella/text, deep-insights.  
- **Migration export routes** return fixed 410 JSON by design; not “unsafe” hardcoded content.

---

## STEP 3 — Frontend → API Coverage

### Mapping: Page/Component → API endpoint → Exists? → Auth protected?

| Page / Component | API Endpoint Called | Exists? | Auth Protected? |
|------------------|---------------------|--------|------------------|
| DailyCheckInPrompt | POST /api/check-ins | Yes | Yes |
| EntitlementsProvider | GET /api/account/entitlements | Yes | Yes |
| commitments/create | POST /api/commitments/create | Yes | Yes |
| commitments | GET /api/commitments/list | Yes | Yes |
| profile/upgrade | POST /api/stripe/create-checkout-session, portal, topups/create-checkout-session | Yes | Yes |
| session | POST /api/vella/text, /api/session/confirm-contract, /api/checkin/contracts | Yes | Yes |
| journal | POST /api/journal; useSWR GET /api/journal | Yes | Yes |
| journal/[id] | POST /api/journal | Yes | Yes |
| journal/history | useSWR /api/journal | Yes | Yes |
| checkin | GET /api/checkin/contracts | Yes | Yes |
| inbox | POST /api/commitments/outcome, /api/session/confirm-contract; GET /api/inbox | Yes | Yes |
| session/voice | POST /api/session/confirm-contract | Yes | Yes |
| GovernanceHero | GET /api/governance/state, POST /api/vella/text, /api/check-ins | Yes | Yes |
| TokenBalanceProvider | GET /api/account/token-balance | Yes | Yes |
| TodayGreeting | POST /api/vella/text | Yes | Yes |
| commitments/[id] | GET /api/commitments/list, /api/commitments/outcome; POST /api/commitments/status | Yes | Yes |

### UI components with static/mock data or dev-only fallback

| Location | Issue |
|----------|--------|
| **app/insights/page.tsx** | Uses **only** `generateDeterministicData()` (mock). No `fetch` or `useSWR` to `/api/insights/snapshot` or any insights API. Entire Insights page is mock data in production. |
| **app/inbox/page.tsx** | `isDev` used for debug trace, verification banner, and console.debug. No static data fallback for feed; feed comes from GET /api/inbox and local proposal/commitment state. |
| **app/journal/page.tsx** | `NODE_ENV === "development"` used for console.debug only. Data from useSWR /api/journal. |
| **app/profile/page.tsx** | Client-side read of `subscriptions` via Supabase client (RLS applies). No static data arrays. |

---

## STEP 4 — Supabase Usage Integrity

### DB writes and client usage

- **Server-side writes:** All observed writes go through `fromSafe` or `supabaseAdmin` (e.g. account/delete, inbox/proposals, feedback/create, stripe/webhook, check-ins, commitments, etc.). `fromSafe` is defined in `lib/server/supabaseAdmin.ts` and re-exported from `lib/supabase/admin.ts`; it uses the admin client and `assertSafeTable`.
- **Tables:** All accessed tables are in `SAFE_TABLES` (`lib/supabase/safeTables.ts`). No direct client-side `.insert`/`.update`/`.delete`/`.upsert` in `app/**`; only server routes and server libs perform writes.
- **Client-side:** `app/profile/page.tsx` uses `supabase.auth.getSession()` and `supabase.from("subscriptions").select(...)` — read-only, RLS applies. No client writes to sensitive tables found.

### Token operations

- **Atomic RPCs:** Token deduction/refund go through `supabaseAdmin.rpc("atomic_token_deduct", ...)` and `rpc("atomic_token_refund", ...)` in `lib/tokens/enforceTokenLimits.ts`. No direct table writes for token balance in route handlers; charge/refund use these RPCs.
- **Stripe webhook:** Uses `rpc("atomic_stripe_webhook_process")` and `rpc("atomic_stripe_event_record")` in `app/api/stripe/webhook/route.ts`.

### RLS / SECURITY DEFINER

- Admin client is server-only (runtime guard in `lib/server/supabaseAdmin.ts`). Writes use either `supabaseAdmin` or `fromSafe`; migration purge/audit use RPCs (`run_phase_m4_purge`, audit RPC). No evidence of routes writing to a table without going through the safe table list or RPCs.

**Conclusion Step 4:** All DB writes observed use supabaseAdmin/fromSafe or SECURITY DEFINER RPCs. No direct client-side writes to sensitive tables. Token operations use atomic_token_deduct / atomic_token_refund. No table written directly from a route without going through the safe table set or RPC.

---

## STEP 5 — Feature Flag / Dev Conditionals Sweep

### NODE_ENV / isDev (representative)

| File | Condition | Active in Production? | Risk |
|------|-----------|------------------------|------|
| lib/nudges/nudgeEngine.ts | NODE_ENV !== "production" (log only) | No (log off) | Stub still returns null in prod |
| lib/realtime/VellaProvider.tsx | NODE_ENV === "development" | No | Debug only |
| lib/realtime/realtimeClient.ts | NODE_ENV === "development" (many) | No | Debug logging |
| lib/realtime/useRealtimeVella.ts | NODE_ENV === "development" (many) | No | Debug logging |
| app/inbox/page.tsx | isDev (banner, trace, console) | No | UI/logging only |
| app/journal/page.tsx | NODE_ENV === "development" | No | Console only |
| lib/security/rateLimitPolicy.ts | NODE_ENV === "development" (fallback policy) | No | Fallback when Redis down |
| lib/supabase/safeTables.ts | NODE_ENV !== "production" (warn on bad table) | Yes (warn in dev only) | Low |
| lib/auth/requireAdmin.ts | NODE_ENV === "development" (admin bypass) | No | Dev bypass only |
| lib/auth/ensureAnonSession.ts | NODE_ENV !== "production" (anon allow) | No | Dev only |
| lib/admin/adminConfig.ts | NODE_ENV !== "production" (local config) | No | Dev config |
| lib/tokens/tokenDryRunLog.ts | NODE_ENV !== "production" | No | Dry-run log only |
| lib/security/systemSeal.ts | NODE_ENV !== "production" (skip encryption check) | No | Dev skip |

No **dead** feature flags or disabled logic blocks that leave production with unintended behaviour were identified; dev branches are logging, bypasses, or UI only.

---

## FINAL OUTPUT

### Wiring status: **PARTIAL**

- Most routes are fully wired (auth → rate limit → entitlement/token where applicable → DB or external → error handling).
- **Partial** due to: (1) mock/stub in production paths (agents, nudge, insights page), (2) AI routes returning mock when OpenAI unavailable or when architect is called.

### Mock data found: **YES**

- **lib/ai/agents.ts:** Mock functions used as fallback when `!openai` or on error; **runLifeArchitect** always returns mock (no OpenAI call).
- **lib/nudges/nudgeEngine.ts:** Stub: `createAndStoreNudge` always returns `null`.
- **app/insights/page.tsx:** Page uses only `generateDeterministicData()`; no API call for insights data.
- **i18n/dictionaries/fr.ts:** Timeline mock keys and [TODO: translate] strings (UI only).

### Unsafe hardcoded paths

- **lib/plans/pricingConfig.ts:** Hardcoded prices (documented as temporary for Stripe); single source of truth, not arbitrary literals in UI.
- **app/api/nudge/route.ts:** Returns `{ nudge: null }` always (stub).
- **app/api/vella/text/route.ts:** Can return a hardcoded fallback reply on error: `"I'm here, but I'm having trouble..."` (user-facing fallback, not data).
- **app/api/system/health/route.ts:** On catch returns `DEFAULT_RESPONSE` (zeros/stable) — intentional fallback.
- Migration export routes: Fixed 410 JSON — by design.

### Unused API routes (no frontend fetch/useSWR found in app/**)

The following routes have no direct `fetch("/api/...")` or `useSWR("/api/...")` in the scanned app code; they may be used by server components, other services, or future UI:

- Many insight/analytics routes (e.g. architect, clarity, compass, deepdive, strategy, reflection, emotion-intel, identity, insights/patterns, insights/generate, insights/snapshot) — some may be called from server or other entry points.
- nudge, weekly-review, forecast, roadmap, regulation, regulation-strategies, life-themes, journal-themes, connection-depth, connection-index, pattern-insight, goals, progress, behavioural-state, distortion/cognitive-distortions, strengths-values, loops, patterns, focus/week, focus/week/review, memory/*, migration/*, internal/*, admin/*, account/plan, execution/trigger/*, realtime/*, system/health.

So “unused” here means “not referenced by client fetch/useSWR in this audit”; not necessarily dead.

### Dead UI routes

- None identified. All pages that were checked either call an API or use mock data explicitly (insights).

### Anything returning static content that should not be static

- **POST /api/nudge:** Always `{ nudge: null }` — stub; should eventually drive real nudges or be removed/hidden.
- **GET /api/architect (underlying runLifeArchitect):** Always returns mock architect summary — no real AI; tokens are still charged.
- **app/insights/page.tsx:** Renders only deterministic mock data; does not call GET /api/insights/snapshot (or any API). Content is static in the sense of “not from backend”.

---

**Audit complete. No code was changed.**
