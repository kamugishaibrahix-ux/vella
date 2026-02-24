# Journal UX Removal — Backend Preserved

**Mode:** Surgical removal of Journal UI only. No backend changes.

---

## File tree diff

### Deleted

| File | Description |
|------|-------------|
| `app/components/journal/HighlightedTextarea.tsx` | Textarea with keyword highlighting (consent UI). |
| `app/components/journal/ResolutionJournalForm.tsx` | Resolution journal form (clarity pills, consent, three sections). |
| `app/components/journal/EntryHistory.tsx` | Entry list grouped by week, date, step-forward highlight. |
| `app/components/journal/index.ts` | Barrel exports for journal components. |
| `lib/journal/journalKeywords.ts` | Client-side keyword patterns for highlight (used only by removed UI). |

### Replaced (placeholder only)

| File | Before | After |
|------|--------|-------|
| `app/journal/page.tsx` | Full Resolution Journal page (form, draft, save, API call, history button). | Minimal page: centered “Journal rebuilding…” |
| `app/journal/history/page.tsx` | Full-screen history (Back, EntryHistory, localStorage). | Minimal page: centered “Journal rebuilding…” |

---

## List of deleted files

1. `app/components/journal/HighlightedTextarea.tsx`
2. `app/components/journal/ResolutionJournalForm.tsx`
3. `app/components/journal/EntryHistory.tsx`
4. `app/components/journal/index.ts`
5. `lib/journal/journalKeywords.ts`

**Removed from pages (replaced with placeholder):** All logic and UI in `app/journal/page.tsx` and `app/journal/history/page.tsx` (no separate files deleted for “tabs” or “Insights/System inside Journal” — none were present).

---

## Unused imports and references

- **Removed:** All imports of `@/app/components/journal` (only used by the two journal pages; both now placeholder).
- **Removed:** Use of `lib/journal/journalKeywords` (only used by deleted `HighlightedTextarea`).
- **Nav/links:** `BottomNav`, `MobileShell`, `home/page` still link to `/journal`; they route to the new placeholder. No changes required.
- **No remaining references** to deleted journal components elsewhere in the app.

---

## Routing

- `/journal` → placeholder page (“Journal rebuilding…”). Route intact.
- `/journal/history` → placeholder page. Route intact.
- No 404s from journal routes.

---

## Backend and API untouched

- **`/api/journal`** (GET, POST, PUT, PATCH) — not modified.
- **`/api/journal/console`**, **`/api/journal/preview`**, **`/api/journal-themes`** — not modified.
- **`lib/journal/*`** (except deleted `journalKeywords.ts`) — **unchanged:**  
  `server.ts`, `db.ts`, `types.ts`, `mapJournalToEvents.ts`, `summarizeJournal.ts`, `extractEmotionTags.ts`, `tagLifeThemes.ts`, `detectLoopsInText.ts`, `detectDistortionsInText.ts`, `extractTraitMarkers.ts`, `generateFollowUpQuestions.ts`, `generateMicroInsights.ts`, etc.
- **Supabase schema** — not modified.
- **Enrichment modules** — not modified.
- **Event mappers** (`mapJournalToEvents`) — not modified.
- **Governance state / focus engine / recomputeState()** — not modified.

---

## Build note

- `pnpm run build` failed with `EPERM` on `.next/trace` (filesystem/permission). This is environmental, not caused by the journal UX removal.
- No new TypeScript errors were introduced in journal or app code; existing tsc errors are in other areas (vella route, tests, etc.).

Journal UX removal is complete; backend and API remain untouched.
