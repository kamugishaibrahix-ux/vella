# Auth & Local-Only Mode Audit Report

## Summary

This audit maps all places in the MOBILE app that still depend on:
- Supabase auth sessions (`requireUserId`, `signInAnonymously`)
- Concrete Supabase tables (`user_goals`, `last_active`, `token_rates`, `subscriptions`, `vella_settings`, etc.)
- Token pricing metadata (`getTokenCost`, `TOKEN_RATE_NOT_FOUND`)

**Goal:** Identify all blocking points that prevent the app from functioning in pure local-first mode (no required auth, no required Supabase tables).

---

## 1. CHECK-INS

### 1.1 `MOBILE/lib/hooks/useCheckins.ts` – `requireUserId()` (local helper)

- **What it does:** Local helper function that attempts to get userId for check-in operations.
- **Auth / userId / Supabase dependency:**
  - Calls `supabase.auth.getUser()` to get existing user.
  - Falls back to `supabase.auth.signInAnonymously()` if no user exists.
  - Throws error if both fail.
- **Failure behaviour (no auth / no token rate / missing tables):**
  - Throws `Error` if Supabase client not configured or both auth attempts fail.
  - However, `listCheckins()` and `addCheckin()` wrap this in try/catch and fall back to `ensureUserId(undefined)` for local-only mode.
- **Severity in local-only mode:** `SAFE` (already has fallback)
- **Supabase tables touched:** None (auth only)
- **Main call sites / feature:**
  - `listCheckins()` – wraps in try/catch, falls back to local-only
  - `addCheckin()` – wraps in try/catch, falls back to local-only
- **Desired behaviour in Path B:**
  - Remove `requireUserId()` helper entirely.
  - Always use `ensureUserId(undefined)` for local storage operations.
  - Only attempt Supabase sync if userId exists and Supabase is available.

### 1.2 `MOBILE/lib/hooks/useCheckins.ts` – `addCheckin()` – `last_active` update

- **What it does:** Updates `profiles.last_active` in Supabase after saving a check-in.
- **Auth / userId / Supabase dependency:**
  - Calls `safeUpdate("profiles", { last_active: now })` if userId exists.
- **Failure behaviour (no auth / no token rate / missing tables):**
  - Logs error but continues (wrapped in try/catch).
  - Check-in still saves locally.
- **Severity in local-only mode:** `SAFE` (already degrades gracefully)
- **Supabase tables touched:**
  - `profiles` (via `safeUpdate`)
- **Main call sites / feature:**
  - Called from check-in submission flow.
- **Desired behaviour in Path B:**
  - Make `last_active` update completely optional (skip if no Supabase or no userId).

---

## 2. INSIGHTS & PATTERNS

### 2.1 `MOBILE/app/api/insights/patterns/route.ts` – `POST`

- **What it does:** Derives emotional patterns from check-ins to display in the check-in dashboard.
- **Auth / userId / Supabase dependency:**
  - Calls `requireUserId()` → hard requires Supabase auth session (throws `UnauthenticatedError` if missing).
  - Reads token cost via `getTokenCost("deep_emotion")` which expects `token_rates` table in Supabase.
  - Calls `getUserTokenState(userId)` which requires `subscriptions` and `token_usage` tables.
- **Failure behaviour (no auth / no token rate / missing tables):**
  - Returns 401 if `requireUserId()` throws `UnauthenticatedError`.
  - Returns 500 if `getTokenCost()` throws `TOKEN_RATE_NOT_FOUND`.
  - Returns 500 if `getUserTokenState()` throws (missing `subscriptions` or `token_usage` tables).
  - Falls back to lite patterns if token check fails, but only after auth succeeds.
- **Severity in local-only mode:** `BLOCKING`
- **Supabase tables touched (directly or via helpers):**
  - `token_rates` (via `getTokenCost`)
  - `subscriptions` (via `getUserTokenState`)
  - `token_usage` (via `getUserTokenState`)
- **Main call sites / feature:**
  - Called from `MOBILE/app/check-in/page.tsx` → `reloadData()` → `requestEmotionalPatterns()`.
