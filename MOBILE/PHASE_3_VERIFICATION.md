# Phase 3 Journal — Verification Checklist

Use this checklist to verify that journal is client-owned, reliable, and consistent with privacy design. No server persistence of journal text.

---

## Manual verification

- [ ] **Create journal entry** → Entry appears immediately in the list (no full-page refresh).
- [ ] **Refresh page** → Entry persists (list still shows it; data from localStorage).
- [ ] **Open `/journal/[id]`** → Correct entry loads (by id from local store).
- [ ] **Update entry** → Changes persist; after refresh, updated content is shown.
- [ ] **Delete entry** → Entry is removed; after refresh, it stays removed.
- [ ] **No network calls for journal CRUD** → In browser DevTools (Network tab), confirm that list/create/update/delete do **not** trigger requests to `/api/journal` (optional: you may see other app requests; journal CRUD must be local only).

---

## Build

- [ ] **`pnpm run build`** passes (run from `MOBILE/`).

---

## Completion criteria (from plan)

Phase 3 is complete only if:

- Journal list/create/update/delete are client-only (useJournal / localStorage).
- SSR journal fetch removed from `/journal` page.
- No fake “saved” behaviour; persistence is localStorage only.
- Journal persistence proven by refresh (list and detail).
- `pnpm run build` passes.
- Plan (`PHASE_3_JOURNAL_BOUNDARY_PLAN.md`) and this verification doc exist.

Do not proceed to Phase 4 until all items above are satisfied.
