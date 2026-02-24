# UI Deletion — Import Dependency Violations Audit (Read-Only)

**Mode:** STRICT READ-ONLY. No edits.  
**Goal:** Prove there are zero backend imports from UI-only paths beyond the identified issues.  
**Date:** 2025-02-21  

---

## Scan Scope

Searched for imports in **app/api/** and **server-only lib/** that reference:

- `components/`
- `app/**/page` (any app page)
- `lib/hooks/`
- Any `*.tsx` in `lib/` (except explicitly shared UI)
- `i18n/providers`
- Provider components

Also scanned for **Next special files:** `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx`, and `route.ts` (non-API).

---

## Scan Results Summary

- **app/api/** → **components/:** 0 imports.
- **app/api/** → **app/** (pages): 0 imports.
- **app/api/** → **lib/hooks/:** 1 import (type only): `app/api/insights/generate/route.ts` → `@/lib/hooks/useUserSettings`.
- **app/api/** → **i18n/providers:** 0 imports.
- **app/api/** → any **.tsx** in lib: 0 imports (no API file imports a `.tsx` path).
- **lib/** (files in API dependency tree) → **components/:** 0 imports.
- **lib/** → **app/** (pages): 0 imports.
- **lib/** → **lib/hooks/:** Multiple (all from `useUserSettings.ts` or other hooks; see table).
- **lib/** (server-used) → **lib/realtime/useRealtimeVella:** 2 imports (type only): `lib/ai/agents.ts`, `lib/insights/conversationBridge.ts` → type `RealtimeDeliveryMeta`.

**Next special files:**

- `loading.tsx`: **0** in app.
- `error.tsx`: **0** in app.
- `not-found.tsx`: **0** in app.
- `template.tsx`: **0** in app.
- `route.ts`: **83** files, all under **app/api/** (route handlers only; no UI routes).

---

## Import Dependency Violations Table

Every row is a **backend** (app/api or server-used lib) import from a **UI-only path** (client hook, client-only module, or UI-only file). Classification and fix are described; no patch applied.

| # | Importer file | Imported file / symbol | Why it's a problem | Fix required before deletion |
|---|----------------|------------------------|--------------------|------------------------------|
| 1 | `app/api/insights/generate/route.ts` | `@/lib/hooks/useUserSettings` (type `VellaSettings`) | API route imports from a `"use client"` hook module. Deleting `lib/hooks/` would break this route. | Move `VellaSettings` to a server-safe module (e.g. `lib/settings/vellaSettings.ts`); change import to that module. |
| 2 | `lib/ai/agents.ts` | `@/lib/hooks/useUserSettings` (`DEFAULT_VELLA_SETTINGS`, type `VellaSettings`) | Server-only lib (used by strategy, architect, compass, emotion-intel, clarity, deepdive API routes) imports from a client hook module. | Same as above: move type and constant to server-safe module; update `agents.ts` to import from there. |
| 3 | `lib/ai/agents.ts` | `@/lib/realtime/useRealtimeVella` (type `RealtimeDeliveryMeta`) | Server-only lib imports a type from a `"use client"` hook file. Deleting `useRealtimeVella.ts` with UI would break agents (and thus 6 API routes). | Move `RealtimeDeliveryMeta` type to a server-safe module (e.g. `lib/realtime/types.ts` or shared types); update `agents.ts` and `conversationBridge.ts` to import from there. |
| 4 | `lib/insights/conversationBridge.ts` | `@/lib/hooks/useUserSettings` (type `VellaSettings`) | Server-only lib (used by `lib/ai/agents.ts`, which is used by API) imports from client hook. | Same as #1/#2: move `VellaSettings` to server-safe module; update this file. |
| 5 | `lib/insights/conversationBridge.ts` | `@/lib/realtime/useRealtimeVella` (type `RealtimeDeliveryMeta`) | Server-only lib imports type from client hook file. | Same as #3: move `RealtimeDeliveryMeta` to server-safe module; update this file. |
| 6 | `lib/realtime/personaSynth.ts` | `@/lib/hooks/useUserSettings` (type `VellaSettings`) | Server-only lib (used by `app/api/insights/generate`, `app/api/insights/patterns`) imports from client hook. | Same as #1/#2: move `VellaSettings` to server-safe module; update this file. |

**Total: 6 violations.** All are either **lib/hooks/useUserSettings.ts** (type + default) or **lib/realtime/useRealtimeVella.ts** (type only). No backend imports from **components/**, **app/** pages, **i18n/providers**, or any provider component. No backend imports of **lib/** `.tsx` files (VellaProvider, lockState).

---

## UI-Like Files Outside UI Folders

### 1. Files under lib/ ending in .tsx that are not used by API routes

| File | Used by API? | Notes |
|------|--------------|--------|
| `lib/realtime/VellaProvider.tsx` | No | Only used by app layout and UI; not imported by any app/api or server lib. |
| `lib/security/lockState.tsx` | No | Only used by components (LockGate, LockScreen, modals, SecurityCard). |

Both are **UI-only** and safe to delete with the rest of the UX layer (after fixing violations so no server code depends on types from client modules).

### 2. Modules marked "use client" outside components/ or app/**/page.tsx

| File | Location | Used by API / server lib? |
|------|----------|---------------------------|
| `lib/hooks/useUserSettings.ts` | lib/hooks | Yes — type + default only (see violations). |
| `lib/hooks/useAccountPlan.ts` | lib/hooks | No. |
| `lib/hooks/useSessionOrchestrator.ts` | lib/hooks | No. |
| `lib/hooks/useInsightsDashboard.ts` | lib/hooks | No. |
| `lib/hooks/useHomeDashboard.ts` | lib/hooks | No. |
| `lib/hooks/useProfileController.ts` | lib/hooks | No. |
| `lib/hooks/useTokenUsage.ts` | lib/hooks | No. |
| `lib/hooks/useCheckins.ts` | lib/hooks | No (used by other hooks and localMemory only). |
| `lib/hooks/useJournal.ts` | lib/hooks | No. |
| `lib/realtime/realtimeClient.ts` | lib/realtime | No from API (only session page and components use it). |
| `lib/realtime/VellaProvider.tsx` | lib/realtime | No. |
| `lib/realtime/useRealtimeVella.ts` | lib/realtime | Yes — type `RealtimeDeliveryMeta` only (see violations). |
| `lib/tiers/featureGates.ts` | lib/tiers | No. |
| `lib/ai/reflectionClient.ts` | lib/ai | No. |
| `lib/ai/emotionalStyles.ts` | lib/ai | No. |
| `lib/insights/requestPatternsClient.ts` | lib/insights | No. |
| `lib/profile/upsertProfile.ts` | lib/profile | No. |
| `lib/memory/localMemory.ts` | lib/memory | No from API (used by UI and server actions only). |
| `lib/auth/ensureVellaSession.ts` | lib/auth | No. |
| `lib/auth/ensureSession.ts` | lib/auth | No. |
| `lib/local/resetCheckinHistory.ts` | lib/local | No. |
| `lib/security/lockState.tsx` | lib/security | No. |
| `lib/supabase/client.ts` | lib/supabase | No (client Supabase; API uses server/admin). |
| `lib/local/vellaLocalProfile.ts` | lib/local | No. |
| `lib/connection/getConnectionIndex.ts` | lib/connection | No. |

**App file (use client, not a page):**

| File | Notes |
|------|--------|
| `app/insights/ClientInsightsPage.tsx` | `"use client"`; used by insights page (or similar); not a route handler. UI-only. |

---

## Final Revised Deletion Boundary

### Safe to delete (after fixing violations)

- **components/** — entire directory.
- **app/** — all `page.tsx`, all `layout.tsx` (replace root with minimal layout if needed for build), and any non-API client components (e.g. `app/insights/ClientInsightsPage.tsx`).
- **lib/hooks/** — entire directory **after** moving `VellaSettings` and `DEFAULT_VELLA_SETTINGS` to a server-safe module and updating backend imports.
- **lib/ui/** — entire directory.
- **lib/realtime/VellaProvider.tsx** and **lib/realtime/useRealtimeVella.ts** — **after** moving type `RealtimeDeliveryMeta` to a server-safe module and updating `lib/ai/agents.ts` and `lib/insights/conversationBridge.ts`.
- **lib/security/lockState.tsx** — not used by API; safe to delete with UI.
- **lib/realtime/realtimeClient.ts** — only used by UI; safe to delete with UI.
- Other **"use client"** modules in lib that are only used by UI (see list above): e.g. useAccountPlan, useSessionOrchestrator, useInsightsDashboard, useHomeDashboard, useProfileController, useTokenUsage, useCheckins, useJournal, featureGates, reflectionClient, emotionalStyles, requestPatternsClient, upsertProfile, localMemory, ensureVellaSession, ensureSession, resetCheckinHistory, vellaLocalProfile, getConnectionIndex; **lib/supabase/client.ts** is client-only but may be needed by a minimal auth flow — confirm before deletion.
- **styles/** — globals and voice CSS when no UI remains.
- **i18n/providers.tsx**, **i18n/useLocale.ts** — UI-only.
- **public/** — optional assets.

### Must keep

- **app/api/** — all route handlers (all 83 `route.ts` files and any supporting files under app/api).
- **middleware.ts** — maintenance mode and webhook allowlist.
- **lib/** — all server-used business logic **except**:
  - `lib/hooks/` (after moving type + default out),
  - `lib/ui/`,
  - `lib/realtime/VellaProvider.tsx`, `lib/realtime/useRealtimeVella.ts` (after moving `RealtimeDeliveryMeta` out),
  - `lib/realtime/realtimeClient.ts` (if deleting with UI),
  - `lib/security/lockState.tsx`,
  - and other client-only modules listed above that are not in the API dependency tree.
- **i18n/serverLocale.ts**, **i18n/config.ts**, **i18n/types.ts**, **i18n/dictionaries/** — used by API.
- Supabase/Stripe/Next config and env used by API.

### Required refactors before deletion (classification only)

1. **VellaSettings + DEFAULT_VELLA_SETTINGS:** Define (or re-export) in a server-safe module; update import in `app/api/insights/generate/route.ts`, `lib/ai/agents.ts`, `lib/insights/conversationBridge.ts`, `lib/realtime/personaSynth.ts`, and optionally `lib/realtime/realtimeClient.ts` and `lib/realtime/VellaProvider.tsx` if kept temporarily.
2. **RealtimeDeliveryMeta:** Define in a server-safe module (e.g. `lib/realtime/types.ts`); update import in `lib/ai/agents.ts` and `lib/insights/conversationBridge.ts`.

After these two refactors, there are **zero** backend imports from UI-only paths, and the deletion boundary above is safe.

---

**No code was modified or deleted in this audit.**