- **Desired behaviour in Path B:**
  - If there is no userId or no token rate:
    - Skip Supabase calls completely.
    - Derive patterns **purely from local check-ins** or return a safe empty patterns object.
    - Never throw; allow check-in page + Aurora Bloom to proceed.

### 2.2 `MOBILE/app/api/insights/generate/route.ts` – `POST`

- **What it does:** Generates AI-powered insights from check-ins, journals, and patterns.
- **Auth / userId / Supabase dependency:**
  - Calls `requireUserId()` → hard requires Supabase auth session.
  - Calls `getTokenCost(FEATURE_KEY)` → requires `token_rates` table.
  - Calls `getUserTokenState(userId)` → requires `subscriptions` and `token_usage` tables.
  - Calls `loadServerVellaSettings(userId)` → queries `vella_settings` table.
  - Calls `chargeTokens(userId, cost, FEATURE_KEY)` → requires `subscriptions` and `token_usage` tables.
- **Failure behaviour (no auth / no token rate / missing tables):**
  - Returns 500 if `requireUserId()` throws.
  - Returns 500 if `getTokenCost()` throws `TOKEN_RATE_NOT_FOUND`.
  - Returns 500 if `getUserTokenState()` throws (missing tables).
  - Returns 500 if `loadServerVellaSettings()` fails (but it has fallback to `DEFAULT_SETTINGS`).
  - Returns 500 if `chargeTokens()` throws (missing `subscriptions` table).
  - Falls back to lite insights if token check fails, but only after auth succeeds.
- **Severity in local-only mode:** `BLOCKING`
- **Supabase tables touched (directly or via helpers):**
  - `token_rates` (via `getTokenCost`)
  - `subscriptions` (via `getUserTokenState`, `chargeTokens`)
  - `token_usage` (via `getUserTokenState`, `chargeTokens`)
  - `vella_settings` (via `loadServerVellaSettings`)
- **Main call sites / feature:**
  - Called from various insight generation flows.
- **Desired behaviour in Path B:**
  - If there is no userId or no token rate:
    - Skip all Supabase calls.
    - Return lite insights derived from local data only.
    - Never throw; allow UI to display lite insights.

### 2.3 `MOBILE/lib/insights/behaviourLoops.ts` – `detectBehaviourLoops()`

- **What it does:** Detects behaviour loops from journals and check-ins.
- **Auth / userId / Supabase dependency:**
  - Calls `getUserPlanTier(userId)` → may query `subscriptions` table.
  - Calls `loadServerPersonaSettings(userId)` → queries `vella_settings` and `profiles` tables.
  - Calls `generateEmotionalPatterns(userId, ...)` → may call `/api/insights/patterns` which requires auth.
  - Calls `callVellaReflectionAPI(payload)` → may require auth for AI calls.
- **Failure behaviour (no auth / no token rate / missing tables):**
  - Returns empty array `[]` if `userId` is null (early guard).
  - Returns heuristic loops if `planTier === "free"` (bypasses AI).
  - May throw if `getUserPlanTier()` or `loadServerPersonaSettings()` fail (not wrapped).
  - May throw if `generateEmotionalPatterns()` fails (depends on `/api/insights/patterns`).
- **Severity in local-only mode:** `DEGRADED` (returns empty/heuristic but may throw)
- **Supabase tables touched (directly or via helpers):**
  - `subscriptions` (via `getUserPlanTier`)
  - `vella_settings` (via `loadServerPersonaSettings`)
  - `profiles` (via `loadServerPersonaSettings`)
- **Main call sites / feature:**
  - Called from `/api/forecast`, `/api/identity`, `getBehaviourLoops()` wrapper.
- **Desired behaviour in Path B:**
  - If userId is null or Supabase unavailable:
    - Return heuristic loops derived from local data only.
    - Never throw; always return at least empty array or heuristic loops.

### 2.4 `MOBILE/lib/loops/getBehaviourLoops.ts` – `getBehaviourLoops()`

- **What it does:** Wrapper that enriches behaviour loops with themes and distortions.
- **Auth / userId / Supabase dependency:**
  - Calls `detectBehaviourLoops(userId)`, `getLifeThemes(userId)`, `getCognitiveDistortions(userId)`.
  - Calls `loops.map()` which may fail if `loops` is not an array (see error: `loops.map is not a function`).
