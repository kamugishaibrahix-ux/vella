# Phase 2 — Decoupling Plan (Business Logic → Hooks)

**Mode:** Structural refactor  
**Goal:** Move business logic and data fetching out of pages/components into hooks. No behaviour change.

---

## STEP 1 — Coupling Heatmap

Scanned: `components/home/HomeClientPage.tsx`, `app/insights/page.tsx`, `app/session/page.tsx`, `app/profile/page.tsx`.

| Surface | Fetch Count | useEffect Count | Supabase Calls | Inline Logic Blocks | Local Storage Calls | Risk |
|---------|-------------|-----------------|----------------|---------------------|--------------------|------|
| Home (HomeClientPage) | 4 | 6 | 1 (getUser) | 4+ (getMoodSummary, getGreeting, formatPatternFallbackReason, fetchHighlightInsights; derived mood/energy) | 0 | High |
| Insights (page) | 8+ | 9 | 1 (getUser) | 10+ (traySnapshot, labels, buildRealtimeSnapshot, buildGeneratedSnapshot, reflection handling) | 0 | High |
| Profile (page) | 0 | 2 | 2 (signIn, signOut) | 4 (applyProfileUpdate, handleNameChange, handleSignIn, handleSignOut) | 2 (load/saveLocalMemory) | Medium |
| Session (page) | 3+ (policy, vella/text, pattern-insight) | 24 | 0 | Many (handleSend, history sync, token reconcile, voice mode persist) | 6+ (load/saveLocal, loadLocalMemory, saveLocalMemory, localStorage) | Very High |

**Definitions:**
- **Fetch Count:** Direct `fetch()` calls in the file.
- **useEffect Count:** Number of `useEffect(` blocks.
- **Supabase Calls:** Direct `supabase.*` usage.
- **Inline Logic Blocks:** Inline derived functions, handlers that contain business logic, or non-trivial useMemo/useCallback bodies that merge/fetch.
- **Local Storage Calls:** `loadLocal`, `saveLocal`, `loadLocalMemory`, `saveLocalMemory`, `localStorage.*`.

---

## Hook Contracts (Step 2)

- **useHomeDashboard** — `lib/hooks/useHomeDashboard.ts`  
  Returns: `state`, `error`, `data` (checkins, patternSnapshot, highlightInsights, prediction, forecast, mood summary, etc.), `actions`, `refresh`.

- **useInsightsDashboard** — `lib/hooks/useInsightsDashboard.ts`  
  Returns: `state`, `error`, `data` (insights, patterns, themes, lifeThemes, forecast, loops, distortions, identity, roadmap, extendedInsight), `actions`, `refresh`.

- **useProfileController** — `lib/hooks/useProfileController.ts`  
  Returns: `state`, `error`, `data` (memoryProfile, userEmail), `actions` (applyProfileUpdate, signIn, signOut, handleNameChange).

- **useSessionOrchestrator** — `lib/hooks/useSessionOrchestrator.ts`  
  Returns: `state`, `error`, `data` (history, adminPolicy, tokenSnapshot), `actions` (sendMessage, loadHistory, saveHistory, refreshPolicy). Does NOT own realtime hook, audio engine, or full rendering.

---

## Extraction Order

1. **Step 3:** Home → useHomeDashboard (supabase user, listCheckins, requestEmotionalPatterns, prediction, forecast, nudge, insights generate, derived mood/energy).
2. **Step 4:** Insights → useInsightsDashboard (all fetch calls, derived labels, data merging, useEffects).
3. **Step 5:** Profile → useProfileController (loadLocalMemory, applyProfileUpdate, signIn, signOut, local state).
4. **Step 6:** Session (partial) → useSessionOrchestrator (policy fetch, vella/text, pattern-insight, conversation send/receive, history load/saveLocal only).

---

## Completion Criteria

- Home page: minimal fetch/useEffect (delegated to useHomeDashboard).
- Insights page: minimal fetch/useEffect (delegated to useInsightsDashboard).
- Profile page: minimal logic (delegated to useProfileController).
- Session: partially thinned (orchestrator owns policy, text API, pattern-insight, history; realtime/audio/UI unchanged).
- Build passes.
- No behaviour change.
