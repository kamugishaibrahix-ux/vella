# Plan Persistence & Vella Voice Gating — Forensic Audit Report

**Scope:** Plan switching logic, persistence, entitlement resolution, Vella Voice gating, Stripe checkout + token-pack, Supabase metadata storage.  
**Rules:** Read-only; no code changes or patch suggestions. Evidence with file + line references only.

---

## SECTION 1 — Plan Source of Truth

### 1.1 Where current plan is stored

| Location | Evidence |
|----------|----------|
| **Supabase DB** | `public.subscriptions` table, column `plan` (type `subscription_plan`: 'free' \| 'pro' \| 'elite'). Default `'free'`. Migration: `supabase/migrations/20241117_add_core_tables.sql` lines 21–24, 24. |
| **Server-side cache** | `getUserPlanTier()` reads from `serverLocalGet(\`subscriptions:${userId}\`)` — filesystem `.vella/subscriptions:${userId}.json`. **This key is never written anywhere in the codebase.** `MOBILE/lib/tiers/server.ts` lines 5–9. |
| **Client localStorage** | `MemoryProfile.plan` in local memory (e.g. `loadLocalMemory()` / `saveLocalMemory()`). Stored via `MOBILE/lib/memory/localMemory.ts`. Default in `DEFAULT_MEMORY_PROFILE.plan` is `"free"`: `MOBILE/lib/memory/types.ts` line 152. |

### 1.2 Where plan is read on session load

| Consumer | Source | File:Line |
|----------|--------|-----------|
| **Server APIs** | `getUserPlanTier(userId)` → `serverLocalGet(\`subscriptions:${userId}\`)` → **always null** (file never exists) → `row?.plan ?? "free"` → **always `"free"`** | `MOBILE/lib/tiers/server.ts` 5–13 |
| **Client UI (session, pricing, account-plan)** | `useAccountPlan()` → **never calls Supabase or any API**; sets `plan: { name: "free", ... }` in state | `MOBILE/lib/hooks/useAccountPlan.ts` 42–70 |
| **Session page plan resolution** | `planNameFromSupabase = accountPlan.plan?.name ?? null` → `"free"`; `cachedPlanName = safeMemoryProfile.plan ?? "free"`; `effectivePlanName = planNameFromSupabase ?? cachedPlanName` → **always `"free"`** (first branch wins) | `MOBILE/app/session/page.tsx` 220–226 |
| **Account-plan page** | `planTier = planOverride ?? resolvePlanTier(accountPlan.plan?.name ?? localPlan)`; `accountPlan.plan?.name` is always `"free"` | `MOBILE/app/settings/account-plan/page.tsx` 94–96 |
| **VellaProvider** | `memoryProfile` initialized from `loadLocalMemory()` once; no re-fetch of plan from backend | `MOBILE/lib/realtime/VellaProvider.tsx` 53–55 |

### 1.3 Where default FREE plan is set

| Location | Evidence |
|----------|----------|
| **DB schema** | `plan subscription_plan not null default 'free'` — `supabase/migrations/20241117_add_core_tables.sql` line 24. |
| **Server tier resolution** | `return resolvePlanTier(row?.plan ?? "free")` and on catch `return "free"` — `MOBILE/lib/tiers/server.ts` 9, 12. |
| **Plan utils** | `resolvePlanTier(planName?)` returns `"free"` when `!planName` or not "pro"/"elite" — `MOBILE/lib/tiers/planUtils.ts` 7–12. |
| **useAccountPlan** | Initial fetch sets `plan: { name: "free", status: "active", ... }` — `MOBILE/lib/hooks/useAccountPlan.ts` 60–67. |
| **Session page** | `cachedPlanName = safeMemoryProfile.plan ?? "free"` — `MOBILE/app/session/page.tsx` 222. |
| **Validation schemas** | `planTier: z.enum(["free", "pro", "elite"]).default("free")` — `MOBILE/lib/security/validationSchemas.ts` 103, 133. |
| **DEFAULT_MEMORY_PROFILE** | `plan: "free"` — `MOBILE/lib/memory/types.ts` 152. |
| **useRealtimeVella** | Default options `{ planTier: "free" }` — `MOBILE/lib/realtime/useRealtimeVella.ts` 257, 264. |
| **useTokenUsage** | `resolvePlanTier(accountPlan.plan?.name ?? "free")` — `MOBILE/lib/hooks/useTokenUsage.ts` 12. |
| **normalizePlanName (useAccountPlan)** | Any value not "pro"/"elite" returns `"free"` — `MOBILE/lib/hooks/useAccountPlan.ts` 34–37. |