- **Failure behaviour (no auth / no token rate / missing tables):**
  - Returns empty array `[]` if `userId` is null (early guard).
  - Returns empty array `[]` if any Promise.all call throws (wrapped in try/catch).
  - **BUG:** If `detectBehaviourLoops()` returns `{ loops: [], summary: "..." }` (object) instead of array, `loops.map()` will throw `loops.map is not a function`.
- **Severity in local-only mode:** `BLOCKING` (due to `.map()` bug on non-array return)
- **Supabase tables touched:** None directly (delegates to other functions)
- **Main call sites / feature:**
  - Called from `/api/forecast`, `/api/identity`.
- **Desired behaviour in Path B:**
  - Fix the `.map()` bug: check if `loops` is an array before calling `.map()`.
  - If `detectBehaviourLoops()` returns an object with `loops` property, extract the array.
  - Never throw; always return at least empty array.

---

## 3. GOALS & FORECAST

### 3.1 `MOBILE/lib/goals/goalEngine.ts` – `listGoals()`, `createGoal()`, etc.

- **What it does:** Manages user goals stored in Supabase `user_goals` table.
- **Auth / userId / Supabase dependency:**
  - All functions require `userId` parameter.
  - Queries `user_goals` and `user_goal_actions` tables directly via `supabase.from("user_goals")`.
  - Uses `safeInsert` and `safeUpdate` helpers.
- **Failure behaviour (no auth / no token rate / missing tables):**
  - Returns empty array `[]` if query fails (wrapped in try/catch).
  - Returns `null` if insert/update fails (wrapped in try/catch).
  - Throws if `supabaseAdmin` is not configured (via `resolveClient()`).
  - **PGRST205 error:** If `user_goals` table doesn't exist, query will fail with PGRST205.
- **Severity in local-only mode:** `DEGRADED` (returns empty/null but logs errors)
- **Supabase tables touched:**
  - `user_goals` (direct queries)
  - `user_goal_actions` (direct queries)
- **Main call sites / feature:**
  - Called from `/api/goals`, `/api/forecast` (for goals data).
- **Desired behaviour in Path B:**
  - If `user_goals` table doesn't exist or Supabase unavailable:
    - Return empty array for `listGoals()`.
    - Return `null` for create/update operations.
    - Never throw; gracefully degrade to "no goals" state.

### 3.2 `MOBILE/app/api/forecast/route.ts` – `GET` and `POST`

- **What it does:** Generates emotional forecast and aggregates traits, themes, loops, goals, etc.
- **Auth / userId / Supabase dependency:**
  - Calls `requireUserId()` → hard requires Supabase auth session.
  - Calls `getBehaviourLoops(userId)` → may fail if loops return non-array (see bug above).
  - Calls `listGoals(userId, "life")` and `listGoals(userId, "focus")` → requires `user_goals` table.
  - Calls `getUserTraits(userId)`, `getPreviousTraitSnapshot(userId)` → may require Supabase.
  - Calls `getLifeThemes(userId)`, `getCognitiveDistortions(userId)` → may require Supabase.
- **Failure behaviour (no auth / no token rate / missing tables):**
  - Returns 401 if `requireUserId()` throws `UnauthenticatedError`.
  - Returns 500 if any Promise.all call throws (not all wrapped).
  - **BUG:** If `getBehaviourLoops()` returns non-array, `loops.map()` will throw → 500.
  - If `listGoals()` fails (PGRST205), returns empty array (safe).
- **Severity in local-only mode:** `BLOCKING`
- **Supabase tables touched (directly or via helpers):**
  - `user_goals` (via `listGoals`)
  - Various tables via trait/theme/loop functions
- **Main call sites / feature:**
  - Called from forecast dashboard.
- **Desired behaviour in Path B:**
  - If there is no userId or Supabase unavailable:
    - Skip all Supabase-dependent calls.
    - Return forecast derived from local check-ins only.
    - Return empty arrays for goals, loops, themes if unavailable.
    - Never throw; always return a valid forecast object.

---

