# Vella MOBILE — UI Layer Deletion Read-Only Audit

**Mode:** STRICT READ-ONLY (no code changes, no deletions)  
**Goal:** Determine whether the entire Vella MOBILE UI layer can be deleted cleanly without breaking backend, API, auth, subscriptions, memory, or state logic.  
**Date:** 2025-02-21  

---

## Executive Summary

**Verdict: Safe to delete UX entirely only after one required refactor.**

- **Backend ↔ UI coupling:** API routes and server logic do **not** import from `components/` or from App Router pages/layouts. UI calls APIs via `fetch("/api/...")`; APIs never depend on React components or pages.
- **Single blocker:** The type `VellaSettings` and constant `DEFAULT_VELLA_SETTINGS` are defined in `lib/hooks/useUserSettings.ts` (a client-only hook file) but are imported by **API** (`app/api/insights/generate/route.ts`) and by **lib** (`lib/ai/agents.ts`, `lib/insights/conversationBridge.ts`, `lib/realtime/personaSynth.ts`, `lib/realtime/realtimeClient.ts`, `lib/realtime/VellaProvider.tsx`, `lib/realtime/useRealtimeVella.ts`). Deleting `lib/hooks/` without moving these exports would break the backend.
- **Plan / auth / governance:** `getUserPlanTier`, `resolveMode`, `computeGovernanceState`, `supabaseAdmin`, memory embed/reindex, and Stripe webhook are used only in `app/api/**` and `lib/**`; **no** usage inside `components/`. Safe to delete UI from a logic perspective.
- **Tests:** No test file imports from `@/components/` or from app pages; tests import only from `@/app/api/**` route handlers. Deleting UI does not break existing API tests.
- **Required before deletion:** Extract `VellaSettings` (type) and `DEFAULT_VELLA_SETTINGS` (constant) from `lib/hooks/useUserSettings.ts` into a server-safe module (e.g. `lib/settings/vellaSettings.ts` or `lib/vella/settings.ts`) and update the six backend import sites. After that, the UX surface below can be deleted without breaking backend, API, auth, subscriptions, memory, or state logic.

---

## Step 1 — UI-Only File Tree & Classification

### app/ (App Router)

| Path pattern | Type | Pure UI? | Contains business logic? | Safe to delete? |
|--------------|------|----------|---------------------------|-----------------|
| `app/api/**/*.ts` | API route handlers | No | Yes (server) | **MUST KEEP** |
| `app/layout.tsx` | Root layout | Yes | No (wraps providers only) | Yes |
| `app/onboarding/layout.tsx` | Layout | Yes | No | Yes |
| `app/page.tsx` | Page (redirect to /home) | Yes | No | Yes |
| `app/home/page.tsx` | Page | Yes | No | Yes |
| `app/session/page.tsx` | Page | Yes | No | Yes |
| `app/onboarding/**/page.tsx` (all) | Pages | Yes | No | Yes |
| `app/(site)/privacy/page.tsx` | Page | Yes | No | Yes |
| `app/check-in/page.tsx`, `app/journal/page.tsx`, `app/journal/[id]/page.tsx` | Pages | Yes | No | Yes |
| `app/insights/page.tsx`, `app/identity/page.tsx`, `app/loops/page.tsx`, `app/themes/page.tsx` | Pages | Yes | No | Yes |
| `app/regulation/page.tsx`, `app/distortions/page.tsx`, `app/growth-roadmap/page.tsx`, `app/growth-plan/page.tsx` | Pages | Yes | No | Yes |
| `app/forecast-center/page.tsx`, `app/connection-index/page.tsx`, `app/compass-mode/page.tsx`, `app/timeline/page.tsx` | Pages | Yes | No | Yes |
| `app/profile/page.tsx`, `app/settings/account-plan/page.tsx`, `app/pricing/page.tsx` | Pages | Yes | No | Yes |
| `app/session-insights/page.tsx`, `app/exercises/page.tsx` | Pages | Yes | No | Yes |
| `app/dev/biometric-test/page.tsx` | Page | Yes | No | Yes |