### 1.4 Answers

- **Canonical source of plan truth (intended):** Supabase `public.subscriptions.plan` — updated by Stripe webhook. Comment in code: `MOBILE/lib/tiers/planUtils.ts` line 5: "Supabase subscriptions.plan is the source of truth."
- **Actual source used by server:** `serverLocalGet(\`subscriptions:${userId}\`)` — **never populated**; no `serverLocalSet("subscriptions:...")` exists anywhere. So server-side plan is **always** the fallback.
- **FREE hardcoded fallback:** Yes. Every read path falls back to `"free"` when data is missing or when client hook returns default.
- **Logic like `plan ?? "free"`:** Yes — `MOBILE/lib/tiers/server.ts` line 9: `row?.plan ?? "free"`; session page line 222: `safeMemoryProfile.plan ?? "free"`; and equivalent in hooks/APIs above.

---

## SECTION 2 — Plan Switch Flow

### 2.1 UI interaction → API route

- User selects plan (e.g. Plan Switcher or pricing) → checkout is created via **POST `/api/stripe/create-checkout-session`** with body `{ plan, email }`.  
- **File:** `MOBILE/app/api/stripe/create-checkout-session/route.ts` (lines 13–71).  
- Session created with `client_reference_id: userId`, `metadata: { user_id: userId, supabase_user_id: userId }` (lines 54–68). Success redirect: `{origin}/session?upgrade=success` (line 62).

### 2.2 Does the switch call Stripe / update DB / metadata / localStorage?

| Step | What happens | Evidence |
|------|----------------|----------|
| **Stripe** | Yes. Checkout session created; user pays on Stripe. | `create-checkout-session/route.ts` 52–69. |
| **DB** | Only via **webhook**, not in the checkout route. Checkout route does not write to Supabase. | Webhook: `MOBILE/app/api/stripe/webhook/route.ts` — `handleCheckoutSession` → `upsertSubscriptionForUser` / `upsertSubscriptionByCustomer` (lines 106–134, 281–309). |
| **Supabase user metadata** | No. Plan is stored in `public.subscriptions` (table), not in `auth.users` or user app_metadata. | Schema and webhook upsert only. |
| **Local storage** | Not by checkout or webhook. Client would need to refetch plan and call `syncLocalPlan()` / `updatePlan()`; **no refetch exists** (see below). | `localMemory.ts` `updatePlan` / `syncLocalPlan` exist but are only called from account-plan page when `accountPlan.plan?.name` is set — and that is always `"free"`. |

### 2.3 After switch: what updates the session? Cache invalidation? Re-fetch? Optimistic UI?

- **No API is called by the client to fetch subscription/plan after login or after checkout.**  
- **useAccountPlan** does not call Supabase or any `/api/*`; it only sets default `plan: { name: "free", ... }`.  
  **File:** `MOBILE/lib/hooks/useAccountPlan.ts` 44–70 (no fetch to subscriptions or plan API).
- **No cache invalidation** of server-side plan: `serverLocalSet(\`subscriptions:${userId}\`, ...)` is **never** called anywhere.
- **No re-fetch after checkout success:** Redirect to `/session?upgrade=success` exists; no handler in session page or elsewhere refetches plan or invalidates caches (grep `upgrade=success` / `upgrade` in `MOBILE/app/session` shows no refetch logic).
- **Optimistic UI:** Account-plan page has `planOverride` state and `syncLocalPlan(planName)` in a `useEffect` that runs when `accountPlan.plan?.name` is set — but that is always `"free"`, so the sync **writes "free"** into local memory.  
  **File:** `MOBILE/app/settings/account-plan/page.tsx` 125–131: "Keep local MemoryProfile.plan in sync with Supabase subscriptions.plan" — but the value synced is `accountPlan.plan?.name`, which is never loaded from Supabase.

### 2.4 Where plan state is set after successful checkout

- **Backend:** Plan is set only in Supabase by the **Stripe webhook** (`checkout.session.completed` → `handleCheckoutSession` → `upsertSubscriptionForUser` with `payload.plan` from `planFromSubscription(stripeSubscription)`).  
  **File:** `MOBILE/app/api/stripe/webhook/route.ts` 106–134, 260–263, 281–308.