## 4. TOKENS & PLANS

### 4.1 `MOBILE/lib/tokens/getTokenCost.ts` – `getTokenCost()`

- **What it does:** Looks up token cost for a given event type from `token_rates` table.
- **Auth / userId / Supabase dependency:**
  - Queries `token_rates` table via `fromSafe("token_rates").select("cost").eq("event", event).maybeSingle()`.
  - Requires `supabaseAdmin` to be configured.
- **Failure behaviour (no auth / no token rate / missing tables):**
  - Throws `Error("Supabase admin client not configured.")` if `supabaseAdmin` is null.
  - Throws `Error("TOKEN_RATE_NOT_FOUND")` if query fails or no row found.
  - **PGRST205 error:** If `token_rates` table doesn't exist, query will fail with PGRST205 → throws `TOKEN_RATE_NOT_FOUND`.
- **Severity in local-only mode:** `BLOCKING` (throws, no fallback)
- **Supabase tables touched:**
  - `token_rates` (direct query)
- **Main call sites / feature:**
  - Called from `/api/insights/patterns`, `/api/insights/generate`, `/lib/ai/agents`, `/lib/ai/reflection`, `/lib/memory/summariser`.
- **Desired behaviour in Path B:**
  - If `token_rates` table doesn't exist or Supabase unavailable:
    - Return a default cost (e.g., 0 or a safe default like 10 tokens).
    - Never throw; always return a number.

### 4.2 `MOBILE/lib/tokens/getUserTokenState.ts` – `getUserTokenState()`

- **What it does:** Calculates user's token allocation, usage, and remaining balance.
- **Auth / userId / Supabase dependency:**
  - Queries `subscriptions` table for allocation and balance.
  - Queries `token_usage` table for usage within current period.
  - Requires `supabaseAdmin` to be configured.
- **Failure behaviour (no auth / no token rate / missing tables):**
  - Throws `TokenError("Supabase admin client not configured.")` if `supabaseAdmin` is null.
  - Throws `TokenError` if `subscriptions` query fails.
  - Throws `TokenError` if `token_usage` query fails.
  - Returns default state `{ allocation: 0, purchasedPacks: 0, used: 0, remaining: 0, remainingRatio: 0 }` if subscription not found (safe fallback).
  - **PGRST205 error:** If `subscriptions` or `token_usage` tables don't exist, queries will fail → throws.
- **Severity in local-only mode:** `BLOCKING` (throws, no fallback for missing tables)
- **Supabase tables touched:**
  - `subscriptions` (direct query)
  - `token_usage` (direct query)
- **Main call sites / feature:**
  - Called from `/api/insights/patterns`, `/api/insights/generate`, token checking flows.
- **Desired behaviour in Path B:**
  - If `subscriptions` or `token_usage` tables don't exist or Supabase unavailable:
    - Return default state `{ allocation: 0, purchasedPacks: 0, used: 0, remaining: 0, remainingRatio: 0 }`.
    - Never throw; always return a valid `TokenState` object.

### 4.3 `MOBILE/lib/tokens/chargeTokens.ts` – `chargeTokens()`

- **What it does:** Charges tokens from user's allocation or balance, updates `subscriptions` and `token_usage` tables.
- **Auth / userId / Supabase dependency:**
  - Queries `subscriptions` table for current allocation/balance.
  - Updates `subscriptions` table with new `monthly_token_allocation_used` and `token_balance`.
  - Inserts into `token_usage` table to log the charge.
  - Requires `supabaseAdmin` to be configured.
- **Failure behaviour (no auth / no token rate / missing tables):**
  - Throws `TokenError("Unable to load subscription", ...)` if `subscriptions` query fails.
  - Throws `TokenError("SUBSCRIPTION_NOT_FOUND")` if subscription not found.
  - Throws `TokenError("INSUFFICIENT_TOKENS")` if monthly cap or hard cap exceeded.
  - Throws if `subscriptions` update fails.
  - Throws if `token_usage` insert fails.
  - **PGRST205 error:** If `subscriptions` or `token_usage` tables don't exist, operations will fail → throws.