**Counts:** 35 `page.tsx` files (all UI), 2 `layout.tsx` (UI), ~85+ files under `app/api/**` (keep).

### components/

All 137+ files under `components/` are React UI components. No API route or server-only lib file imports from `@/components/`.

| Directory | Role | Pure UI? | Safe to delete? |
|-----------|------|----------|-----------------|
| `components/auth/` | Auth bootstrap / session UI | Yes | Yes |
| `components/security/` | Lock screen, PIN, biometrics UI | Yes | Yes |
| `components/migration/` | Migration guard / required screen | Yes | Yes |
| `components/chat/` | Chat panel / messages | Yes | Yes |
| `components/voice/` | Voice stage, sheets, chips | Yes | Yes |
| `components/home/` | Home dashboard cards | Yes | Yes |
| `components/check-in/` | Check-in sliders, cards | Yes | Yes |
| `components/journal/` | Journal list, editor, client | Yes | Yes |
| `components/insights/` | Insight cards, heatmaps | Yes | Yes |
| `components/settings/` | Settings cards, modals | Yes | Yes |
| `components/loops/`, `components/themes/`, `components/identity/`, `components/regulation/`, etc. | Feature UI | Yes | Yes |
| `components/ui/` | Buttons, modals, sheets, chips | Yes | Yes |
| `components/layout/` | App shell, nav, logo | Yes | Yes |
| `components/modals/`, `components/common/`, `components/celebration/`, `components/audio/`, `components/dev/` | UI | Yes | Yes |

### lib/hooks/

| File | Pure UI? | Used by backend? | Safe to delete? |
|------|----------|------------------|-----------------|
| `lib/hooks/useUserSettings.ts` | No (exports type + default used by API/lib) | Yes — type `VellaSettings` + `DEFAULT_VELLA_SETTINGS` | **No** — keep or move exports first |
| `lib/hooks/useAccountPlan.ts` | Yes (React hook) | No (only UI) | Yes |
| `lib/hooks/useCheckins.ts` | Yes (React + `listCheckins` used by lib/memory/localMemory and other hooks) | No from API (API uses `lib/checkins/getAllCheckIns`) | Yes* |
| `lib/hooks/useSessionOrchestrator.ts` | Yes | No | Yes |
| `lib/hooks/useJournal.ts` | Yes | No | Yes |
| `lib/hooks/useInsightsDashboard.ts` | Yes | No | Yes |
| `lib/hooks/useHomeDashboard.ts` | Yes | No | Yes |
| `lib/hooks/useProfileController.ts` | Yes | No | Yes |
| `lib/hooks/useTokenUsage.ts` | Yes | No | Yes |

\* `useCheckins` is used by `lib/memory/localMemory.ts` and `lib/progress/updateProgress.ts`; those are used by client/server actions and UI, not by `app/api/**`. So deleting hooks would require removing or refactoring those callers when UI is removed; they are not used by API route handlers.

### lib/ui/

| File | Pure UI? | Used by backend? | Safe to delete? |
|------|----------|------------------|-----------------|
| `lib/ui/motion.ts` | Yes (motion helpers) | No | Yes |

### Stores (UI vs backend)

Stores under `lib/` used by backend (rate limit, circuit breaker, migration, etc.) are in `lib/security/`, `lib/ai/circuitBreaker/`, `lib/migration/client/`, etc. They are **not** inside a dedicated `stores/` UI folder. No `stores/` directory at repo root; UI state is in hooks and component state. Safe to delete all UI; no separate “UI stores” directory to list.

### Styles

| Path | Used by | Safe to delete? |
|------|---------|-----------------|
| `styles/globals.css` | Layout + all pages | Yes (if deleting all UI) |
| `styles/voice.css` | Voice UI | Yes |

### i18n