- **Client:** There is **no** code path that, after checkout success, fetches the new plan from an API or Supabase and updates React state or localStorage. So plan state on the client remains whatever it was (default "free" from useAccountPlan and, if ever synced, "free" from the account-plan useEffect).

---

## SECTION 3 — Stripe Flow Verification

### 3.1 After successful checkout

- **Webhook that updates plan:** `checkout.session.completed` → `handleCheckoutSession` → `upsertSubscriptionForUser(userId, payload)` or `upsertSubscriptionByCustomer(customerId, payload)`.  
  **File:** `MOBILE/app/api/stripe/webhook/route.ts` 75–78, 106–134.
- **DB field updated:** `public.subscriptions`: `plan`, `status`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_start`, `current_period_end` (upsert by `user_id` or insert new row).  
  **File:** same webhook route, `buildSubscriptionPayload` 266–280, `upsertSubscriptionForUser` 281–309.
- **Idempotency:** Events are checked with `isEventProcessed(event.id)` and marked with `markEventProcessed(event.id, event.type)`. Processed events are skipped.  
  **File:** `MOBILE/app/api/stripe/webhook/route.ts` 67–72, 92–96; `MOBILE/lib/payments/webhookIdempotency.ts`.

### 3.2 Does the UI wait for the webhook?

- **No.** The UI redirects to `/session?upgrade=success` and does not wait for a webhook or poll for plan change. There is no client code that subscribes to webhook completion or refetches plan after redirect.

### 3.3 Does the UI assume immediate plan change without backend confirmation?

- **Yes.** The UI has no way to show "updated" plan after checkout because it never fetches plan from the backend. So effectively it always shows the default (free) regardless of webhook; it does not assume immediate change — it simply never receives the updated plan.

### 3.4 Trace: create-checkout-session, webhook, plan update

| Step | File | Relevant lines |
|------|------|-----------------|
| Create session | `MOBILE/app/api/stripe/create-checkout-session/route.ts` | POST, requireUserId, rate limit, create session with `client_reference_id: userId`, metadata `user_id`, `supabase_user_id`, success_url with `upgrade=success`. |
| Webhook POST | `MOBILE/app/api/stripe/webhook/route.ts` | Verify signature, idempotency, switch on `event.type`; `checkout.session.completed` → `handleCheckoutSession`. |
| handleCheckoutSession | Same file | 106–134: get `userId` from `client_reference_id` / metadata; retrieve Stripe subscription; `planFromSubscription`; `upsertSubscriptionForUser(userId, payload)` or `upsertSubscriptionByCustomer(customerId, payload)`. |
| planFromSubscription | Same file | 260–263: map price ID to plan via `PRICE_TO_PLAN[priceId]` else `"free"`. |
| upsertSubscriptionForUser | Same file | 281–308: select by `user_id`; update or insert into `subscriptions` with payload (includes `plan`). |
| Plan read on server | `MOBILE/lib/tiers/server.ts` | `getUserPlanTier` uses `serverLocalGet(\`subscriptions:${userId}\`)` — **not** Supabase — so webhook-updated DB is never read by tier logic. |

---

## SECTION 4 — Entitlement Resolution (Vella Voice)

### 4.1 Where access to Vella Voice is checked

| Layer | Location | Condition |
|-------|----------|-----------|
| **Session page (UI)** | `MOBILE/app/session/page.tsx` 542–547 | `canUseAudioTools = !isFreeTier && isFeatureAllowed(planTier, "audio_ambient") && realtimeAudioControls.canUseAudio(planName)`. `showAudioUI = isVoiceMode && canUseAudioTools`. `planTier` and `planName` come from `effectivePlanName` / `planNameFromSupabase` / `cachedPlanName` — effectively **always "free"** (see Section 1.2). |
| **Realtime hook (start session)** | `MOBILE/lib/realtime/useRealtimeVella.ts` 1552–1569 | `if (planTier === "free" && enableMic)` → block and show "Continuous voice is available on Pro and Elite plans." `planTier` is passed in from session page (line 471) — same `planTier` derived from `effectivePlanName` → **always "free"**. |
| **canUseAudio** | `MOBILE/lib/realtime/useRealtimeVella.ts` 2151–2154 | `canPlanUseAudio(planName)`: `mapPlanToTier(planName ?? "free")` then `tier === "pro" \|\| tier === "elite"`. So only pro/elite return true. |
| **Realtime API (offer)** | `MOBILE/app/api/realtime/offer/route.ts` 29–34 | `getUserPlanTier(userId)` → **always "free"** (server); `checkTokenAvailability(userId, planTier, ...)` — uses free-tier limits. No explicit "reject free users" block; enforcement is token limits. |
| **Realtime API (token)** | `MOBILE/app/api/realtime/token/route.ts` | Same pattern: `getUserPlanTier` → free; token check with free limits. |

### 4.2 What condition determines access

- **Client:** `!isFreeTier && isFeatureAllowed(planTier, "audio_ambient") && canUseAudio(planName)`. With `planTier` and `planName` always "free", `isFreeTier` is true, so `canUseAudioTools` is **false** and voice UI is effectively gated (audio tools hidden/locked). Starting a voice session is blocked in the hook when `planTier === "free" && enableMic`.
- **Server:** Plan is always "free" from `getUserPlanTier`, so realtime APIs apply **free** token/usage limits. They do not explicitly deny free users; they only enforce limits.

### 4.3 Does it check user.plan / token quota / subscription active / local flag / cached value?

- **Client:** Uses `accountPlan.plan?.name` (always "free") and `safeMemoryProfile.plan` (local cache, default "free"); combined into `effectivePlanName` / `planTier` / `planName`. No direct subscription status or token quota for gating the **visibility** of the voice UI; quota is used server-side for allow/deny of realtime operations.
- **Server:** Uses `getUserPlanTier(userId)` only — which reads serverLocal `subscriptions:userId` (never set) → always "free". No read of Supabase `subscriptions` in tier resolution.

### 4.4 Is entitlement derived from DB / session metadata / client localStorage?

- **Intended:** Supabase `public.subscriptions.plan` (DB).
- **Actual:**  
  - **Server:** From filesystem cache key `subscriptions:${userId}` that is **never written** → fallback "free".  
  - **Client:** From `useAccountPlan()` (hardcoded "free") and `MemoryProfile.plan` (localStorage); account-plan page syncs **from** `accountPlan.plan?.name` (always "free) **to** local, so local is overwritten with "free" when that effect runs.

---

## SECTION 5 — Fallback Logic

### 5.1 Search results and roles

| Pattern | Files / usage |
|--------|----------------|
| `"free"` default / fallback | `lib/tiers/server.ts` (row?.plan ?? "free", catch return "free"); `lib/tiers/planUtils.ts` (resolvePlanTier); `lib/hooks/useAccountPlan.ts` (plan.name "free", normalizePlanName); `app/session/page.tsx` (cachedPlanName ?? "free"); `lib/memory/types.ts` (DEFAULT_MEMORY_PROFILE.plan); `lib/realtime/useRealtimeVella.ts` (default planTier "free", canPlanUseAudio planName ?? "free"); validation schemas; reflection route planTier default. |
| `plan ?? "free"` / equivalent | `server.ts`: `row?.plan ?? "free"`; session: `safeMemoryProfile.plan ?? "free"`; useTokenUsage: `accountPlan.plan?.name ?? "free"`. |
| Hardcoded free tier | useAccountPlan initial state; DEFAULT_MEMORY_PROFILE; subscription_plan default in DB; webhook `planFromSubscription` return "free" when price not mapped. |

### 5.2 Under what condition plan becomes FREE

- **Server:** Whenever `serverLocalGet(\`subscriptions:${userId}\`)` returns null (file missing) or throws — which is **always** in current code, since the key is never set.
- **Client:** Whenever `accountPlan.plan?.name` is used (always "free") or when `safeMemoryProfile.plan` is null/undefined (then "free" in session page). After account-plan page effect, local plan is explicitly synced to `resolvePlanTier(planName)` where `planName` is `accountPlan.plan?.name` → "free".
- **Webhook:** On `customer.subscription.deleted`, subscription row is updated with `plan: "free"` — `MOBILE/app/api/stripe/webhook/route.ts` 157–174.

### 5.3 What triggers fallback

- **Server:** Absence of `.vella/subscriptions:${userId}.json` (and no code path ever creates it).
- **Client:** useAccountPlan never providing non-free data; optional chaining and `?? "free"` in every resolution path.

---

## SECTION 6 — Session / Cache Behaviour

### 6.1 Is plan read once at login and cached?

- **Server:** Plan is "read" on every `getUserPlanTier(userId)` call; the "cache" is `serverLocalGet(\`subscriptions:${userId}\`)`, which always returns null. So every request gets fallback "free". There is no login-time write to this cache.
- **Client:** "Plan" is set once in useAccountPlan's initial effect to hardcoded `{ name: "free", ... }`. There is no login-time fetch from API or Supabase. MemoryProfile is loaded from localStorage (e.g. VellaProvider, session page) and can be overwritten by account-plan sync to "free".

### 6.2 Stale plan state

- **Yes.** Supabase holds the correct plan after webhook, but: (1) server tier logic never reads Supabase, (2) client never fetches plan from API/Supabase, (3) account-plan page syncs the wrong value ("free") into local memory. So the only "fresh" truth is in Supabase; all consumers see stale "free".

### 6.3 Does requireUserId include plan info?

- **No.** `requireUserId` (e.g. `MOBILE/lib/supabase/server-auth`) returns user id for auth; it does not load or attach plan/subscription. Plan is obtained separately via `getUserPlanTier(userId)` (server) or useAccountPlan / memory profile (client).

### 6.4 React state defaulting to FREE before hydration

- **Yes.** useAccountPlan initial state is `loading: true`, then after the only effect runs it sets `plan: { name: "free", ... }`. So after first paint, plan is "free". There is no SSR of plan from server; session page uses client-side `accountPlan` and `safeMemoryProfile`, so plan is "free" until/unless local memory had something else — and the account-plan effect can then overwrite that to "free".

### 6.5 Auth provider / Plan context / usePlan / SSR vs client

- **No dedicated plan context.** Plan is derived from useAccountPlan() and/or MemoryProfile (localStorage) and passed as props (e.g. planTier into useRealtimeVella).  
- **useAccountPlan** is the only "plan" hook and it does not fetch; it only sets default free.  
- **SSR vs client:** Session and account-plan pages use client-side hooks and state; no evidence of server-rendered plan from DB. Stripe portal route does read `subscriptions` for `stripe_customer_id` only (`MOBILE/app/api/stripe/portal/route.ts` 61–64), not for plan display in the app.

---

## SECTION 7 — Final Output

### 1) Root Cause Hypothesis (most likely)

**The server-side plan used by all API routes is read from a cache key that is never written; the client-side plan is never loaded from the backend.**

- **Server:** `getUserPlanTier(userId)` in `MOBILE/lib/tiers/server.ts` reads `serverLocalGet(\`subscriptions:${userId}\`)`. There is **no** `serverLocalSet(\`subscriptions:${userId}\`, ...)` anywhere in the repo. So the file never exists, `data` is always null, and the code returns `resolvePlanTier(row?.plan ?? "free")` → **always "free"**. The Stripe webhook correctly updates **Supabase** `public.subscriptions.plan`, but no code path either (a) writes that value to the server-local cache or (b) reads plan from Supabase in `getUserPlanTier`. So server-side plan is always the fallback "free".

- **Client:** `useAccountPlan()` in `MOBILE/lib/hooks/useAccountPlan.ts` does not call Supabase or any plan/subscription API. Its only effect sets state to a hardcoded `plan: { name: "free", ... }`. So every UI that uses `accountPlan.plan?.name` (session page, account-plan page, pricing, useTokenUsage) sees "free". The account-plan page comment says it keeps "local MemoryProfile.plan in sync with Supabase subscriptions.plan", but it syncs **from** `accountPlan.plan?.name` (always "free") **to** local storage, so it actively overwrites local plan with "free". There is no refetch after checkout success; redirect to `/session?upgrade=success` does not trigger any plan reload.

Together, this explains why switching plans does not persist from the user’s perspective: the backend and UI never read the updated plan from the only place it is stored (Supabase), and the server tier path reads from a cache that is never populated.

### 2) Secondary Contributing Factors

- **refreshPlanFromSupabase** in `MOBILE/lib/memory/localMemory.ts` (235–239) is a no-op: it returns the current local profile without calling Supabase. So any caller expecting "refresh from DB" gets no update.
- **No API route** that returns the current subscription/plan for the authenticated user is used (or wired) by the client. The Stripe portal route reads `subscriptions` only for `stripe_customer_id`, not for plan.
- **Success redirect** after checkout goes to `/session?upgrade=success` but no handler refetches plan or invalidates caches, so the user lands on session with unchanged (free) plan state.
- **Default/fallback "free"** is applied at every layer (DB default, server catch, resolvePlanTier, useAccountPlan, session/page resolution), so any missing or unloaded data surfaces as "free".

### 3) Exact Files Involved

| Role | File |
|------|------|
| Server plan read (broken: wrong source) | `MOBILE/lib/tiers/server.ts` |
| Server local storage (read/write) | `MOBILE/lib/local/serverLocal.ts` |
| Client plan hook (no fetch, always free) | `MOBILE/lib/hooks/useAccountPlan.ts` |
| Local memory plan sync (no-op refresh; sync from free) | `MOBILE/lib/memory/localMemory.ts` |
| Session page plan resolution & voice gating | `MOBILE/app/session/page.tsx` |
| Account-plan page sync effect | `MOBILE/app/settings/account-plan/page.tsx` |
| Realtime hook plan gating | `MOBILE/lib/realtime/useRealtimeVella.ts` |
| Stripe checkout creation | `MOBILE/app/api/stripe/create-checkout-session/route.ts` |
| Stripe webhook (writes DB only) | `MOBILE/app/api/stripe/webhook/route.ts` |
| Plan utils / defaults | `MOBILE/lib/tiers/planUtils.ts`, `MOBILE/lib/tiers/tierCheck.ts` |
| Default memory profile | `MOBILE/lib/memory/types.ts` |
| Realtime API (uses getUserPlanTier) | `MOBILE/app/api/realtime/offer/route.ts`, `MOBILE/app/api/realtime/token/route.ts` |
| DB schema | `supabase/migrations/20241117_add_core_tables.sql` |

### 4) Classification of the issue

- **Backend persistence:** Supabase is updated correctly by the webhook. The **persistence** of plan in DB is not the bug.
- **Server tier resolution:** The bug is that **server-side plan is not read from the DB**. It is read from a server-local cache key that is never written, so it is always "free" (backend persistence is correct; backend **consumption** of that persistence is broken).
- **Client-side state:** The client never fetches plan from the backend and useAccountPlan always returns "free". So **client-side state is wrong** and never updated after checkout.
- **Fallback logic:** Fallback to "free" is correct when data is missing; the bug is that the **only** source the server uses is missing by design (never written), and the client never has a source that returns the paid plan.
- **Metadata not syncing:** Correct: Supabase metadata (subscriptions.plan) is not synced to (1) serverLocal cache, (2) client state, or (3) localStorage in a way that reflects the DB.
- **Cache invalidation:** There is no invalidation or refresh of plan after checkout or login; the "cache" (server local + client state) is never updated from the canonical source.

### 5) Why plan reverts to FREE

- **After checkout:** Webhook updates Supabase to pro/elite. No code updates serverLocal `subscriptions:userId` or client state. User lands on session with useAccountPlan still "free" and server APIs still using `getUserPlanTier` → "free". So the system "reverts" to FREE in all surfaces the app actually uses, even though DB has the new plan.
- **On every load:** useAccountPlan runs once and sets plan to "free". Session and other pages use that and/or MemoryProfile.plan. If the account-plan page effect runs, it syncs "free" from accountPlan.plan?.name into localStorage. So on subsequent loads, plan is still "free" unless the user never visited account-plan (and had some other way to have pro/elite in MemoryProfile.plan, which is not provided by current code).

### 6) Is Vella Voice access gating flawed?

- **Client-side gating:** The **logic** is correct: voice tools and startSession are gated on plan being pro/elite. Because the **plan** is always "free", the gate correctly blocks **everyone** (including paid users) from voice on the client. So the flaw is not "free users allowed"; it is "paid users incorrectly blocked" (and UI always shows free).
- **Server-side:** Realtime APIs use `getUserPlanTier` (always "free") for token limits, so paid users get free-tier limits and are not explicitly denied; they are just limited as if free. There is no server-side check that says "subscription is pro/elite, allow voice" — only token availability and admin policy. So entitlement is effectively "free" for everyone on the server.
- **Net:** Vella Voice gating is **flawed** in the sense that the **input** to the gate (plan) is wrong everywhere: server and client both see "free". So paid users cannot get paid voice experience, and if there were any path that treated "free" as allowed (e.g. view-only), free users would see that. The gate itself (pro/elite => allow) is consistent; the data feeding it is not.

---

*End of report. No fixes or refactors suggested; trace only.*