- **Severity in local-only mode:** `BLOCKING` (throws, no fallback)
- **Supabase tables touched:**
  - `subscriptions` (query + update)
  - `token_usage` (insert)
- **Main call sites / feature:**
  - Called from `/api/insights/patterns`, `/api/insights/generate`, AI agent calls.
- **Desired behaviour in Path B:**
  - If `subscriptions` or `token_usage` tables don't exist or Supabase unavailable:
    - Skip token charging entirely (no-op).
    - Never throw; silently skip token tracking in local-only mode.

---

## 5. MEMORY & TRAITS

### 5.1 `MOBILE/lib/memory/lastActive.ts` – `getUserLastActive()`, `getDaysSinceLastActive()`

- **What it does:** Reads `last_active` table to determine days since last activity.
- **Auth / userId / Supabase dependency:**
  - Queries `last_active` table via `fromSafe("last_active").select("last_active_at, last_active").eq("id", userId).maybeSingle()`.
  - Requires `supabaseAdmin` to be configured.
- **Failure behaviour (no auth / no token rate / missing tables):**
  - Returns `0` or `null` if `userId` is null or `supabaseAdmin` is null (early guards).
  - Returns `0` or `null` if query fails (wrapped in try/catch, logs warning).
  - **PGRST205 error:** If `last_active` table doesn't exist, query will fail → returns `0`/`null` (safe).
- **Severity in local-only mode:** `SAFE` (already degrades gracefully)
- **Supabase tables touched:**
  - `last_active` (direct query)
- **Main call sites / feature:**
  - Called from memory/persona synthesis flows.
- **Desired behaviour in Path B:**
  - Already safe: returns `0`/`null` if table missing or Supabase unavailable.

### 5.2 `MOBILE/lib/traits/adaptiveTraits.ts` – `getUserTraits()`, `collectTraitSignals()`

- **What it does:** Computes trait scores from check-ins, journals, loops, distortions, patterns.
- **Auth / userId / Supabase dependency:**
  - Calls `loadServerPersonaSettings(userId)` → queries `vella_settings` and `profiles` tables.
  - Calls `generateEmotionalPatterns(userId, ...)` → may require auth for AI calls.
  - Uses local storage for trait snapshots (already local-first).
- **Failure behaviour (no auth / no token rate / missing tables):**
  - May throw if `loadServerPersonaSettings()` fails (not all calls wrapped).
  - May throw if `generateEmotionalPatterns()` fails (depends on `/api/insights/patterns`).
  - Falls back to local trait snapshots if computation fails.
- **Severity in local-only mode:** `DEGRADED` (may throw but has local fallback)
- **Supabase tables touched (directly or via helpers):**
  - `vella_settings` (via `loadServerPersonaSettings`)
  - `profiles` (via `loadServerPersonaSettings`)
- **Main call sites / feature:**
  - Called from `/api/forecast`, trait display flows.
- **Desired behaviour in Path B:**
  - If `vella_settings` or `profiles` tables don't exist or Supabase unavailable:
    - Use default persona settings.
    - Compute traits from local data only.
    - Never throw; always return trait scores (default or computed).

---

## 6. NUDGES & CONNECTION INDEX

### 6.1 `MOBILE/app/api/connection-index/route.ts` – `GET`

- **What it does:** Returns connection dashboard data (depth, patterns, insights).
- **Auth / userId / Supabase dependency:**
  - Calls `requireUserId()` → hard requires Supabase auth session.
  - Calls `getConnectionDashboard(userId)` → may require Supabase for depth data.
- **Failure behaviour (no auth / no token rate / missing tables):**
  - Returns 401 if `requireUserId()` throws (wrapped in try/catch).
  - May return 500 if `getConnectionDashboard()` throws (not fully wrapped).
- **Severity in local-only mode:** `BLOCKING`
- **Supabase tables touched:** Unknown (depends on `getConnectionDashboard` implementation)
- **Main call sites / feature:**
  - Called from connection index dashboard.
- **Desired behaviour in Path B:**
  - If there is no userId or Supabase unavailable:
    - Skip Supabase calls.
    - Return dashboard derived from local data only.
    - Never throw; always return a valid dashboard object.