| Path | Used by API? | Safe to delete? |
|------|--------------|-----------------|
| `i18n/serverLocale.ts` | Yes (roadmap, forecast, pattern-insight, insights/generate, reflection) | **MUST KEEP** |
| `i18n/config.ts` | Yes (pattern-insight) | **MUST KEEP** |
| `i18n/types.ts` | Yes (UILanguageCode etc.) | **MUST KEEP** |
| `i18n/dictionaries/*.ts` | Yes (serverLocale loads dictionaries) | **MUST KEEP** |
| `i18n/providers.tsx` | No (layout only) | Yes |
| `i18n/useLocale.ts` | No (UI only) | Yes |

### Public

| Path | Role | Safe to delete? |
|-----|------|-----------------|
| `public/logo-vella.svg` | Favicon / app icon | Yes (optional asset) |

---

## Step 2 — Backend → UI Coupling

**Finding: No API route or server-only lib imports from `components/` or from app pages/layouts.**

| File | Coupling type | Risk level |
|------|----------------|------------|
| `app/api/insights/generate/route.ts` | Imports **type** `VellaSettings` from `@/lib/hooks/useUserSettings` | **Medium** — type lives in a "use client" hook file; must move type (and default) to server-safe module before deleting hooks. |
| All other `app/api/**` routes | Import only from `@/lib/**`, `@/i18n/serverLocale`, `@/i18n/config`, `@/i18n/types` | None |
| `lib/**` | No imports from `@/components/` or `@/app/` (except layout, which is UI) | None |

**UI → backend:** Components call `fetch("/api/...")` (e.g. migration complete, transcribe, reports/create, feedback/create, deepdive). Direction is UI → API only; no circular dependency.

**Direct Supabase in UI:** `MigrationGuard` uses `@/lib/supabase/client` for client-side checks. Deleting components removes that usage; no API depends on it.

**Governance / Stripe / memory in UI:** No `getUserPlanTier`, `resolveMode`, `computeGovernanceState`, `supabaseAdmin`, or memory embed/reindex usage in `components/`. Plan resolution and auth state are server-side only.

---

## Step 3 — Shared Utilities Used by Backend

Files under MOBILE that are **used by API routes**, Stripe webhook, state engine, governance, or memory:

- All of `app/api/**` — **MUST KEEP.**
- `lib/` — Almost all of `lib/` is used by API or by other lib (ai, auth, checkins, governance, memory, payments, security, supabase, tiers, tokens, etc.). **MUST KEEP** except:
  - `lib/hooks/` — Only **exports** from `useUserSettings.ts` (type `VellaSettings` + `DEFAULT_VELLA_SETTINGS`) are used by backend; the hook implementation is UI-only. So: either **keep** `lib/hooks/useUserSettings.ts` or **move** those exports to e.g. `lib/settings/vellaSettings.ts` and then `lib/hooks/` can be deleted with UI.
- `lib/realtime/` — Used by `app/api/insights/generate`, `app/api/insights/patterns`, `app/api/realtime/token`, `app/api/realtime/offer` (personaSynth, deliveryEngine, emotion/state, vellaRealtimeConfig). **MUST KEEP** (entire directory for backend). `VellaProvider.tsx` and `useRealtimeVella.ts` are only used by UI; they can be deleted with UI, but the rest of `lib/realtime/` must stay.
- `i18n/serverLocale.ts`, `i18n/config.ts`, `i18n/types.ts`, `i18n/dictionaries/*` — **MUST KEEP.**

| File / dir | Imported by (backend) | Critical? |
|------------|------------------------|-----------|
| `lib/hooks/useUserSettings.ts` (type + default only) | `app/api/insights/generate`, `lib/ai/agents`, `lib/insights/conversationBridge`, `lib/realtime/personaSynth`, `lib/realtime/realtimeClient`, `lib/realtime/VellaProvider`, `lib/realtime/useRealtimeVella` | **Yes** — do not delete without moving exports |
| `lib/realtime/*` (except VellaProvider, useRealtimeVella) | API routes above | **Yes** |
| `i18n/serverLocale`, `i18n/config`, `i18n/types`, `i18n/dictionaries` | API routes | **Yes** |
| No shared util lives **inside** `components/` or `app/` (non-api) that backend needs | — | — |

---

## Step 4 — App Router Critical Dependencies

