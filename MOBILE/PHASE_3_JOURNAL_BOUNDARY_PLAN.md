# Phase 3: Journal Boundary Plan — Client-Owned, No Server Persistence

## Guardrails (Step 0)

- Do not store journal text in Supabase.
- Do not introduce server persistence.
- Do not break token engine, auth, billing.
- Do not redesign UI.

---

## Step 1 — Journal Data Flow Audit

### Search results summary

| Location | Usage | Server or Client | Must Change? |
|----------|--------|------------------|--------------|
| `app/journal/page.tsx` | SSR `fetch(\`${baseUrl}/api/journal\`)` | Server | **Yes** — Remove SSR fetch; use client-only data |
| `app/journal/[id]/page.tsx` | `getJournalEntry`, `updateEntry`, `deleteEntry` from `@/lib/hooks/useJournal` | Client | **No** — Already client-owned (local) |
| `components/journal/JournalPageClient.tsx` | `fetch("/api/journal", { method: "POST", ... })` for create; receives `entries` from server | Client (calls API) | **Yes** — Create/update/delete via hook only; list from `useJournal()` |
| `app/timeline/page.tsx` | `listJournal({ limit: 40 })` | Client | **No** — Already uses local `listJournal()` |
| `lib/hooks/useJournal.ts` | `listJournal()`, `addJournal()`, `deleteJournal()`, `getJournalEntry()`, `updateEntry()` — all use `journalLocal` | Client | **No** — Source of truth for client |
| `lib/hooks/useInsightsDashboard.ts` | `fetch("/api/journal-themes", ...)` with `userId` | Client | **No** (see Step 4) — API returns empty themes when server has no journal data; document only |
| `app/api/journal/route.ts` | GET/POST/PUT/PATCH use `listJournalEntries`, `createJournalEntry`, `updateJournalEntry`, `getJournalEntry` from `lib/journal/server` | Server | **Yes** — Stop UI from calling for CRUD; Option A or B (see Step 3) |
| `lib/journal/server.ts` | Delegates to `journalLocal` (listLocalJournals etc.) | Server | **Note** — On server, `loadLocal` has no `window`; server effectively sees no journal data. API is only useful for enrichment or deprecated. |
| `lib/connection/depthEngine.ts` | `listJournalEntries(userId, 30)` | Server | **No** (downstream) — Will get empty list; document in Step 4 |
| `lib/progress/updateProgress.ts` | `listJournalEntries(userId, 20)` | Server | **No** (downstream) — Same |
| `lib/insights/deepInsights.ts` | `listJournalEntries(userId)` | Server | **No** (downstream) — Same |
| `lib/social/buildSocialModel.ts` | `listJournalEntries(userId)` | Server | **No** (downstream) — Same |
| `lib/sleep/buildSleepEnergyModel.ts` | `listJournalEntries(userId)` | Server | **No** (downstream) — Same |
| `lib/behaviour/buildBehaviourMap.ts` | `listJournalEntries(userId)` | Server | **No** (downstream) — Same |
| `lib/progress/calculateProgress.ts` | `listJournalEntries(userId, 100)` | Server | **No** (downstream) — Same |
| `app/api/journal-themes/route.ts` | Calls `analyseJournalEntries(userId)` | Server | **No** (downstream) — Gets empty on server; document |
| `lib/insights/journalAnalysis.ts` | `fetchJournalEntries(userId)` → `listLocalJournals(userId)` on server | Server | **No** — Server has no localStorage; returns [] already |
| `test/api/validationIntegration.test.ts` | Mocks `@/lib/journal/server`, tests POST/PUT | Test | **No** — Tests can stay; API routes remain for optional enrichment |

### Conclusion

- **Must change:** `app/journal/page.tsx` (remove SSR fetch), `components/journal/JournalPageClient.tsx` (use `useJournal()` for list + create; no API calls for CRUD).
- **Already client-owned:** `app/journal/[id]/page.tsx`, timeline `listJournal()`.
- **API routes:** Repurpose per Step 3 (Option A: stop UI usage; Option B: enrichment-only). No server storage of journal text.