### 6.2 `MOBILE/app/api/nudge/route.ts` – `POST`

- **What it does:** Generates nudges based on user state.
- **Auth / userId / Supabase dependency:**
  - Calls `requireUserId()` → hard requires Supabase auth session.
  - May require token checking and charging.
- **Failure behaviour (no auth / no token rate / missing tables):**
  - Returns 401 if `requireUserId()` throws.
  - May return 500 if token operations fail.
- **Severity in local-only mode:** `BLOCKING`
- **Supabase tables touched:** Unknown (depends on implementation)
- **Main call sites / feature:**
  - Called from nudge generation flows.
- **Desired behaviour in Path B:**
  - If there is no userId or Supabase unavailable:
    - Skip Supabase calls.
    - Return nudges derived from local data only.
    - Never throw; always return valid nudges (or empty array).

---

## 7. MISC AUTH-DEPENDENT ROUTES

### 7.1 All API routes using `requireUserId()`

The following API routes hard-require auth via `requireUserId()` and will return 401/500 if auth fails:

- `/api/insights/patterns` (POST) – **BLOCKING**
- `/api/insights/generate` (POST) – **BLOCKING**
- `/api/forecast` (GET, POST) – **BLOCKING**
- `/api/connection-index` (GET) – **BLOCKING**
- `/api/nudge` (POST) – **BLOCKING**
- `/api/identity` (GET) – **BLOCKING**
- `/api/weekly-review` (GET) – **BLOCKING**
- `/api/traits` (GET, POST) – **BLOCKING**
- `/api/reflection` (POST) – **BLOCKING**
- `/api/patterns` (POST) – **BLOCKING**
- `/api/life-themes` (GET) – **BLOCKING**
- `/api/journal-themes` (GET) – **BLOCKING**
- `/api/cognitive-distortions` (GET) – **BLOCKING**
- `/api/behaviour-loops` (GET) – **BLOCKING**
- `/api/strengths-values` (GET) – **BLOCKING**
- `/api/growth-roadmap` (GET) – **BLOCKING**
- `/api/strategy` (POST) – **BLOCKING**
- `/api/progress` (GET, POST) – **BLOCKING**
- `/api/goals` (GET, POST, PUT, DELETE) – **BLOCKING**
- `/api/deepdive` (POST) – **BLOCKING**
- `/api/architect` (POST) – **BLOCKING**
- `/api/prediction` (POST) – **BLOCKING**
- `/api/clarity` (POST) – **BLOCKING**
- `/api/emotion-intel` (POST) – **BLOCKING**
- `/api/compass` (POST) – **BLOCKING**
- `/api/regulation` (POST) – **BLOCKING**
- `/api/journal` (GET, POST, PUT, DELETE) – **BLOCKING**
- `/api/roadmap` (GET) – **BLOCKING**
- `/api/loops` (GET) – **BLOCKING**
- `/api/deep-insights` (GET, POST) – **BLOCKING**
- `/api/connection-depth` (GET, POST) – **BLOCKING**
- `/api/distortions` (GET) – **BLOCKING**
- `/api/themes` (GET) – **BLOCKING**
- `/api/vella/text` (POST) – **BLOCKING**
- `/api/audio/vella` (POST) – **BLOCKING**
- `/api/voice/speak` (POST) – **BLOCKING**
- `/api/stripe/create-checkout-session` (POST) – **BLOCKING** (expected, payment flow)
- `/api/stripe/token-pack` (POST) – **BLOCKING** (expected, payment flow)
- `/api/realtime/token` (GET) – **BLOCKING**
- `/api/account/delete` (POST) – **BLOCKING** (expected, account deletion)
- `/api/account/export` (GET) – **BLOCKING** (expected, account export)

**All of these will return 401 or 500 if `requireUserId()` throws or if Supabase tables are missing.**

---

## 8. SPECIAL FLAGS

### 8.1 All places that still call `signInAnonymously`

1. **`MOBILE/lib/supabase/server-auth.ts` – `requireUserId()`**
   - Calls `supabase.auth.signInAnonymously()` as fallback if no user exists.
   - **Severity:** `BLOCKING` (throws if anonymous sign-in disabled or fails)