- **middleware.ts:** Imports only `@/lib/security/killSwitch` (`isMaintenanceMode`). No UI. **MUST KEEP**; required for maintenance mode and Stripe webhook allowlist.
- **Route handlers:** All under `app/api/**`; no dependency on layout or providers.
- **Layout required for API?** No. API routes do not render layout; they return JSON.
- **Global providers (auth, Supabase, context):** Used only by root layout for **page** rendering (`AuthBootstrapper`, `SessionBootstrap`, `LockGate`, `MigrationGuard`, `VellaProvider`, `LanguageProvider`). They are **not** required for API context. Deleting layout and pages removes the need for these providers; auth for API is via `requireUserId()` and Supabase server/client in lib.
- **Conclusion:** Deleting all pages and layout wrappers does **not** break API, auth, or server-only code. Next.js still requires a root `app/layout.tsx` to build; it can be replaced with a minimal layout (e.g. `<html><body>{children}</body></html>`) if all routes are API-only, or a single minimal page for health check.

---

## Step 5 — Plan / Auth Coupling

Confirmed:

- **getUserPlanTier** — Used only in `app/api/**` and lib (e.g. tiers/server). Not used in any component.
- **resolveMode** — Used in `app/api/vella/text/route.ts` (lib/ai/modeResolver). Not in UI.
- **computeGovernanceState** — Used in `app/api/vella/text/route.ts` and `app/api/internal/governance/daily/route.ts`. Not in UI.
- **supabaseAdmin** — Used only in `app/api/**`. Not in UI.
- **memory/embed, memory/reindex** — Used in `app/api/memory/embed/route.ts` and `app/api/memory/reindex/route.ts`. Not in UI.
- **Webhook handlers** — Stripe webhook is in `app/api/stripe/webhook/route.ts`; uses lib only. Not in UI.

Plan resolution and auth state resolution are server-side only. No critical logic is triggered from UI mount for these flows.

---

## Step 6 — Safe Deletion Boundary

### SAFE TO DELETE (after moving VellaSettings + DEFAULT_VELLA_SETTINGS)

