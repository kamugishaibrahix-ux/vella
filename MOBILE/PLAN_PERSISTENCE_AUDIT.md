# Plan persistence audit — source of truth and fixes

## STEP 1 — Source of truth

| File | Function / location | What it reads | True source? | Risk of staleness? |
|------|---------------------|---------------|--------------|--------------------|
| `lib/tiers/server.ts` | `getUserPlanTier` | `subscriptions.plan` via `fromSafe` (optional Redis 60s) | **Yes** (DB) | Redis 60s TTL; webhook invalidates |
| `app/api/account/plan/route.ts` | GET handler | `getUserPlanTier(userId)` | **Yes** | No |
| `lib/hooks/useAccountPlan.ts` | `performFetch` | GET `/api/account/plan` | **Yes** (via API) | Only after fetch completes; 401/error sets "free" |
| `lib/hooks/useUserSettings.ts` | `useState` init, `fetchSettings` | `loadLocalMemory().plan` | No (localStorage) | **Yes** — never fetched from server |
| `app/session/page.tsx` | `effectivePlanName` | `accountPlan.plan?.name ?? safeMemoryProfile.plan` | Server first, then cache | **Race:** cache used until `accountPlan` loads |
| `app/settings/account-plan/page.tsx` | `planTier` | `accountPlan.plan?.name ?? localPlan` | Server first | `localPlan` from `loadLocalMemory()` on mount |
| `lib/memory/localMemory.ts` | `loadLocalMemory` | `localStorage` key `vella_memory_v1` (includes `plan`) | No | **Yes** — can override until synced from server |
| Middleware | — | Does not set plan | — | — |

**Canonical source:** Supabase `public.subscriptions.plan`. Server reads via `getUserPlanTier()` (DB, optional Redis cache). Client should only use plan from GET `/api/account/plan`; local memory may hold a copy but must not override server once resolved.

---

## STEP 2 — Stripe webhook verification

- **Handler:** `app/api/stripe/webhook/route.ts` (POST).
- **Events:** `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `payment_intent.succeeded`.
- **Table updated:** `public.subscriptions`.
- **Columns:** `plan`, `status`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_start`, `current_period_end`; on delete `plan` set to `"free"`.
- **Idempotency:** `isEventProcessed(event.id)` before handling; `markEventProcessed(event.id, event.type)` after (lines 70–74, 95–99).
- **Cache invalidation:** `invalidateSubscriptionPlanCache(userId)` in `upsertSubscriptionForUser` and `handleSubscriptionDeleted` (lines 185, 322).
- **Errors:** Logged via `safeErrorLog`; handlers return without throwing so response is 200.

**Verdict:** Webhook updates DB correctly; cache invalidated; idempotency and logging in place.

---

## STEP 3 — Plan resolution logic

- **Server:** `getUserPlanTier(userId)` in `lib/tiers/server.ts` reads `subscriptions.plan` (optional Redis 60s). No `serverLocal` for plan. API routes use `getUserPlanTier`; no in-memory plan store.
- **Client:** Plan comes from `useAccountPlan()` → GET `/api/account/plan` (server reads DB each request). No client-side persistence of plan except inside `vella_memory_v1` (localStorage) and `useUserSettings.planTier` (initialized from local only).

---

## STEP 4 — Client-side override detection

- **localStorage:** Plan stored inside `vella_memory_v1` (MemoryProfile.plan). Used as `cachedPlanName` on session page and as sole source for `useUserSettings.planTier` → **risk:** overrides server until user visits account-plan (which syncs server → local) or until we fix sync on load.
- **Initial “free”:** `useAccountPlan` sets `plan: planFromApiName("free")` on 401 or fetch error (lines 79–95). Session page uses `effectivePlanName = planNameFromSupabase ?? cachedPlanName` so before fetch completes, `cachedPlanName` (possibly stale) is used.
- **SSR:** Session page is client component; no SSR plan resolution.
- **Middleware:** Does not set default plan.
- **Fallback to free:** Happens when (1) API returns 401/error, (2) `accountPlan.plan` is null and cache is used (cache can be "free"), (3) `useUserSettings.planTier` from local only.

---

## STEP 5 — Auth refresh after Stripe success

- **Current:** Redirect to `/session?upgrade=success` → session page runs `accountPlan.refetch()` and `router.replace("/session", { scroll: false })`.
- **Missing:** No `router.refresh()` (server components / RSC data not refreshed). No explicit `supabase.auth.getSession()` (not required for plan; refetch is sufficient if we ensure refetch runs and UI uses result).

---

## STEP 6 — Implemented fixes

1. **useAccountPlan:** When plan is received from API (res.ok), call `updatePlan(planName, { refresh: false })` so local memory and any reader (e.g. useUserSettings) get server truth.
2. **useUserSettings:** Use `useAccountPlan()`; when `!accountPlan.loading && accountPlan.plan?.name`, set `planTier` from server so client never relies on local-only plan for display after load.
3. **Session page:** For entitlements (premium features), treat as free until plan is resolved (`!accountPlan.loading`). Add `router.refresh()` on `upgrade=success` after refetch.
4. **No schema or webhook changes.** No removal of localStorage plan key; it is overwritten from server when plan is fetched.

---

## Root cause

- Plan **persists** in DB and is correct after webhook.
- After full reload, **client** initializes `useUserSettings.planTier` and session `effectivePlanName` from **localStorage** (and cache) before `/api/account/plan` completes. If cache was "free" or stale, UI and entitlements can show free until refetch completes; and `useUserSettings.planTier` was **never** updated from server, so components using it stayed stale unless the user visited account-plan (which syncs server → local).

## Confirmation after fixes

- **Refresh keeps plan:** GET `/api/account/plan` runs on load; result is synced to local and used for `planTier` and session entitlements.
- **Downgrade reflects:** Webhook sets `plan` / status; cache invalidated; next `getUserPlanTier` and client refetch see DB truth.
- **No race:** Entitlements use server plan only when `!accountPlan.loading`.
- **No client override:** Server plan overwrites local when fetched; useUserSettings and session use server plan when loaded.
- **No stale cache:** Redis invalidated on webhook; client does not trust cache for entitlements until server response is in.