2. **`MOBILE/lib/hooks/useCheckins.ts` – `requireUserId()` (local helper)**
   - Calls `supabase.auth.signInAnonymously()` as fallback if no user exists.
   - **Severity:** `BLOCKING` (throws if anonymous sign-in disabled or fails)

3. **`MOBILE/middleware.ts`**
   - Calls `supabase.auth.signInAnonymously()` if no session exists.
   - **Severity:** `BLOCKING` (may block page loads if anonymous sign-in disabled)

4. **`MOBILE/lib/auth/ensureVellaSessionServer.ts`**
   - Calls `supabase.auth.signInAnonymously()` if no session exists.
   - **Severity:** `BLOCKING`

5. **`MOBILE/lib/auth/ensureVellaSession.ts`**
   - Calls `supabase.auth.signInAnonymously()` if no session exists.
   - **Severity:** `BLOCKING`

6. **`MOBILE/lib/auth/ensureAnonSession.ts`**
   - Calls `client.auth.signInAnonymously()`.
   - **Severity:** `BLOCKING`

7. **`MOBILE/lib/auth/ensureSession.ts`**
   - Calls `anyAuth.signInAnonymously()` if available.
   - **Severity:** `BLOCKING`

### 8.2 All places that still call `requireUserId` and THROW on missing session

**All API routes listed in section 7.1** call `requireUserId()` which throws `UnauthenticatedError` if auth fails.

**Additional places:**
- `MOBILE/lib/supabase/server-auth.ts` – `requireUserId()` throws if both `getUser()` and `signInAnonymously()` fail.
- `MOBILE/lib/hooks/useCheckins.ts` – `requireUserId()` (local helper) throws if both fail (but wrapped in try/catch by callers).

### 8.3 All API routes that return 500 when Supabase tables are missing (PGRST205) instead of falling back

**Routes that will return 500 if tables are missing:**

1. **`/api/insights/patterns`** – Returns 500 if `token_rates`, `subscriptions`, or `token_usage` tables missing.
2. **`/api/insights/generate`** – Returns 500 if `token_rates`, `subscriptions`, `token_usage`, or `vella_settings` tables missing.
3. **`/api/forecast`** – Returns 500 if `user_goals` or other tables missing (via `getBehaviourLoops`, `listGoals`, etc.).
4. **`/api/goals`** – Returns 500 if `user_goals` or `user_goal_actions` tables missing (PGRST205).
5. **Any route calling `getTokenCost()`** – Returns 500 if `token_rates` table missing (TOKEN_RATE_NOT_FOUND).
6. **Any route calling `getUserTokenState()`** – Returns 500 if `subscriptions` or `token_usage` tables missing.
7. **Any route calling `chargeTokens()`** – Returns 500 if `subscriptions` or `token_usage` tables missing.

### 8.4 All places that throw `TOKEN_RATE_NOT_FOUND`

1. **`MOBILE/lib/tokens/getTokenCost.ts` – `getTokenCost()`**
   - Throws `Error("TOKEN_RATE_NOT_FOUND")` if `token_rates` query fails or no row found.
   - **Severity:** `BLOCKING`

**Called from:**
- `/api/insights/patterns`
- `/api/insights/generate`
- `/lib/ai/agents`
- `/lib/ai/reflection`
- `/lib/memory/summariser`

### 8.5 Any place where errors from Supabase are not wrapped by the new `handleTableFailure` / fallback utilities

**Functions that throw Supabase errors without fallback:**

1. **`MOBILE/lib/tokens/getTokenCost.ts` – `getTokenCost()`**
   - Throws if `token_rates` query fails (no fallback).

2. **`MOBILE/lib/tokens/getUserTokenState.ts` – `getUserTokenState()`**
   - Throws if `subscriptions` or `token_usage` queries fail (no fallback for missing tables).

3. **`MOBILE/lib/tokens/chargeTokens.ts` – `chargeTokens()`**
   - Throws if `subscriptions` query/update fails or `token_usage` insert fails (no fallback).

4. **`MOBILE/lib/goals/goalEngine.ts` – `listGoalActions()`, `addGoalAction()`, `updateGoalActionStatus()`**
   - Throws if `user_goal_actions` queries fail (some functions return empty/null, but some throw).