- All React components under **`components/`** (entire directory).
- All App Router **pages** (all `app/**/page.tsx` except any kept for a minimal “API-only” landing if desired).
- All **layout** wrappers (app/layout.tsx and app/onboarding/layout.tsx can be removed; replace root with minimal layout if needed for build).
- All **client-only hooks** under `lib/hooks/` **after** moving `VellaSettings` and `DEFAULT_VELLA_SETTINGS` to a server-safe module (see below).
- **lib/ui/** (motion).
- **Styles:** `styles/globals.css`, `styles/voice.css`.
- **i18n UI-only:** `i18n/providers.tsx`, `i18n/useLocale.ts` (if no remaining UI).
- **Public:** `public/logo-vella.svg` (optional).
- Modals, navigation, and any other UI-only code under the above trees.

### MUST KEEP

- **`app/api/`** — entire directory (all route handlers).
- **`lib/`** — all business logic except:
  - `lib/hooks/` — only after extracting type + default from `useUserSettings.ts` into e.g. `lib/settings/vellaSettings.ts` (or similar) and updating imports in:
    - `app/api/insights/generate/route.ts`
    - `lib/ai/agents.ts`
    - `lib/insights/conversationBridge.ts`
    - `lib/realtime/personaSynth.ts`
    - `lib/realtime/realtimeClient.ts`
    - `lib/realtime/VellaProvider.tsx` (can be deleted with UI; then no update needed for this file)
    - `lib/realtime/useRealtimeVella.ts` (can be deleted with UI; then no update needed)
- **`middleware.ts`** — required for maintenance mode and webhook allowlist.
- **i18n:** `serverLocale.ts`, `config.ts`, `types.ts`, `dictionaries/*`.
- Supabase config, Stripe config, and any env/next config used by API.

### Optional (for a headless app)

- Replace `app/layout.tsx` with a minimal root layout so the app still builds.
- Keep a single minimal `app/page.tsx` that returns a simple “API-only” or health message if you want a root URL response; otherwise redirect or 404 is fine.

---

## Step 7 — Deletion Plan

1. **Before any UI deletion:**
   - Create e.g. `lib/settings/vellaSettings.ts` (or `lib/vella/settings.ts`).
   - Move `VellaSettings` type and `DEFAULT_VELLA_SETTINGS` from `lib/hooks/useUserSettings.ts` into this file (re-export or define there).
   - Update imports in:
     - `app/api/insights/generate/route.ts`
     - `lib/ai/agents.ts`
     - `lib/insights/conversationBridge.ts`
     - `lib/realtime/personaSynth.ts`
     - `lib/realtime/realtimeClient.ts`
   - After that, `lib/realtime/VellaProvider.tsx` and `lib/realtime/useRealtimeVella.ts` can be deleted with UI; if deleted, no need to update their imports.

2. **Exact directories safe to delete (after step 1):**
   - `MOBILE/components/` (entire directory)
   - All `app/**/page.tsx` (every page file)
   - `app/layout.tsx` and `app/onboarding/layout.tsx` (replace root with minimal layout)
   - `lib/hooks/` (entire directory)
   - `lib/ui/`
   - `styles/` (if no remaining UI)
   - `i18n/providers.tsx`, `i18n/useLocale.ts`
   - Optionally `public/` or specific assets

3. **Exact files/dirs to preserve:**
   - `app/api/**` (all)
   - `lib/**` except `lib/hooks/` and `lib/ui/` (and after refactor, hooks can go)
   - `lib/realtime/*` except `VellaProvider.tsx` and `useRealtimeVella.ts` (optional to delete with UI)
   - `middleware.ts`
   - `i18n/serverLocale.ts`, `i18n/config.ts`, `i18n/types.ts`, `i18n/dictionaries/`
   - Next/supabase/Stripe config and env

4. **Tests:** No test file imports from `@/components/` or app pages. Tests import only from `@/app/api/**`. Deleting UI does not break existing API tests. If any future tests reference UI, they would need to be removed or adjusted with the UI deletion.

5. **Shared utils in UI folder:** None. No backend-critical shared util lives under `components/` or under app (non-api).

---

## Step 8 — Risk Classification

| Item | Status |
|------|--------|
| **Safe to delete UX entirely** | **YES**, after one refactor |
| **Required refactor before deletion** | Move `VellaSettings` and `DEFAULT_VELLA_SETTINGS` from `lib/hooks/useUserSettings.ts` to a server-safe module; update 5 backend import sites (6 if keeping VellaProvider/useRealtimeVella). |
| **Risk areas** | (1) Accidentally deleting or editing `app/api/**` or `lib/**` business logic. (2) Forgetting to keep `i18n/serverLocale`, `config`, `types`, `dictionaries`. (3) Removing root `app/layout.tsx` without replacing with a minimal layout (build may require it). |
| **Hidden coupling** | None found. No API or server lib imports from components or pages. The only backend dependency on a “UI-ish” path is the type/default in `useUserSettings.ts`. |
| **Steps to isolate backend cleanly** | (1) Extract VellaSettings + DEFAULT_VELLA_SETTINGS to e.g. `lib/settings/vellaSettings.ts`. (2) Update backend imports. (3) Delete `components/`, all app pages and layout wrappers, `lib/hooks/`, `lib/ui/`, optional `lib/realtime/VellaProvider.tsx` and `useRealtimeVella.ts`. (4) Replace root layout with minimal layout. (5) Run API and integration tests to confirm. |

---

## Clean Rebuild Readiness Verdict

- **Backend, API, auth, subscriptions, memory, and state logic** can remain intact while the entire UX layer (components, pages, layout wrappers, client hooks, UI stores, styles, modals, navigation) is removed.
- **One prerequisite:** Move `VellaSettings` and `DEFAULT_VELLA_SETTINGS` out of `lib/hooks/useUserSettings.ts` into a server-safe module and update backend imports. After that, the deletion boundary above is safe and the backend is cleanly isolated from UI.
- **No code was modified or deleted in this audit.**