---

## Step 2 — Convert Journal Pages to Client-Owned Data

### 2.1 `/journal` page

- **Current problem:** SSR fetches `GET /api/journal` and passes `entries` into `JournalPageClient`; client creates via `POST /api/journal`.
- **Fix:**
  - Convert to a **thin server page** that only handles locale/cookies and renders a **client component** that owns all data.
  - Client component uses `useJournal()` for list; create/update/delete via hook actions only (no API).
  - No SSR dependency on journal data: no `fetchJournalEntries()` on the server.

**Implementation:**

- `app/journal/page.tsx`: Only resolve locale and render `<JournalPageClient />` with no `entries`/`initialError` from server. Optionally pass locale/dict only.
- `JournalPageClient`: Use `useJournal()` for `data`, `loading`, `error`, `add`, `remove`, `refresh`. On create, call `add({ content, title })`; do not call `fetch("/api/journal")`. Render `JournalList entries={data}` (or map to `JournalEntryRecord`-compatible shape). Handle missing-entry and errors from hook state only.

### 2.2 `/journal/[id]` page

- **Current state:** Already client-only. Uses `getJournalEntry(entryId)`, `updateEntry(entryId, content)`, `deleteEntry(entryId)` from `@/lib/hooks/useJournal` (local).
- **Action:** No code change required. Confirm no server fetch and no API call for load/update/delete.

---

## Step 3 — Repurpose `/api/journal` Routes

**Decision: Option A (cleanest for Phase 3)** — Remove journal CRUD usage from UI entirely.

- Keep API routes in codebase but **do not call them from the journal UI** for list/create/update/delete.
- Mark in plan: API is **deprecated for CRUD**; may be used later for **enrichment-only** (Option B) if we add a dedicated enrichment endpoint that accepts `{ text }` and returns `{ summary, tags, themes, titleSuggestion }` without storing anything.

**If Option B is adopted later:**

- New or repurposed endpoint: e.g. `POST /api/journal/enrich` with body `{ text }`, response `{ summary, tags, themes, titleSuggestion }`.
- No storage of text server-side; rate-limited and validated; token usage accounted for if applicable.
- Client would merge enrichment into local journal entry only.

---

## Step 4 — Downstream Consumers (Minimal Safe Fix)

Server-side features that call `listJournalEntries` / `listLocalJournals(userId)` on the server:

- **Reality:** On the server there is no `window`; `loadLocal` in `safeLocalStore` returns fallback (e.g. empty array). So these already get empty journal results.
- **insights generation, theme extraction, timeline aggregation, memory snapshots:** Either already use check-ins/session metadata or get empty journal list. No change required for MVP.
- **Insights page:** Does not depend on server-side journal list for **core load**. It can load without journal data. Journal-themes API (`/api/journal-themes`) calls `analyseJournalEntries(userId)` which uses `listLocalJournals(userId)` on the server → empty array → returns empty themes or “Still gathering data”. **Minimal fix:** Document only. No code change. If we later want themes from journal, we must either disable server-side journal-themes or accept client-provided entries (e.g. client sends derived signals or themes only, not raw text); do not store journal text on server.

**Documented decision:** For Phase 3 MVP, Insights and journal-themes continue to run; they receive empty journal data on the server and degrade gracefully. No removal of journal-dependence on server-side for Phase 3; no new client-provided journal payloads.

---

## Step 5 — Verification

See **MOBILE/PHASE_3_VERIFICATION.md** for the checklist.

---

## Completion Criteria

Phase 3 is complete only if:

- Journal list/create/update/delete are client-only (useJournal / journalLocal).
- SSR journal fetch removed from `/journal` page.
- No fake “saved” behaviour; persistence is localStorage only.
- Journal persistence proven by refresh (list and detail).
- `pnpm run build` passes.
- This plan and the verification doc exist.

Do not proceed to Phase 4.