5. **`MOBILE/lib/supabase/server-auth.ts` – `requireUserId()`**
   - Throws `UnauthenticatedError` if both `getUser()` and `signInAnonymously()` fail (no fallback).

6. **`MOBILE/lib/insights/behaviourLoops.ts` – `detectBehaviourLoops()`**
   - May throw if `getUserPlanTier()`, `loadServerPersonaSettings()`, or `generateEmotionalPatterns()` fail (not all wrapped).

7. **`MOBILE/lib/traits/adaptiveTraits.ts` – `getUserTraits()`, `collectTraitSignals()`**
   - May throw if `loadServerPersonaSettings()` or `generateEmotionalPatterns()` fail (not all wrapped).

---

## 9. HOTLIST: TOP 10 BLOCKING CALLS

1. **[BLOCKING]** `MOBILE/lib/supabase/server-auth.ts` – `requireUserId()` – Throws if auth fails, blocks all API routes
2. **[BLOCKING]** `MOBILE/lib/tokens/getTokenCost.ts` – `getTokenCost()` – Throws `TOKEN_RATE_NOT_FOUND` if `token_rates` table missing
3. **[BLOCKING]** `MOBILE/lib/tokens/getUserTokenState.ts` – `getUserTokenState()` – Throws if `subscriptions` or `token_usage` tables missing
4. **[BLOCKING]** `MOBILE/lib/tokens/chargeTokens.ts` – `chargeTokens()` – Throws if `subscriptions` or `token_usage` tables missing
5. **[BLOCKING]** `MOBILE/lib/loops/getBehaviourLoops.ts` – `getBehaviourLoops()` – Throws `loops.map is not a function` if `detectBehaviourLoops()` returns non-array
6. **[BLOCKING]** `MOBILE/app/api/insights/patterns/route.ts` – `POST` – Returns 500 if auth/token rate/tables missing
7. **[BLOCKING]** `MOBILE/app/api/insights/generate/route.ts` – `POST` – Returns 500 if auth/token rate/tables missing
8. **[BLOCKING]** `MOBILE/app/api/forecast/route.ts` – `GET`/`POST` – Returns 500 if auth/tables missing, plus `loops.map` bug
9. **[BLOCKING]** `MOBILE/lib/goals/goalEngine.ts` – `listGoalActions()`, `addGoalAction()`, `updateGoalActionStatus()` – Throws if `user_goal_actions` table missing
10. **[BLOCKING]** All `signInAnonymously()` calls – Fail if anonymous sign-ins are disabled in Supabase

---

## 10. SUMMARY STATISTICS

- **Total API routes requiring auth:** ~40+
- **Total functions throwing on missing tables:** ~15+
- **Total places calling `signInAnonymously`:** 7
- **Total places throwing `TOKEN_RATE_NOT_FOUND`:** 1 (but called from 5+ places)
- **BLOCKING issues:** ~30+
- **DEGRADED issues:** ~10+
- **SAFE issues:** ~5+

---

## 11. RECOMMENDED FIX PRIORITY

### Phase 1 (Critical - App won't work without these):
1. Fix `requireUserId()` to not throw (return `null` or use `ensureUserId` fallback)
2. Fix `getTokenCost()` to return default cost instead of throwing
3. Fix `getUserTokenState()` to return default state instead of throwing
4. Fix `chargeTokens()` to be no-op instead of throwing
5. Fix `getBehaviourLoops()` `.map()` bug (check if array before mapping)

### Phase 2 (High - Core features broken):
6. Make all API routes handle missing auth gracefully (return lite/empty data)
7. Remove all `signInAnonymously()` calls (use `ensureUserId` instead)
8. Make `goalEngine` functions return empty/null instead of throwing
9. Make `behaviourLoops` and `adaptiveTraits` never throw (always return safe defaults)

### Phase 3 (Medium - Nice to have):
10. Add fallback wrappers for all Supabase table queries
11. Add `handleTableFailure` utility for PGRST205 errors
12. Audit all remaining API routes for graceful degradation

---

**End of Audit Report**

